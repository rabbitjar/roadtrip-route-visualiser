import gen, numpy as np
def roll(z1, z2, d, n=24):
    g1 = gen.gear2d(z1); g2 = gen.gear2d(z2)
    base = 180
    phs = np.linspace(0, 360/z2, 61)
    ph = min(phs, key=lambda p: (g1 ^ g2.rotate(base+p).translate((d,0))).area())
    worst = 0; minclear = []
    for k in range(n):
        a1 = k*(360/z1)/n*3
        a2 = base+ph - a1*z1/z2
        ov = (g1.rotate(a1) ^ g2.rotate(a2).translate((d,0))).area()
        worst = max(worst, ov)
    return ph, worst
for z1,z2,d in [(48,12,30),(36,12,24),(32,12,22)]:
    print(z1,z2, roll(z1,z2,d))
