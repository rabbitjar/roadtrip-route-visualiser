import escsim, math, numpy as np
g = escsim.esc_geom()
for tau in [1e-3, 2e-3, 4e-3]:
    for Ir in [5e-7, 1e-6, 2e-6, 4e-6]:
        h, b, mp = escsim.simulate(g, tau, 1.5e-7, Ir, T=0.3, dt=2e-6, k=2e4)
        half = len(h)//2
        w = (h[-1,1]-h[half,1])/(h[-1,0]-h[half,0])
        print(f"tau={tau:.0e} Ir={Ir:.0e} rev/s={w/2/math.pi:6.3f} pen={mp*1e3:.3f}mm phi={h[:,2].min():.3f}..{h[:,2].max():.3f}")
