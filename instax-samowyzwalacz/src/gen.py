"""Samowyzwalacz do Instax Square – generator części (manifold3d).
Wszystkie wymiary w mm.  Uruchom:  python3 gen.py   -> pliki STL w ../stl
Układ współrzędnych modułu: XY = płaszczyzna płyt, Z = oś śrub/osi.
Tylna płyta: z<0, przednia płyta: z>21.4.  Dźwignia obraca się wokół A=(0,0).
"""
import math, os, json
import numpy as np
import manifold3d as mf
from manifold3d import Manifold as M, CrossSection as CS

OUT = os.path.join(os.path.dirname(__file__), '..', 'stl')
os.makedirs(OUT, exist_ok=True)
SEG = 64
mf.set_circular_segments(SEG) if hasattr(mf, 'set_circular_segments') else None

# ------------------------------------------------------------------ parametry
P = dict(
    m=1.0,              # moduł kół
    backlash=0.10,      # pocienienie zęba na koło (mm łuku)
    z_sector=48, z_pin=12, z_B=36, z_C=32,
    esc_N=12, esc_Rt=14.0, esc_Rr=10.0, esc_tipflat=0.6,
    esc_Rp=14.4, esc_span=3.5, pin_r=1.5,
    bore=3.4,           # otwór obrotowy na śrubę M3
    tap=2.8,            # otwór pod wkręcenie M3 w plastik
    clear=3.4,          # otwór przelotowy
    back_t=5.0, front_t=4.0, gap=21.4,
    arm_w=10.0, r_finger=46.0, r_band=38.0,
    post_r=4.0, stop_r=31.0, stop_end=115.0, stop_cock=-33.0,
)
m = P['m']
GAP = P['gap']

def pol(r, deg):
    a = math.radians(deg); return np.array([r*math.cos(a), r*math.sin(a)])

# ------------------------------------------------------------------ układ osi
A = np.array([0.0, 0.0])
dAB = m*(P['z_sector']+P['z_pin'])/2          # 30
dBC = m*(P['z_B']+P['z_pin'])/2               # 24
dCD = m*(P['z_C']+P['z_pin'])/2               # 22
beta = math.pi*P['esc_span']/P['esc_N']
dDE = P['esc_Rp']/math.cos(beta)              # 23.65
r_pal = P['esc_Rp']*math.tan(beta)
TH_B = 200.0
B = A + pol(dAB, TH_B)
C = B + pol(dBC, 180)
D = C + pol(dCD, 90)
E = D + pol(dDE, 90)
POSTS = {
    'P1': np.array([-40.0, -34.0]),
    'P2': np.array([-78.0, -6.0]),
    'P3': pol(P['stop_r'], P['stop_end']),
    'P4': pol(P['stop_r'], P['stop_cock']),
    'P5': np.array([-52.0, 52.0]),
}
# kąty zatrzymania ramienia (ramię szer. arm_w uderza w słupek r=post_r)
dstop = math.degrees(math.asin((P['arm_w']/2+P['post_r'])/P['stop_r']))
A_MAX = P['stop_end']-dstop       # koniec ruchu (ok. 98°)
A_MIN = P['stop_cock']+dstop      # pozycja naciągnięta (ok. -16°)

# warstwy Z
Z = dict(
    L1=(0.4, 4.4), pinB=(0.3, 4.6), hubB=(4.6, 7.7), pawl=(4.8, 7.7),
    gearB=(5.0, 9.6), pocket=(5.0, 8.0),
    pinC=(5.0, 9.6), gearC=(10.0, 14.2), pinD=(10.0, 14.2),
    esc=(14.6, 17.6), pins=(14.4, 18.0), rocker=(18.0, 21.0),
    lo=0.3, hi=GAP-0.4,
)

# ------------------------------------------------------------------ 2D helpers
def circle(r, c=(0, 0), n=SEG):
    return CS.circle(r, n).translate((float(c[0]), float(c[1])))

def poly(pts):
    return CS([[(float(x), float(y)) for x, y in pts]])

def ext(cs, z0, z1):
    return cs.extrude(z1-z0).translate((0, 0, z0))

def cyl(r, z0, z1, c=(0, 0), n=SEG):
    return ext(circle(r, c, n), z0, z1)

def hull_circles(lst):
    return CS.batch_hull([circle(r, c) for c, r in lst])

def inv(a): return math.tan(a)-a

def gear2d(z, mod=m, backlash=P['backlash'], pa=20.0, add=1.0, ded=1.25):
    pa = math.radians(pa)
    r = mod*z/2; rb = r*math.cos(pa); ra = r+add*mod; rf = r-ded*mod
    s = math.pi*mod/2 - backlash
    def psi(rho):
        rho = max(rho, rb)
        return s/(2*r) + inv(pa) - inv(math.acos(rb/rho))
    rhos = np.linspace(max(rb, rf), ra, 10)
    # obetnij szpic
    rhos = [x for x in rhos if psi(x) > 0.02/x] or [ra]
    pts = []
    for i in range(z):
        th = 2*math.pi*i/z
        flank = []
        if rf < rb:
            flank.append((rf, psi(rb)))
        for rho in rhos:
            flank.append((rho, psi(rho)))
        right = [(rr*math.cos(th-ps), rr*math.sin(th-ps)) for rr, ps in flank]
        left = [(rr*math.cos(th+ps), rr*math.sin(th+ps)) for rr, ps in reversed(flank)]
        pts += right + left
        a0 = th + flank[0][1]; a1 = th + 2*math.pi/z - flank[0][1]
        for t in np.linspace(a0, a1, 4)[1:-1]:
            pts.append((rf*math.cos(t), rf*math.sin(t)))
    return poly(pts)

def wedge(r, a0, a1, n=48):
    pts = [(0, 0)] + [(r*math.cos(math.radians(a)), r*math.sin(math.radians(a)))
                      for a in np.linspace(a0, a1, n)]
    return poly(pts)

def escape2d():
    N, Rt, Rr, tf = P['esc_N'], P['esc_Rt'], P['esc_Rr'], P['esc_tipflat']
    pts = []
    for i in range(N):
        a = 2*math.pi*i/N; h = math.pi/N; d = tf/Rt/2
        pts.append((Rt*math.cos(a-d), Rt*math.sin(a-d)))
        pts.append((Rt*math.cos(a+d), Rt*math.sin(a+d)))
        pts.append((Rr*math.cos(a+h), Rr*math.sin(a+h)))
    return poly(pts)

# zapadkowe sprzęgło (wewnętrzne zęby w kole B) -----------------------------
RAT_N, RAT_Ri, RAT_Ro, RAT_UC = 14, 11.6, 13.0, 6.0   # zęby, r wierzchołków, r dna, podcięcie [°]
def ratchet_pocket2d():
    pts = []
    p = 360.0/RAT_N
    for k in range(RAT_N):
        a0 = k*p
        # dno szczeliny (podcięte w stronę CW o RAT_UC)
        pts.append(pol(RAT_Ro, a0-RAT_UC))
        for t in np.linspace(0, 1, 6)[1:]:
            pts.append(pol(RAT_Ro + (RAT_Ri-RAT_Ro)*t, a0 + p*t*0.96))
        pts.append(pol(RAT_Ri, a0+p))
    return poly(pts)

def pawls2d(hub_r=7.0, n=2):
    """Elastyczne zapadki (sprężyste ramiona) – zabierają koło gdy zębnik B
    obraca się zgodnie z ruchem wskazówek zegara (patrząc od +Z)."""
    out = circle(hub_r)
    t = 1.15
    for k in range(n):
        a0 = k*360.0/n
        span = 150.0
        cl = []
        for u in np.linspace(0, 1, 40):
            r = hub_r - 0.6 + (10.15-(hub_r-0.6))*min(1, u*1.25)
            cl.append((r, a0+span*u))
        outer = [pol(r+t/2, a) for r, a in cl]
        inner = [pol(r-t/2, a) for r, a in reversed(cl)]
        out = out + poly(outer+inner)
        # nos zapadki: czoło CW pod kątem podcięcia, grzbiet opada w stronę CCW
        an = a0+span-14.0
        nose = [pol(10.0, an-2.0), pol(12.7, an-RAT_UC*0.8), pol(12.75, an+3.0),
                pol(10.6, an+16.0), pol(9.6, an+10.0)]
        out = out + poly(nose)
    return out

# ------------------------------------------------------------------ części
def lever():
    zl0, zl1 = Z['L1']
    # sektor: kąty w układzie dźwigni (ramię = 0°)
    s0 = TH_B - A_MAX - 8; s1 = TH_B - A_MIN + 8
    g = gear2d(P['z_sector'])
    rf = m*P['z_sector']/2 - 1.25*m
    sector = (g ^ wedge(40, s0, s1)) + (circle(rf-0.01) ^ wedge(40, s0, s1))
    # odciążenie sektora
    sector = sector - (wedge(rf-4, s0+10, s1-10) - circle(9))
    spokes = CS()
    for a in (s0+5, (s0+s1)/2, s1-5):
        spokes = spokes + CS.hull(circle(2.5, pol(6, a)) + circle(2.5, pol(rf-2, a)))
    arm = CS.hull(circle(P['arm_w']/2, (0, 0)) + circle(P['arm_w']/2, (P['r_finger'], 0)))
    boss = circle(6.5, (P['r_finger'], 0)) + circle(5.0, (P['r_band'], 0))
    body2d = sector + spokes + arm + boss + circle(8)
    body2d = body2d - circle(P['tap']/2, (P['r_finger'], 0)) - circle(P['tap']/2, (P['r_band'], 0))
    body = ext(body2d, zl0, zl1)
    hub = cyl(5.0, zl0, Z['hi'])
    part = body + hub - cyl(P['bore']/2, -1, 30)
    return part

def pinionB():
    p = ext(gear2d(P['z_pin']), *Z['pinB'])
    p = p + ext(circle(7.0), Z['pinB'][1], Z['hubB'][1])
    p = p + ext(pawls2d(), Z['pawl'][0], Z['pawl'][1])
    return p - cyl(P['bore']/2, -1, 30)

def gearB():
    z0, z1 = Z['gearB']
    g = ext(gear2d(P['z_B']), z0, z1)
    g = g - ext(ratchet_pocket2d(), z0-1, Z['pocket'][1])
    return g - cyl(P['bore']/2, -1, 30)

def gearC():
    p = cyl(3.2, Z['lo'], Z['pinC'][0])
    p = p + ext(gear2d(P['z_pin']), *Z['pinC'])
    p = p + cyl(4.5, Z['pinC'][1], Z['gearC'][0])
    p = p + ext(gear2d(P['z_C']), *Z['gearC'])
    return p - cyl(P['bore']/2, -1, 30)

def escD():
    p = cyl(3.2, Z['lo'], Z['pinD'][0])
    p = p + ext(gear2d(P['z_pin']), *Z['pinD'])
    p = p + cyl(4.5, Z['pinD'][1], Z['esc'][0])
    p = p + ext(escape2d(), *Z['esc'])
    return p - cyl(P['bore']/2, -1, 30)

def pallet_pins_local():
    """pozycje kołków względem osi wahacza E (w neutralnym położeniu)"""
    p1 = pol(P['esc_Rp'], 90-math.degrees(beta)) + D - E
    p2 = pol(P['esc_Rp'], 90+math.degrees(beta)) + D - E
    return p1, p2

WEIGHT_X = (12.0, 18.0, 24.0)
def rocker():
    z0, z1 = Z['rocker']
    p1, p2 = pallet_pins_local()
    bar = CS.hull(circle(4, (-27, 0)) + circle(4, (27, 0)))
    arms = CS.hull(circle(2.4, (0, 0)) + circle(2.4, p1)) + CS.hull(circle(2.4, (0, 0)) + circle(2.4, p2))
    arms = arms + CS.hull(circle(2.4, p1) + circle(2.4, p2))
    body2d = bar + arms + circle(5)
    for x in WEIGHT_X:
        body2d = body2d - circle(P['tap']/2, (x, 0)) - circle(P['tap']/2, (-x, 0))
    r = ext(body2d, z0, z1)
    r = r + cyl(3.0, Z['lo'], z1)
    r = r + cyl(P['pin_r'], Z['pins'][0], z0, p1, 32) + cyl(P['pin_r'], Z['pins'][0], z0, p2, 32)
    return r - cyl(P['bore']/2, -1, 30)

def spacer(z0, z1, r=3.2):
    return cyl(r, z0, z1) - cyl(P['bore']/2, z0-1, z1+1)

# ------------------------------------------------------------------ płyty
def plate_outline():
    pr = 7.5
    main = hull_circles([(B, 9), (C, 9), (D, 9), (E, 9), (POSTS['P1'], pr), (POSTS['P2'], pr),
                         (POSTS['P5'], pr), (POSTS['P3'], pr)])
    right = hull_circles([(A, 10), (POSTS['P3'], pr), (POSTS['P4'], pr)])
    right2 = hull_circles([(A, 10), (B, 9), (POSTS['P4'], pr), (POSTS['P1'], pr)])
    return main + right + right2

AXLES = {'A': A, 'B': B, 'C': C, 'D': D, 'E': E}
MOUNT_Y = -22.0
MOUNT_X = (-58.0, -46.0, -34.0, -22.0)

def back_plate():
    t = P['back_t']
    out = plate_outline()
    plate = ext(out, -t, 0)
    for k, c in POSTS.items():
        plate = plate + cyl(P['post_r'], 0, GAP, c)
    # otwory
    for k, c in AXLES.items():
        plate = plate - cyl(P['tap']/2, -t+0.4, 1, c, 32)
    for k, c in POSTS.items():
        # dół słupka + płyta: wkręcanie (2.8), wyżej luz (3.2) – mniejszy opór przy wkręcaniu
        plate = plate - cyl(P['tap']/2, -t+0.4, 6.0, c, 32) - cyl(3.2/2, 6.0, GAP+1, c, 32)
    for x in MOUNT_X:
        plate = plate - cyl(P['tap']/2, -t-1, -0.6, (x, MOUNT_Y), 32)
    # napis-kierunek: strzałka obrotu (rowek) – pomijamy
    return plate

WIN = [(E[0]+8, E[0]+28.5), (E[0]-28.5, E[0]-8)]
def front_plate():
    t = P['front_t']
    out = plate_outline()
    for x0, x1 in WIN:
        out = out - CS.square((x1-x0, 15)).translate((x0, E[1]-7.5))
    plate = ext(out, GAP, GAP+t)
    for c in list(AXLES.values()) + list(POSTS.values()):
        plate = plate - cyl(P['clear']/2, GAP-1, GAP+t+1, c, 32)
    return plate

# ------------------------------------------------------------------ drobne
def finger_pad():
    p = cyl(4.5, 0, 12) + M.sphere(4.5, SEG).translate((0, 0, 12)).trim_by_plane((0, 0, -1), -14)
    return p - cyl(P['tap']/2, 1.5, 30) - cyl(P['tap']/2+0.2, -1, 1.6)

def band_sleeve():
    # na śrubę M3x40 na ramieniu: od góry ramienia (z=4.4) do z=30
    return spacer(0, 30.0-Z['L1'][1], r=3.0)

def band_spool():
    # na słupek P5, nad przednią płytą: z 25.4 -> 33.4, kołnierz na górze
    h = 8.0
    s = cyl(3.5, 0, h) + cyl(5.5, h-1.2, h) + cyl(5.5, 0, 1.0)
    return s - cyl(P['clear']/2, -1, h+1)

# ------------------------------------------------------------------ uchwyt (kamera)
CAM = dict(W=130.7, H=118.6, Dp=57.5)
UP_SLOTS_Y = (-54.0, -30.0)
UP_SLOT_Z = (4.0, 66.0)
def bracket():
    """Wspornik L: podstawa pod aparatem (szczelina 1/4") + pionowa ścianka przy
    prawym boku aparatu. Układ aparatu: X w prawo, Y do przodu (0 = front), Z w górę
    (0 = spód aparatu). Moduł przykręcany do zewnętrznej strony ścianki."""
    Xs = CAM['W']/2
    tb = 8.0       # grubość podstawy
    tu = 4.5       # grubość ścianki
    base = M.cube((Xs+0.5+tu+20, 46, tb)).translate((-20, -51, -tb))
    # szczelina 1/4" wzdłuż X z pogłębieniem na łeb od spodu
    sl0, sl1, ys = Xs-80, Xs-15, -28.75
    slot = CS.hull(circle(3.4, (sl0, ys)) + circle(3.4, (sl1, ys)))
    cb = CS.hull(circle(7.0, (sl0, ys)) + circle(7.0, (sl1, ys)))
    base = base - ext(slot, -tb-1, 1) - ext(cb, -tb-1, -tb+4.0)
    # gniazdo na nakrętkę 1/4"-20 (statyw) – wkładana od góry przed montażem
    nut = CS.circle(11.4/math.sqrt(3), 6).translate((Xs-40, -10))
    base = base - ext(nut, -5.9, 1) - ext(circle(3.4, (Xs-40, -10)), -tb-1, 1)
    # szczeliny na pasek na rzep (SQ1 nie ma gwintu statywowego!) – pasek 20 mm
    for xs in (-14.0, Xs-8.0):
        base = base - M.cube((3.5, 24, tb+2)).translate((xs, -28.75-12, -tb-1))
    # ścianka pionowa
    ux0 = Xs+0.5
    up = M.cube((tu, 92, 80)).translate((ux0, -82, -tb))
    # szczeliny pionowe (M3) – profil w płaszczyźnie (u=-Z, v=Y), wyciągnięcie wzdłuż X
    for ysl in UP_SLOTS_Y:
        prof = CS.hull(CS.circle(1.7, 32).translate((-UP_SLOT_Z[0], ysl)) +
                       CS.circle(1.7, 32).translate((-UP_SLOT_Z[1], ysl)))
        cut = prof.extrude(tu+2).transform(np.array([[0, 0, 1, ux0-1], [0, 1, 0, 0], [-1, 0, 0, 0]], float))
        up = up - cut
    # żebra usztywniające poza obrysem aparatu (Y<-57.5 i Y>0)
    rib = CS([[(0.0, 0.0), (0.0, 30.0), (-22.0, 0.0)]])
    for y0 in (-76.0, 10.0):
        r3 = rib.extrude(6.0).transform(np.array([[1, 0, 0, ux0], [0, 0, -1, y0], [0, 1, 0, 0]], float))
        up = up + r3
    return base + up

# ------------------------------------------------------------------ eksport
def to_stl(man, name):
    mesh = man.to_mesh()
    v = np.asarray(mesh.vert_properties)[:, :3]; f = np.asarray(mesh.tri_verts)
    import trimesh
    tm = trimesh.Trimesh(v, f, process=False)
    tm.export(os.path.join(OUT, name + '.stl'))
    return tm

def flip(man):
    """odwrócenie do druku (z -> -z) i położenie na stole"""
    r = man.mirror((0, 0, 1))
    return r

def on_bed(man):
    bb = man.bounding_box()
    return man.translate((-(bb[0]+bb[3])/2, -(bb[1]+bb[4])/2, -bb[2]))

def assembly(a_lever=None):
    """Części w pozycjach montażowych (do kontroli kolizji i podglądu)."""
    a = A_MAX-8 if a_lever is None else a_lever
    parts = {
        'back_plate': back_plate(),
        'front_plate': front_plate(),
        'lever': lever().rotate((0, 0, a)),
        'pinionB': pinionB().translate((*B, 0)),
        'gearB': gearB().translate((*B, 0)),
        'spacerB': spacer(Z['gearB'][1]+0.3, Z['hi']).translate((*B, 0)),
        'gearC': gearC().translate((*C, 0)),
        'spacerC': spacer(Z['gearC'][1]+0.2, Z['hi']).translate((*C, 0)),
        'escD': escD().translate((*D, 0)),
        'spacerD': spacer(Z['esc'][1]+0.2, Z['hi']).translate((*D, 0)),
        'rocker': rocker().translate((*E, 0)),
    }
    return parts

PRINT = {}
def build_all():
    pr = {
        '01_plyta_tylna': on_bed(back_plate()),
        '02_plyta_przednia': on_bed(flip(front_plate())),
        '03_dzwignia': on_bed(lever()),
        '04_zebnik_B_zapadki': on_bed(flip(pinionB())),
        '05_kolo_B36_zapadkowe': on_bed(flip(gearB())),
        '06_kolo_C': on_bed(flip(gearC())),
        '07_kolo_wychwytowe_D': on_bed(flip(escD())),
        '08_wahacz_E': on_bed(flip(rocker())),
        '09_tuleja_B': on_bed(spacer(Z['gearB'][1]+0.3, Z['hi'])),
        '10_tuleja_C': on_bed(spacer(Z['gearC'][1]+0.2, Z['hi'])),
        '11_tuleja_D': on_bed(spacer(Z['esc'][1]+0.2, Z['hi'])),
        '12_nakladka_palca': on_bed(finger_pad()),
        '13_tuleja_gumki': on_bed(band_sleeve()),
        '14_szpulka_gumki': on_bed(band_spool()),
        '15_uchwyt_instax': on_bed(bracket()),
    }
    return pr

if __name__ == '__main__':
    info = dict(A=A.tolist(), B=B.tolist(), C=C.tolist(), D=D.tolist(), E=E.tolist(),
                posts={k: v.tolist() for k, v in POSTS.items()}, A_MIN=A_MIN, A_MAX=A_MAX,
                ratio=(P['z_sector']/P['z_pin'])*(P['z_B']/P['z_pin'])*(P['z_C']/P['z_pin']))
    print(json.dumps(info, indent=1))
    for name, man in build_all().items():
        bb = man.bounding_box()
        tm = to_stl(man, name)
        print(f"{name:28s} vol={man.volume()/1000:6.2f} cm3  bbox={bb[3]-bb[0]:.1f} x {bb[4]-bb[1]:.1f} x {bb[5]-bb[2]:.1f}  watertight={tm.is_watertight}")
