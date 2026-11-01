import escsim, math
g = escsim.esc_geom()
revs = 106/360*32
print("obroty koła wychwytowego na pełny cykl:", round(revs,2))
for tau in [2e-3, 4e-3]:
    for Ir, lab in [(7.1e-7,'bez obciążników'), (1.4e-6,'2x M3x8 @24'), (2.4e-6,'2x M3x8+2 nakr. @24'), (3.5e-6,'2x M3x8+6 nakr. @24')]:
        h,b,mp = escsim.simulate(g, tau, 1.3e-7, Ir, T=0.3, dt=2e-6, k=2e4)
        half=len(h)//2; w=(h[-1,1]-h[half,1])/(h[-1,0]-h[half,0])/2/math.pi
        print(f"M_wych={tau*1e3:.0f} mNm  {lab:24s} I={Ir:.1e}  {w:5.2f} obr/s  ->  czas ~{revs/w:4.1f} s")
