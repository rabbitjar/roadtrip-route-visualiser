import gen, numpy as np, math, os
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
IMG = os.path.join(os.path.dirname(__file__), '..', 'img'); os.makedirs(IMG, exist_ok=True)

def tris(man):
    m = man.to_mesh(); v = np.asarray(m.vert_properties)[:, :3]; f = np.asarray(m.tri_verts)
    return v[f]

def shade(T, base, light=np.array([0.4, -0.5, 0.8])):
    n = np.cross(T[:, 1]-T[:, 0], T[:, 2]-T[:, 0]); n /= np.linalg.norm(n, axis=1)[:, None]+1e-12
    l = light/np.linalg.norm(light)
    k = 0.45+0.55*np.clip(n@l, 0, 1)
    c = np.array(matplotlib.colors.to_rgb(base))
    return np.clip(k[:, None]*c, 0, 1)

def draw3d(items, fname, elev=28, azim=-60, lims=None, title=None, size=(10, 8)):
    fig = plt.figure(figsize=size, dpi=130); ax = fig.add_subplot(111, projection='3d')
    allv = []
    for man, col in items:
        T = tris(man); allv.append(T.reshape(-1, 3))
        pc = Poly3DCollection(T, facecolors=shade(T, col), edgecolors='none', linewidths=0)
        ax.add_collection3d(pc)
    V = np.vstack(allv); lo = V.min(0); hi = V.max(0); c = (lo+hi)/2; r = (hi-lo).max()/2
    ax.set_xlim(c[0]-r, c[0]+r); ax.set_ylim(c[1]-r, c[1]+r); ax.set_zlim(c[2]-r, c[2]+r)
    ax.set_box_aspect((1, 1, 1)); ax.view_init(elev=elev, azim=azim); ax.set_axis_off()
    if title: ax.set_title(title)
    plt.tight_layout(); plt.savefig(os.path.join(IMG, fname)); plt.close(fig)

COL = dict(back_plate='#9aa5b1', front_plate='#c9d3dd', lever='#e4572e', pinionB='#f3a712', gearB='#29335c',
           spacerB='#888888', gearC='#669bbc', spacerC='#888888', escD='#2a9d8f', spacerD='#888888', rocker='#a8325e')

a = 40
parts = gen.assembly(a)
items = [(p, COL[n]) for n, p in parts.items() if n != 'front_plate']
# śruby palca i gumki (szare walce)
arm = lambda r: gen.pol(r, a)
items.append((gen.cyl(1.5, -45.4, 4.4, arm(gen.P['r_finger'])), '#555555'))
items.append((gen.cyl(4.5, -45.4, -33.4, arm(gen.P['r_finger'])), '#333333'))
items.append((gen.cyl(1.5, 0.4, 40.4, arm(gen.P['r_band'])), '#555555'))
items.append((gen.cyl(3.0, 4.4, 30.0, arm(gen.P['r_band'])), '#dddddd'))
draw3d(items, 'zlozenie_bez_przedniej_plyty.png', elev=35, azim=-110, title='Mechanizm bez przedniej płyty')
items2 = items + [(parts['front_plate'], COL['front_plate'])]
items2.append((gen.band_spool().translate((*gen.POSTS['P5'], gen.GAP+gen.P['front_t'])), '#dddddd'))
draw3d(items2, 'zlozenie.png', elev=35, azim=-110, title='Złożony moduł (widok od strony gumki)')

# --- schemat 2D (widok z przodu, +Z)
fig, ax = plt.subplots(figsize=(11, 9), dpi=130)
def pl(cs, **kw):
    for poly in cs.to_polygons():
        p = np.vstack([poly, poly[:1]]); ax.plot(p[:, 0], p[:, 1], **kw)
def fill(cs, **kw):
    for poly in cs.to_polygons():
        ax.fill(poly[:, 0], poly[:, 1], **kw)
fill(gen.plate_outline(), color='#e8ecef'); pl(gen.plate_outline(), color='#9aa5b1', lw=1)
for aa, ls, lab in [(gen.A_MIN, '--', 'naciągnięta (start)'), (90, '-', 'nacisk spustu ~90°'), (gen.A_MAX, ':', 'ogranicznik')]:
    p = gen.pol(gen.P['r_finger'], aa); ax.plot([0, p[0]], [0, p[1]], ls, color='#e4572e', lw=2, label='ramię: '+lab)
    ax.add_patch(plt.Circle(p, 4.5, color='#333', alpha=.5))
s0 = gen.TH_B-gen.A_MAX-8+40; 
def sec(cs, ang): return cs.rotate(ang)
pl(gen.gear2d(48).rotate(40) ^ gen.wedge(40, gen.TH_B-gen.A_MAX-8+40, gen.TH_B-gen.A_MIN+8+40), color='#e4572e', lw=.8)
pl(gen.gear2d(12).translate(tuple(gen.B)), color='#f3a712', lw=.8)
pl(gen.gear2d(36).translate(tuple(gen.B)), color='#29335c', lw=.8)
pl(gen.gear2d(12).translate(tuple(gen.C)), color='#669bbc', lw=.8)
pl(gen.gear2d(32).translate(tuple(gen.C)), color='#669bbc', lw=.8)
pl(gen.gear2d(12).translate(tuple(gen.D)), color='#2a9d8f', lw=.8)
pl(gen.escape2d().translate(tuple(gen.D)), color='#2a9d8f', lw=1.2)
r = gen.rocker().slice(19.5).translate(tuple(gen.E)); pl(r, color='#a8325e', lw=1.2)
for n, c in gen.AXLES.items():
    ax.plot(*c, 'k+'); ax.annotate(n, c+np.array([2, 2]), fontsize=12, weight='bold')
for n, c in gen.POSTS.items():
    ax.add_patch(plt.Circle(c, 4, color='#555', alpha=.6)); ax.annotate(n, c+np.array([4.5, -6]), fontsize=9)
pb = gen.pol(gen.P['r_band'], 90); ax.plot([pb[0], gen.POSTS['P5'][0]], [pb[1], gen.POSTS['P5'][1]], color='#c08a00', lw=3, alpha=.7, label='gumka (przy nacisku)')
pb = gen.pol(gen.P['r_band'], gen.A_MIN); ax.plot([pb[0], gen.POSTS['P5'][0]], [pb[1], gen.POSTS['P5'][1]], color='#c08a00', lw=3, alpha=.35, ls='--', label='gumka (naciągnięta)')
ax.annotate('', xy=gen.pol(56, 70), xytext=gen.pol(56, 10), arrowprops=dict(arrowstyle='->', color='#e4572e', lw=2, connectionstyle='arc3,rad=0.3'))
ax.text(*gen.pol(60, 40), 'bieg\n(~5 s)', color='#e4572e')
ax.annotate('przód aparatu →', (25, -45), fontsize=11)
ax.set_aspect('equal'); ax.grid(alpha=.3); ax.legend(loc='lower left', fontsize=8)
ax.set_title('Widok od zewnątrz (od strony przedniej płyty) – osie, słupki, zakres ruchu ramienia [mm]')
plt.tight_layout(); plt.savefig(os.path.join(IMG, 'schemat.png')); plt.close(fig)

# --- sprzęgło
fig, ax = plt.subplots(figsize=(6, 6), dpi=130)
pl(gen.gearB().slice(6.5), color='#29335c'); fill(gen.pawls2d(), color='#f3a712', alpha=.8)
ax.annotate('', xy=gen.pol(15.5, -60), xytext=gen.pol(15.5, -20), arrowprops=dict(arrowstyle='->', lw=2, connectionstyle='arc3,rad=-0.3'))
ax.text(*gen.pol(17, -45), 'napęd\n(zgodnie z zegarem)', fontsize=8)
ax.set_aspect('equal'); ax.set_title('Sprzęgło zapadkowe w kole B (przekrój)'); ax.grid(alpha=.3)
plt.tight_layout(); plt.savefig(os.path.join(IMG, 'sprzeglo.png')); plt.close(fig)

# --- uchwyt z aparatem
cam = gen.M.cube((gen.CAM['W'], gen.CAM['Dp'], gen.CAM['H'])).translate((-gen.CAM['W']/2, -gen.CAM['Dp'], 0))
lens = gen.M.cylinder(12, 30, 30, 48).rotate((-90, 0, 0)).translate((-20, 0, 70))
br = gen.bracket()
# moduł: z_mod = X - (Xs+0.5+4.5+5), x_mod = Y - YA, y_mod = Z - ZA
Xs = gen.CAM['W']/2; YA = 4.0; ZA = 40.0
T = np.array([[0, 0, 1, Xs+10.0], [1, 0, 0, YA], [0, 1, 0, ZA]], float)
mod = [gen.back_plate(), gen.front_plate(), gen.lever().rotate((0, 0, 85))]
items = [(cam, '#d9d4c7'), (lens, '#333333'), (br, '#3d7dd8')] + [(p.transform(T), c) for p, c in zip(mod, ['#9aa5b1', '#c9d3dd', '#e4572e'])]
fp = gen.pol(gen.P['r_finger'], 85)
items.append((gen.cyl(1.5, -40, 4.4, fp).transform(T), '#555555'))
draw3d(items, 'uchwyt_z_aparatem.png', elev=20, azim=-35, title='Uchwyt + moduł na prawym boku aparatu (poglądowo)')
print('ok')
