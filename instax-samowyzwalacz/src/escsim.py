"""Prosta symulacja 2D wychwytu (koło gwiazdkowe + wahacz z dwoma kołkami).
Jednostki SI. Służy do sprawdzenia, że wychwyt nie blokuje się, oraz do
oszacowania czasu cyklu w zależności od momentu i bezwładności wahacza."""
import numpy as np, math, sys

def wheel_poly(N, Rt, Rr, tipflat=0.0):
    pts = []
    for i in range(N):
        a = 2*math.pi*i/N
        h = math.pi/N
        if tipflat > 0:
            d = tipflat/Rt/2
            pts.append((Rt*math.cos(a-d), Rt*math.sin(a-d)))
            pts.append((Rt*math.cos(a+d), Rt*math.sin(a+d)))
        else:
            pts.append((Rt*math.cos(a), Rt*math.sin(a)))
        pts.append((Rr*math.cos(a+h), Rr*math.sin(a+h)))
    return np.array(pts)

def esc_geom(N=12, Rt=14e-3, Rr=10e-3, Rp=14.4e-3, span_pitches=3.5, pinR=1.5e-3):
    beta = math.pi*span_pitches/N  # half-span
    Dist = Rp/math.cos(beta)
    E = np.array([0.0, Dist])
    pins = np.array([[Rp*math.cos(math.pi/2-beta), Rp*math.sin(math.pi/2-beta)],
                     [Rp*math.cos(math.pi/2+beta), Rp*math.sin(math.pi/2+beta)]])
    return dict(N=N, Rt=Rt, Rr=Rr, Rp=Rp, beta=beta, E=E, pins=pins, pinR=pinR,
                poly=wheel_poly(N, Rt, Rr, 0.6e-3))

def closest_on_poly(poly, p):
    a = poly; b = np.roll(poly, -1, axis=0)
    ab = b-a; ap = p-a
    t = np.clip((ap*ab).sum(1)/(ab*ab).sum(1), 0, 1)
    c = a + ab*t[:, None]
    d = np.hypot(*(p-c).T)
    i = np.argmin(d)
    return c[i], d[i]

def rot(v, ang):
    c, s = math.cos(ang), math.sin(ang)
    return np.array([c*v[0]-s*v[1], s*v[0]+c*v[1]])

def simulate(g, tau, Iw, Ir, T=0.6, dt=4e-6, k=4e3, cdamp=0.4, mu=0.3, phi_lim=0.35, verbose=False):
    th, w = 0.013, 0.0   # kąt koła (lekko przesunięty), prędkość
    ph, wr = 0.0, 0.0
    E = g['E']; pins0 = g['pins']; poly = g['poly']; pr = g['pinR']
    t = 0.0; beats = 0; last_sign = 0; hist = []
    maxpen = 0
    nsteps = int(T/dt)
    for n in range(nsteps):
        tw = tau; tr = 0.0
        for pp in pins0:
            P = E + rot(pp-E, ph)              # pozycja kołka (świat)
            Pw = rot(P, -th)                   # w układzie koła
            c, d = closest_on_poly(poly, Pw)
            pen = pr - d
            if pen > 0:
                nrm = (Pw-c)/max(d, 1e-12)       # od koła do kołka (układ koła)
                nW = rot(nrm, th); cW = rot(c, th)
                vp = wr*np.array([-(cW-E)[1], (cW-E)[0]])
                vw = w*np.array([-cW[1], cW[0]])
                vr = vp-vw
                vn = vr@nW
                Fn = max(0.0, k*pen - cdamp*vn*0+0) - 0  # sprężyna
                Fn = max(0.0, k*pen - (cdamp*math.sqrt(k*Iw)/(g['Rt']**1))*vn*1e-0) if False else max(0.0, k*pen - 2*0.3*math.sqrt(k*min(Iw/g['Rt']**2, Ir/0.02**2))*vn)
                tdir = np.array([-nW[1], nW[0]])
                vt = vr@tdir
                Ft = -mu*Fn*math.tanh(vt/1e-3)
                F = Fn*nW + Ft*tdir             # siła na kołek
                tr += (cW-E)[0]*F[1]-(cW-E)[1]*F[0]
                tw -= (cW[0]*F[1]-cW[1]*F[0])
                maxpen = max(maxpen, pen)
        # ograniczenie wychylenia wahacza (ogranicznik)
        if abs(ph) > phi_lim:
            tr += -2e-1*(ph-math.copysign(phi_lim, ph)) - 1e-4*wr
        wr += tr/Ir*dt; ph += wr*dt
        w += tw/Iw*dt; th += w*dt
        s = 1 if ph > 0 else -1
        if s != last_sign:
            beats += 1; last_sign = s
        if n % 250 == 0:
            hist.append((t, th, ph))
        t += dt
    hist = np.array(hist)
    return hist, beats, maxpen

if __name__ == '__main__':
    g = esc_geom()
    tau = float(sys.argv[1]) if len(sys.argv) > 1 else 2e-3
    Ir = float(sys.argv[2]) if len(sys.argv) > 2 else 1e-6
    hist, beats, maxpen = simulate(g, tau, 1.5e-7, Ir, T=0.4)
    th = hist[:, 1]
    # średnia prędkość w drugiej połowie
    half = len(th)//2
    wavg = (th[-1]-th[half])/(hist[-1, 0]-hist[half, 0])
    print(f"tau={tau:.2e} Ir={Ir:.2e} wavg={wavg:.2f} rad/s  obr/s={wavg/2/math.pi:.3f}  beats={beats} maxpen={maxpen*1e3:.3f}mm  phi range={hist[:,2].min():.3f}..{hist[:,2].max():.3f}")
