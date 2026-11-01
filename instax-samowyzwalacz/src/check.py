import gen, math, itertools, numpy as np
from gen import A_MIN, A_MAX, P
EXCL = {frozenset(x) for x in [('lever','pinionB'),('pinionB','gearB'),('gearB','pinionC'),
        ('gearB','gearC'),('gearC','escD'),('escD','rocker'),
        ('back_plate','spacerB')]}
def check(a):
    parts = gen.assembly(a)
    bad = []
    for (n1,p1),(n2,p2) in itertools.combinations(parts.items(),2):
        if frozenset((n1,n2)) in EXCL: continue
        v = (p1 ^ p2).volume()
        if v > 0.01: bad.append((n1,n2,round(v,3)))
    return bad
for a in [A_MIN, 20, 60, A_MAX]:
    print(f"lever {a:6.1f}°:", check(a) or "OK – brak kolizji")
# prześwit płyty względem śrub na ramieniu
out = gen.plate_outline()
import manifold3d as mf
def mindist(r, rad):
    md = 1e9
    for a in np.linspace(A_MIN, A_MAX, 120):
        c = gen.pol(r, a)
        x = (out ^ gen.circle(rad+3, c)).area()
        # przybliżenie: szukamy minimalnego luzu przez offset
    return
for r, rad, nm in [(P['r_finger'], 3.2, 'śruba palca + nakrętka'), (P['r_band'], 2.9, 'łeb śruby gumki')]:
    lo = 0
    for cl in [0.0, 0.5, 1, 2, 3, 4, 5]:
        hit = any((out ^ gen.circle(rad+cl, gen.pol(r, a))).area() > 1e-6 for a in np.linspace(A_MIN, A_MAX, 115))
        if hit: break
        lo = cl
    print(f"{nm}: luz od obrysu płyt >= {lo} mm")
# zazębienia – sprawdzamy wnikanie przy zgodnej fazie
def mesh_ok(z1, z2, d, steps=8):
    g1 = gen.gear2d(z1); g2 = gen.gear2d(z2)
    worst = 0
    for k in range(steps):
        a1 = k*(360/z1)/steps
        a2 = 180 + 180/z2*( (z2+1)%2 ) - a1*z1/z2   # przeciwny obrót
        best = 1e9
        for ph in np.linspace(-180/z2, 180/z2, 41):
            ov = (g1.rotate(a1) ^ g2.rotate(a2+ph).translate((d,0))).area()
            best = min(best, ov)
        worst = max(worst, best)
    return worst
print("sektor48/zębnik12:", mesh_ok(48,12,30))
print("koło36/zębnik12:", mesh_ok(36,12,24))
print("koło32/zębnik12:", mesh_ok(32,12,22))
