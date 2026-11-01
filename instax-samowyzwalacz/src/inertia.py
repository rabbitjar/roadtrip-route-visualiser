import gen, numpy as np, trimesh
def I_z(man, dens=1.24e-3):  # g/mm3
    mesh = man.to_mesh(); v=np.asarray(mesh.vert_properties)[:,:3]; f=np.asarray(mesh.tri_verts)
    tm = trimesh.Trimesh(v,f); tm.density = dens
    return tm.mass, tm.moment_inertia[2,2]  # g*mm2 about origin axis (center of mass?)
r = gen.rocker()
mesh = r.to_mesh(); v=np.asarray(mesh.vert_properties)[:,:3]; f=np.asarray(mesh.tri_verts)
tm = trimesh.Trimesh(v,f); tm.density=1.24e-3
# moment about z-axis through origin (E)
I = tm.mass_properties
Iorig = tm.moment_inertia_frame(np.eye(4))[2,2]
print("rocker mass g", tm.mass, "I_E [kg m2]", Iorig*1e-9, "COM", tm.center_mass)
# odważniki: śruba M3x8 (~0.6 g) + nakrętka (~0.25 g)
for x in gen.WEIGHT_X:
    print(f"para śrub M3x8 w x=±{x}: +{2*0.6e-3*(x*1e-3)**2:.2e}, para nakrętek: +{2*0.25e-3*(x*1e-3)**2:.2e}")
