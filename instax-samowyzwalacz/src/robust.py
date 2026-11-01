import escsim, math, numpy as np
g = escsim.esc_geom()
import types
res = []
for th0 in np.linspace(0, 2*math.pi/12, 7):
    for mu in (0.2, 0.45):
        # podmiana kąta startowego
        src = escsim.simulate.__code__
        def sim(th0=th0, mu=mu):
            import escsim as e
            old = e.simulate
            h,b,mp = e.simulate(g, 1.5e-3, 1.3e-7, 1.4e-6, T=0.5, dt=2e-6, k=2e4, mu=mu) if th0==0 else (None,None,None)
            return h
        escsim_th = th0
        # prosta kopia z innym kątem startowym
        import inspect
        code = inspect.getsource(escsim.simulate).replace("th, w = 0.013, 0.0", f"th, w = {th0+0.001}, 0.0")
        ns = {}; exec(code, escsim.__dict__, ns)
        h,b,mp = ns['simulate'](g, 1.5e-3, 1.3e-7, 1.4e-6, T=0.5, dt=2e-6, k=2e4, mu=mu)
        res.append((round(th0,3), mu, round((h[-1,1]-h[0,1])/(2*math.pi),2)))
for r in res: print("kąt startowy %.3f  mu=%.2f  obrotów w 0.5 s: %.2f" % r)
