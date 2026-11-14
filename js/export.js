"use strict";
/* Eksport wideo klatka po klatce (WebCodecs + muxer MP4).

   Zamiast nagrywać ekran w czasie rzeczywistym (MediaRecorder), rysujemy każdą
   klatkę filmu dla dokładnie wyliczonego czasu t = numer_klatki / 30 s i od razu
   ją kodujemy. Skutki:
   - film ma zawsze równe 30 kl./s, bez zgubionych klatek na wolnym telefonie,
   - eksport nie musi trwać tyle, ile film (szybki sprzęt koduje szybciej),
   - wynik to zawsze MP4 (H.264 + AAC) — format przyjmowany wszędzie,
   - przy kamerze podążającej czekamy na kafelki mapy dla KAŻDEJ klatki.

   Gdy przeglądarka nie ma WebCodecs albo kodera H.264, wracamy do nagrywania
   w czasie rzeczywistym (recordVideo w render.js). */

const EXPORT_FPS = 30;
const EXPORT_VIDEO_BITRATE = 8_000_000;
const EXPORT_AUDIO_BITRATE = 128_000;
const EXPORT_AUDIO_RATE = 48000;

// Profile H.264 od najlepszego; poziom 5.1 mieści także kadr 1080x2340.
const AVC_CODECS = ["avc1.640033", "avc1.4d0033", "avc1.420033", "avc1.640028", "avc1.4d0028", "avc1.42001f"];

async function pickVideoEncoderConfig(width, height) {
  if (typeof VideoEncoder !== "function" || typeof VideoFrame !== "function" || typeof Mp4Muxer !== "object") return null;
  for (const codec of AVC_CODECS) {
    const config = {
      codec,
      width,
      height,
      bitrate: EXPORT_VIDEO_BITRATE,
      framerate: EXPORT_FPS,
      avc: { format: "avc" }, // format wymagany przez kontener MP4
    };
    try {
      const support = await VideoEncoder.isConfigSupported(config);
      if (support?.supported) return config;
    } catch {
      // ta kombinacja nie jest znana przeglądarce — próbujemy następnej
    }
  }
  return null;
}

async function pickAudioEncoderConfig() {
  if (typeof AudioEncoder !== "function" || typeof AudioData !== "function") return null;
  const candidates = [
    { muxerCodec: "aac", config: { codec: "mp4a.40.2", sampleRate: EXPORT_AUDIO_RATE, numberOfChannels: 2, bitrate: EXPORT_AUDIO_BITRATE } },
    { muxerCodec: "opus", config: { codec: "opus", sampleRate: EXPORT_AUDIO_RATE, numberOfChannels: 2, bitrate: EXPORT_AUDIO_BITRATE } },
  ];
  for (const candidate of candidates) {
    try {
      const support = await AudioEncoder.isConfigSupported(candidate.config);
      if (support?.supported) return candidate;
    } catch {
      // próbujemy następnego kodeka
    }
  }
  return null;
}

// Ścieżka dźwiękowa o długości filmu: muzyka zapętlona (gdy krótsza) i wyciszona na końcu.
async function renderMusicTrack(file, totalMs) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Ctx || !Offline) throw new Error("Brak obsługi dźwięku");
  const decodeCtx = new Ctx();
  let decoded;
  try {
    decoded = await decodeCtx.decodeAudioData(await file.arrayBuffer());
  } finally {
    decodeCtx.close().catch(() => {});
  }
  const seconds = totalMs / 1000;
  const offline = new Offline(2, Math.ceil(seconds * EXPORT_AUDIO_RATE), EXPORT_AUDIO_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.loop = true;
  const gain = offline.createGain();
  gain.gain.setValueAtTime(1, 0);
  gain.gain.setValueAtTime(1, Math.max(0, seconds - 1.2));
  gain.gain.linearRampToValueAtTime(0, seconds);
  source.connect(gain).connect(offline.destination);
  source.start();
  return offline.startRendering();
}

// Oddaje sterowanie przeglądarce (odświeżenie postępu, obsługa "Anuluj") bez
// setTimeout — liczniki czasu są w karcie w tle spowalniane do 1 na sekundę.
const yieldChannel = new MessageChannel();
const yieldWaiters = [];
yieldChannel.port1.onmessage = () => yieldWaiters.shift()?.();
function yieldToBrowser() {
  return new Promise((resolve) => {
    yieldWaiters.push(resolve);
    yieldChannel.port2.postMessage(0);
  });
}

function waitUntilVisible() {
  if (!document.hidden) return Promise.resolve();
  return new Promise((resolve) => {
    const onChange = () => {
      if (document.hidden) return;
      document.removeEventListener("visibilitychange", onChange);
      resolve();
    };
    document.addEventListener("visibilitychange", onChange);
  });
}

// ustawia film z przystanku dokładnie na klatkę odpowiadającą czasowi pokazu
function seekVideoTo(video, seconds) {
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  const target = duration ? seconds % duration : 0;
  if (Math.abs(video.currentTime - target) < 0.004 && video.readyState >= 2) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, 1500);
    function done() {
      clearTimeout(timer);
      video.removeEventListener("seeked", done);
      resolve();
    }
    video.addEventListener("seeked", done);
    video.currentTime = target;
  });
}

async function encodeAudioTrack(muxer, audioChoice, buffer, isCancelled) {
  let failure = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => { failure = e; },
  });
  encoder.configure(audioChoice.config);
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  const CHUNK = 4800; // 0,1 s
  for (let offset = 0; offset < buffer.length; offset += CHUNK) {
    if (failure) throw failure;
    if (isCancelled()) break;
    const frames = Math.min(CHUNK, buffer.length - offset);
    const planar = new Float32Array(frames * 2);
    planar.set(left.subarray(offset, offset + frames), 0);
    planar.set(right.subarray(offset, offset + frames), frames);
    const data = new AudioData({
      format: "f32-planar",
      sampleRate: EXPORT_AUDIO_RATE,
      numberOfFrames: frames,
      numberOfChannels: 2,
      timestamp: Math.round((offset / EXPORT_AUDIO_RATE) * 1e6),
      data: planar,
    });
    encoder.encode(data);
    data.close();
    if (encoder.encodeQueueSize > 20) await yieldToBrowser();
  }
  await encoder.flush();
  encoder.close();
  if (failure) throw failure;
}

// Zwraca { cancelled: true } | { blob, ext, mimeType, hasAudio, method: "frames" } albo
// null, gdy ta przeglądarka nie potrafi eksportu klatkowego (wtedy używamy recordVideo).
async function exportVideoByFrames(onProgress, onPreparing) {
  if (!map || !currentRoute) throw new Error("Najpierw zbuduj trasę.");
  if (animationRunning) throw new Error("Poczekaj, aż skończy się bieżąca animacja.");
  ensureStageCanvas();

  const videoConfig = await pickVideoEncoderConfig(STAGE_W, STAGE_H);
  if (!videoConfig) return null;
  let audioChoice = null;
  if (musicEntry) {
    audioChoice = await pickAudioEncoderConfig();
    if (!audioChoice) return null; // bez kodera dźwięku muzykę dogra tylko nagrywanie na żywo
  }

  let cancelled = false;
  animationRunning = true;
  setFramingMode(false);
  activePlayback = { cancel: () => { cancelled = true; } };
  document.getElementById("stageCanvas").style.display = "block";

  let timeline = null;
  let encoder = null;
  let failure = null;
  try {
    await loadAllActivityIcons();
    timeline = buildAnimationPlan();
    lastTimeline = timeline;
    stageMode = "anim";
    const follow = timeline.cameraMode === "follow";
    if (follow) await prewarmFollowTiles(timeline, () => cancelled, onPreparing);

    let musicBuffer = null;
    if (audioChoice) musicBuffer = await renderMusicTrack(musicEntry.file, timeline.totalMs);

    const muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: { codec: "avc", width: STAGE_W, height: STAGE_H, frameRate: EXPORT_FPS },
      ...(audioChoice ? { audio: { codec: audioChoice.muxerCodec, numberOfChannels: 2, sampleRate: EXPORT_AUDIO_RATE } } : {}),
      fastStart: "in-memory", // indeks na początku pliku — film startuje od razu, także w sieci
      firstTimestampBehavior: "offset",
    });
    encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => { failure = e; },
    });
    encoder.configure(videoConfig);

    const frameCount = Math.max(2, Math.round((timeline.totalMs / 1000) * EXPORT_FPS) + 1);
    const frameDurationUs = Math.round(1e6 / EXPORT_FPS);
    for (let i = 0; i < frameCount && !cancelled; i++) {
      if (failure) throw failure;
      const t = Math.min((i * 1000) / EXPORT_FPS, timeline.totalMs);
      const state = timelineStateAt(timeline, t);

      if (follow) {
        // mapa doczytuje kafelki tylko w widocznej karcie — w tle czekamy, zamiast kodować puste pola
        await waitUntilVisible();
        applyCamera(timeline, t, state);
        await waitForMapIdle(2500);
      }
      const wp = state.type === "reveal" ? waypointFeatures[state.stopIndex] : null;
      if (wp?.media?.type === "video") await seekVideoTo(wp.media.mediaEl, state.elapsed / 1000);
      if (cancelled) break;

      renderFrame(timeline, t);
      const frame = new VideoFrame(stageCanvas, { timestamp: i * frameDurationUs, duration: frameDurationUs });
      encoder.encode(frame, { keyFrame: i % (EXPORT_FPS * 2) === 0 });
      frame.close();

      // koder nie nadąża — czekamy, zamiast odkładać klatki 1080p w pamięci
      while (encoder.encodeQueueSize > 3 && !failure && !cancelled) await yieldToBrowser();
      if (onProgress) onProgress((i + 1) / frameCount);
      if (i % 2 === 0) await yieldToBrowser();
    }

    if (cancelled) return { cancelled: true };
    await encoder.flush();
    if (failure) throw failure;
    if (musicBuffer) await encodeAudioTrack(muxer, audioChoice, musicBuffer, () => cancelled);
    if (cancelled) return { cancelled: true };
    muxer.finalize();

    const blob = new Blob([muxer.target.buffer], { type: "video/mp4" });
    if (blob.size === 0) throw new Error("Zakodowany plik jest pusty.");
    return { blob, ext: "mp4", mimeType: "video/mp4", hasAudio: !!musicBuffer, cancelled: false, method: "frames" };
  } finally {
    try {
      if (encoder && encoder.state !== "closed") encoder.close();
    } catch {
      // koder mógł się już zamknąć po błędzie
    }
    animationRunning = false;
    activePlayback = null;
    if (timeline && !cancelled && !failure) {
      stageMode = "final";
      renderFrame(timeline, timeline.totalMs);
    } else {
      stageMode = "static";
      if (timeline) setCamera(timeline.baseCamera.center, timeline.baseCamera.zoom);
      renderStatic();
    }
  }
}

// Eksport z automatycznym wyborem metody. Zwraca wynik z polem `method`:
// "frames" (klatka po klatce) albo "realtime" (nagrywanie na żywo).
async function exportVideo(onProgress, onPreparing, onMethod) {
  let framesResult = null;
  try {
    onMethod?.("frames");
    framesResult = await exportVideoByFrames(onProgress, onPreparing);
  } catch (e) {
    // Koder sprzętowy potrafi odmówić w trakcie (np. brak pamięci wideo w telefonie).
    // Nie zostawiamy użytkownika z błędem — robimy nagranie drugą metodą.
    console.warn("Eksport klatkowy nie powiódł się, przechodzę na nagrywanie na żywo:", e);
    framesResult = null;
  }
  if (framesResult) return framesResult;
  onMethod?.("realtime");
  const result = await recordVideo(onProgress, onPreparing);
  return { ...result, method: "realtime" };
}
