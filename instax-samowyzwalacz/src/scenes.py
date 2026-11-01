"""Eksport scen do JSON (render three.js w przeglądarce headless)."""
import gen, numpy as np, json, sys, os
OUTD = sys.argv[1]
def mesh(man, col, opacity=1.0):
    m = man.to_mesh(); v = np.asarray(m.vert_properties)[:, :3]; f = np.asarray(m.tri_verts)
    return dict(v=np.round(v, 3).ravel().tolist(), f=f.ravel().tolist(), c=col, o=opacity)
COL = dict(back_plate='#8d99a6', front_plate='#c9d3dd', lever='#e4572e', pinionB='#f3a712', gearB='#29335c',
           spacerB='#777777', gearC='#5a8fb8', spacerC='#777777', escD='#2a9d8f', spacerD='#777777', rocker='#a8325e')
def screws(a):
    out = []
    pf = gen.pol(gen.P['r_finger'], a); pb = gen.pol(gen.P['r_band'], a)
    out.append(mesh(gen.cyl(1.5, -40, 4.4, pf) + gen.cyl(2.75, 4.4, 7.4, pf), '#444444'))
    out.append(mesh(gen.finger_pad().mirror((0, 0, 1)).translate((pf[0], pf[1], -28)), '#222222'))
    out.append(mesh(gen.cyl(1.5, 0.4, 40.4, pb) + gen.cyl(2.75, -2.6, 0.4, pb), '#444444'))
    out.append(mesh(gen.band_sleeve().translate((pb[0], pb[1], gen.Z['L1'][1])), '#eeeeee'))
    for c in list(gen.AXLES.values()) + list(gen.POSTS.values()):
        out.append(mesh(gen.cyl(2.75, gen.GAP+gen.P['front_t'], gen.GAP+gen.P['front_t']+3, c, 24), '#444444'))
    return out
scenes = {}
a = 30
parts = gen.assembly(a)
scenes['mechanizm'] = dict(meshes=[mesh(p, COL[n]) for n, p in parts.items() if n != 'front_plate'] + screws(a)[:4],
                          cam=[-40, -150, 150], target=[-25, 5, 8])
full = [mesh(p, COL[n]) for n, p in parts.items()] + screws(a)
full.append(mesh(gen.band_spool().translate((*gen.POSTS['P5'], gen.GAP+gen.P['front_t'])), '#eeeeee'))
scenes['modul'] = dict(meshes=full, cam=[60, -120, 170], target=[-20, 5, 10])
# pojedyncze ważne części
scenes['czesci'] = dict(meshes=[
    mesh(gen.pinionB().translate((-20, 0, 0)), '#f3a712'),
    mesh(gen.gearB().translate((20, 0, -5)), '#29335c'),
    mesh(gen.escD().translate((60, 0, 0)), '#2a9d8f'),
    mesh(gen.rocker().translate((110, 0, 0)), '#a8325e'),
    mesh(gen.gearC().translate((-60, 0, 0)), '#5a8fb8'),
], cam=[25, -110, 90], target=[25, 0, 5])
# aparat + uchwyt + moduł
cam = gen.M.cube((gen.CAM['W'], gen.CAM['Dp'], gen.CAM['H'])).translate((-gen.CAM['W']/2, -gen.CAM['Dp'], 0))
lens = gen.M.cylinder(14, 33, 33, 64).rotate((-90, 0, 0)).translate((-25, -1, 72))
Xs = gen.CAM['W']/2; YA = 4.0; ZA = 28.0
T = np.array([[0, 0, 1, Xs+10.0], [1, 0, 0, YA], [0, 1, 0, ZA]], float)
ac = 88
pm = gen.assembly(ac)
mods = [mesh(p.transform(T), COL[n]) for n, p in pm.items()]
for s in screws(ac):
    vv = np.array(s['v']).reshape(-1, 3); vv = vv @ T[:, :3].T + T[:, 3]; s['v'] = np.round(vv, 3).ravel().tolist(); mods.append(s)
scenes['na_aparacie'] = dict(meshes=[mesh(cam, '#e6e0d2'), mesh(lens, '#2b2b2b'), mesh(gen.bracket(), '#3d7dd8')] + mods,
                            cam=[330, 300, 190], target=[20, -10, 50])
for k, s in scenes.items():
    json.dump(s, open(os.path.join(OUTD, k+'.json'), 'w'))
print(list(scenes))
