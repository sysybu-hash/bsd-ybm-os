# Scratch (Damesek Eliezer): the dedicated builder's model.json path-traced in Blender's Cycles. Geometry is the model's, one
# object per material, nothing added to the building; the materials, sky, sun and lamps are decided here. Delete when done.
# blender -b --factory-startup --python cycles_scene.py -- <job.json>
import json, math, os, sys
import bpy, bmesh
import mathutils
from mathutils.geometry import tessellate_polygon

job = json.load(open(sys.argv[sys.argv.index("--") + 1], encoding="utf-8"))
model = json.load(open(job["model"], encoding="utf-8"))
TEX = job.get("textures", "")

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
cy = scene.cycles
cy.samples = int(job.get("samples", 256))
cy.use_adaptive_sampling = True
cy.adaptive_threshold = float(job.get("noise", 0.01))
cy.use_denoising = True
try:
    cy.denoiser = "OPENIMAGEDENOISE"
    cy.denoising_input_passes = "RGB_ALBEDO_NORMAL"
    cy.denoising_prefilter = "ACCURATE"
except Exception:
    pass
cy.max_bounces = 10
cy.diffuse_bounces = 4
cy.glossy_bounces = 4
cy.transmission_bounces = 10
cy.transparent_max_bounces = 12
cy.sample_clamp_indirect = 8.0
cy.caustics_reflective = False
cy.caustics_refractive = False
cy.light_sampling_threshold = 0.01
scene.render.film_transparent = False
scene.view_settings.view_transform = "AgX"
try:
    scene.view_settings.look = "AgX - Medium High Contrast"
except Exception:
    pass
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_depth = "8"

dev = job.get("device", "auto")
prefs = bpy.context.preferences.addons["cycles"].preferences
if dev != "cpu":
    for t in ("OPTIX", "CUDA", "HIP", "ONEAPI", "METAL"):
        try:
            prefs.compute_device_type = t
            prefs.get_devices()
            gpus = [d for d in prefs.devices if d.type != "CPU"]
            if gpus:
                for d in prefs.devices:
                    d.use = d.type != "CPU"
                cy.device = "GPU"
                print("DEVICE", t, [d.name for d in gpus])
                break
        except Exception:
            continue
if cy.device != "GPU":
    print("DEVICE CPU")
scene.render.threads_mode = "AUTO"

# ---------------------------------------------------------------- geometry: three's (x, y up, z south) → Blender (x, -z, y)
def B(x, y, z):
    return (x, -z, y)

buckets = {}
def bucket(mat):
    if mat not in buckets:
        buckets[mat] = ([], [])
    return buckets[mat]

def add_faces(mat, verts, faces):
    V, F = bucket(mat)
    o = len(V)
    V.extend(verts)
    F.extend([tuple(i + o for i in f) for f in faces])

def add_box(p):
    c, s = p["centre"], p["size"]
    hx, hy, hz = s["x"] / 2, s["y"] / 2, s["z"] / 2
    r = p.get("rotY") or 0.0
    cr, sr = math.cos(r), math.sin(r)
    pts = []
    for dx, dy, dz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]:
        lx, ly, lz = dx * hx, dy * hy, dz * hz
        # three's rotation.y: x' = x cos + z sin, z' = -x sin + z cos
        wx, wz = lx * cr + lz * sr, -lx * sr + lz * cr
        pts.append(B(c["x"] + wx, c["y"] + ly, c["z"] + wz))
    faces = [(0,3,2,1),(4,5,6,7),(0,1,5,4),(2,3,7,6),(1,2,6,5),(0,4,7,3)]
    add_faces(p["material"], pts, faces)

def ring_area(r):
    a = 0.0
    for i in range(len(r)):
        x0, y0 = r[i]; x1, y1 = r[(i + 1) % len(r)]
        a += x0 * y1 - x1 * y0
    return a / 2

def clean(r):
    out = []
    for q in r:
        if not out or abs(q[0] - out[-1][0]) > 1e-6 or abs(q[1] - out[-1][1]) > 1e-6:
            out.append((q[0], q[1]))
    if len(out) > 1 and abs(out[0][0] - out[-1][0]) < 1e-6 and abs(out[0][1] - out[-1][1]) < 1e-6:
        out.pop()
    return out

def extrude(mat, rings, to3d, d0, d1):
    """rings[0] outer, the rest holes, in a 2D frame; to3d(a, b, d) → Blender point; the solid runs d0..d1."""
    rings = [clean(r) for r in rings]
    rings = [r for r in rings if len(r) >= 3]
    if not rings:
        return
    flat = [q for r in rings for q in r]
    try:
        tris = tessellate_polygon([[mathutils.Vector((q[0], q[1], 0)) for q in r] for r in rings])
    except Exception:
        return
    n = len(flat)
    verts = [to3d(q[0], q[1], d0) for q in flat] + [to3d(q[0], q[1], d1) for q in flat]
    faces = []
    for t in tris:
        faces.append((t[0], t[2], t[1]))
        faces.append((t[0] + n, t[1] + n, t[2] + n))
    o = 0
    for r in rings:
        m = len(r)
        for i in range(m):
            a, b = o + i, o + (i + 1) % m
            faces.append((a, b, b + n, a + n))
        o += m
    add_faces(mat, verts, faces)

def add_prism(p):
    rings = [p["ring"]] + (p.get("holes") or [])
    sd = p.get("side")
    if sd:
        if sd["along"] == "x":   # (u, y): world x = u, height y; through the wall along world z from t0 to t1
            extrude(p["material"], rings, lambda u, y, d: B(u, y, d), sd["t0"], sd["t1"])
        else:                    # world z = u; through along world x
            extrude(p["material"], rings, lambda u, y, d: B(d, y, u), sd["t0"], sd["t1"])
    else:
        extrude(p["material"], rings, lambda x, z, y: B(x, y, z), p["y0"], p["y1"])

def add_cyl(p):
    c, r, h = p["centre"], p["radius"], p["height"]
    seg = 32
    verts, faces = [], []
    for k in range(seg):
        a = 2 * math.pi * k / seg
        verts.append(B(c["x"] + r * math.cos(a), c["y"] - h / 2, c["z"] + r * math.sin(a)))
        verts.append(B(c["x"] + r * math.cos(a), c["y"] + h / 2, c["z"] + r * math.sin(a)))
    for k in range(seg):
        a, b = 2 * k, 2 * ((k + 1) % seg)
        faces.append((a, b, b + 1, a + 1))
    faces.append(tuple(2 * k for k in range(seg))[::-1])
    faces.append(tuple(2 * k + 1 for k in range(seg)))
    add_faces(p["material"], verts, faces)

def add_terrain(p):
    nx, nz, dx = p["nx"], p["nz"], p["dx"]
    H = p["heights"]
    verts = [B(p["x0"] + i * dx, H[j * nx + i], p["z0"] + j * dx) for j in range(nz) for i in range(nx)]
    faces = [(j * nx + i, j * nx + i + 1, (j + 1) * nx + i + 1, (j + 1) * nx + i) for j in range(nz - 1) for i in range(nx - 1)]
    add_faces("terrain:" + p["material"], verts, faces)

for p in model["primitives"]:
    t = p["type"]
    if t == "box": add_box(p)
    elif t == "prism": add_prism(p)
    elif t == "cylinder": add_cyl(p)
    elif t == "terrain": add_terrain(p)

# ---------------------------------------------------------------- materials
def srgb(h):
    h = h.lstrip("#")
    def lin(c):
        c = c / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin(int(h[0:2], 16)), lin(int(h[2:4], 16)), lin(int(h[4:6], 16)), 1.0)

def new_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return m, nt, bsdf

def plane_vec(nt):
    """A face's own 2D coordinates in world metres: walls by the axis they face, floors by plan."""
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sp = nt.nodes.new("ShaderNodeSeparateXYZ"); nt.links.new(geo.outputs["Position"], sp.inputs[0])
    sn = nt.nodes.new("ShaderNodeSeparateXYZ"); nt.links.new(geo.outputs["Normal"], sn.inputs[0])
    def absn(o):
        a = nt.nodes.new("ShaderNodeMath"); a.operation = "ABSOLUTE"; nt.links.new(o, a.inputs[0]); return a.outputs[0]
    ax, ay, az = absn(sn.outputs[0]), absn(sn.outputs[1]), absn(sn.outputs[2])
    def comb(a, b):
        c = nt.nodes.new("ShaderNodeCombineXYZ"); nt.links.new(a, c.inputs[0]); nt.links.new(b, c.inputs[1]); return c.outputs[0]
    v_xz = comb(sp.outputs[0], sp.outputs[2])     # wall facing ±Y
    v_yz = comb(sp.outputs[1], sp.outputs[2])     # wall facing ±X
    v_xy = comb(sp.outputs[0], sp.outputs[1])     # floor / roof
    gt = nt.nodes.new("ShaderNodeMath"); gt.operation = "GREATER_THAN"; nt.links.new(ax, gt.inputs[0]); nt.links.new(ay, gt.inputs[1])
    m1 = nt.nodes.new("ShaderNodeMix"); m1.data_type = "VECTOR"
    nt.links.new(gt.outputs[0], m1.inputs["Factor"]); nt.links.new(v_xz, m1.inputs[4]); nt.links.new(v_yz, m1.inputs[5])
    hz = nt.nodes.new("ShaderNodeMath"); hz.operation = "GREATER_THAN"; nt.links.new(az, hz.inputs[0]); hz.inputs[1].default_value = 0.7
    m2 = nt.nodes.new("ShaderNodeMix"); m2.data_type = "VECTOR"
    nt.links.new(hz.outputs[0], m2.inputs["Factor"]); nt.links.new(m1.outputs[1], m2.inputs[4]); nt.links.new(v_xy, m2.inputs[5])
    return m2.outputs[1]

def bump(nt, bsdf, height, strength=0.3, dist=0.01):
    b = nt.nodes.new("ShaderNodeBump"); b.inputs["Strength"].default_value = strength; b.inputs["Distance"].default_value = dist
    nt.links.new(height, b.inputs["Height"]); nt.links.new(b.outputs["Normal"], bsdf.inputs["Normal"])

def noise(nt, vec, scale, detail=6, rough=0.6):
    n = nt.nodes.new("ShaderNodeTexNoise"); n.inputs["Scale"].default_value = scale; n.inputs["Detail"].default_value = detail
    n.inputs["Roughness"].default_value = rough
    if vec is not None: nt.links.new(vec, n.inputs["Vector"])
    return n

def mat_cladding(name, c1, c2, mortar, course=0.26, length=0.62):
    """Natural stone cladding: courses of 25 + 1 cm (the elevations' note), blocks of random length, a tooled face."""
    m, nt, bsdf = new_mat(name)
    vec = plane_vec(nt)
    br = nt.nodes.new("ShaderNodeTexBrick")
    br.inputs["Color1"].default_value = srgb(c1); br.inputs["Color2"].default_value = srgb(c2)
    br.inputs["Mortar"].default_value = srgb(mortar)
    br.inputs["Scale"].default_value = 1.0
    br.inputs["Mortar Size"].default_value = 0.008
    br.inputs["Mortar Smooth"].default_value = 0.15
    br.inputs["Bias"].default_value = 0.0
    br.inputs["Brick Width"].default_value = length
    br.inputs["Row Height"].default_value = course
    br.offset = 0.5; br.offset_frequency = 2; br.squash = 0.82; br.squash_frequency = 3
    nt.links.new(vec, br.inputs["Vector"])
    n = noise(nt, vec, 7.0, 8, 0.65)
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "OVERLAY"; mix.inputs["Factor"].default_value = 0.18
    nt.links.new(br.outputs["Color"], mix.inputs[6]); nt.links.new(n.outputs["Color"], mix.inputs[7])
    nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.82
    fine = noise(nt, vec, 60.0, 4, 0.7)
    h = nt.nodes.new("ShaderNodeMath"); h.operation = "MULTIPLY_ADD"
    nt.links.new(br.outputs["Fac"], h.inputs[0]); h.inputs[1].default_value = -1.0; nt.links.new(fine.outputs["Fac"], h.inputs[2])
    bump(nt, bsdf, h.outputs[0], 0.45, 0.006)
    return m

def mat_plain(name, col, rough, bump_scale=0.0, metal=0.0, spec=0.5):
    m, nt, bsdf = new_mat(name)
    bsdf.inputs["Base Color"].default_value = srgb(col)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    try: bsdf.inputs["Specular IOR Level"].default_value = spec
    except Exception: pass
    if bump_scale:
        n = noise(nt, None, bump_scale, 6, 0.6)
        bump(nt, bsdf, n.outputs["Fac"], 0.08, 0.003)
    return m

def tex_node(nt, path, non_color=False, sizeM=1.0):
    img = bpy.data.images.load(path, check_existing=True)
    if non_color: img.colorspace_settings.name = "Non-Color"
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = img; t.projection = "BOX"; t.projection_blend = 0.2
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (1 / sizeM, 1 / sizeM, 1 / sizeM)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"]); nt.links.new(mp.outputs["Vector"], t.inputs["Vector"])
    return t

def mat_scan(name, folder, sizeM, tint=None, rough_scale=1.0, normal=1.0):
    m, nt, bsdf = new_mat(name)
    d = os.path.join(TEX, folder)
    if not os.path.isdir(d):
        bsdf.inputs["Base Color"].default_value = srgb("#6b4a33"); return m
    diff = tex_node(nt, os.path.join(d, "diff.jpg"), False, sizeM)
    if tint:
        mul = nt.nodes.new("ShaderNodeMix"); mul.data_type = "RGBA"; mul.blend_type = "MULTIPLY"; mul.inputs["Factor"].default_value = 1.0
        nt.links.new(diff.outputs["Color"], mul.inputs[6]); mul.inputs[7].default_value = srgb(tint)
        nt.links.new(mul.outputs[2], bsdf.inputs["Base Color"])
    else:
        nt.links.new(diff.outputs["Color"], bsdf.inputs["Base Color"])
    rp = os.path.join(d, "rough.jpg")
    if os.path.exists(rp):
        r = tex_node(nt, rp, True, sizeM)
        mr = nt.nodes.new("ShaderNodeMath"); mr.operation = "MULTIPLY"; mr.inputs[1].default_value = rough_scale
        nt.links.new(r.outputs["Color"], mr.inputs[0]); nt.links.new(mr.outputs[0], bsdf.inputs["Roughness"])
    npth = os.path.join(d, "nor.jpg")
    if os.path.exists(npth):
        nn = tex_node(nt, npth, True, sizeM)
        nm = nt.nodes.new("ShaderNodeNormalMap"); nm.inputs["Strength"].default_value = normal
        nt.links.new(nn.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    return m

def mat_floor_tiles(name, c1, c2, grout, tile=0.6, rough=0.18):
    """Polished marble tiles, 60 × 60, hairline grout: a public building's floor."""
    m, nt, bsdf = new_mat(name)
    vec = plane_vec(nt)
    br = nt.nodes.new("ShaderNodeTexBrick")
    br.inputs["Color1"].default_value = srgb(c1); br.inputs["Color2"].default_value = srgb(c2); br.inputs["Mortar"].default_value = srgb(grout)
    br.inputs["Scale"].default_value = 1.0; br.inputs["Mortar Size"].default_value = 0.003
    br.inputs["Brick Width"].default_value = tile; br.inputs["Row Height"].default_value = tile
    br.offset = 0.0
    nt.links.new(vec, br.inputs["Vector"])
    vein = noise(nt, vec, 2.2, 12, 0.72)
    wave = nt.nodes.new("ShaderNodeTexWave"); wave.inputs["Scale"].default_value = 1.6; wave.inputs["Distortion"].default_value = 9.0
    wave.inputs["Detail"].default_value = 6; nt.links.new(vec, wave.inputs["Vector"])
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"; mix.inputs["Factor"].default_value = 0.12
    nt.links.new(br.outputs["Color"], mix.inputs[6]); nt.links.new(wave.outputs["Color"], mix.inputs[7])
    nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    r = nt.nodes.new("ShaderNodeMapRange"); r.inputs["To Min"].default_value = rough; r.inputs["To Max"].default_value = rough + 0.12
    nt.links.new(vein.outputs["Fac"], r.inputs["Value"]); nt.links.new(r.outputs["Result"], bsdf.inputs["Roughness"])
    bump(nt, bsdf, br.outputs["Fac"], 0.25, 0.002)
    return m

def mat_glass(name, tint="#dfeae8", rough=0.0):
    m, nt, bsdf = new_mat(name)
    bsdf.inputs["Base Color"].default_value = srgb(tint)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["IOR"].default_value = 1.52
    bsdf.inputs["Transmission Weight"].default_value = 1.0
    return m

def mat_velvet(name, col):
    m, nt, bsdf = new_mat(name)
    bsdf.inputs["Base Color"].default_value = srgb(col)
    bsdf.inputs["Roughness"].default_value = 0.9
    bsdf.inputs["Sheen Weight"].default_value = 1.0
    bsdf.inputs["Sheen Roughness"].default_value = 0.35
    bsdf.inputs["Sheen Tint"].default_value = srgb("#e8a0a0")
    return m

def mat_soil(name):
    """Beit Shemesh's hillside: dry pale earth, limestone showing through, sparse dry grass."""
    m, nt, bsdf = new_mat(name)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    n1 = noise(nt, tc.outputs["Object"], 0.35, 10, 0.62)
    n2 = noise(nt, tc.outputs["Object"], 3.0, 8, 0.7)
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    els = ramp.color_ramp.elements
    els[0].position = 0.38; els[0].color = srgb("#9a8a6c")
    els[1].position = 0.62; els[1].color = srgb("#cdbf9f")
    e = els.new(0.5); e.color = srgb("#8f8a5a")
    nt.links.new(n1.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.95
    bump(nt, bsdf, n2.outputs["Fac"], 0.6, 0.05)
    return m

MATS = {
    "jerusalemStone": mat_cladding("jerusalemStone", "#e3d3b0", "#d2bf98", "#e9dfca"),
    "stone": mat_cladding("stone", "#ddcca8", "#cbb791", "#e6dcc6"),
    "stoneDark": mat_plain("stoneDark", "#4e5054", 0.35, 120),
    "plaster": mat_plain("plaster", "#f1eee8", 0.92, 40),
    "slab": mat_plain("slab", "#eeebe5", 0.92, 30),
    "concrete": mat_plain("concrete", "#b9b5ad", 0.9, 25),
    "floorStone": mat_floor_tiles("floorStone", "#ece6da", "#e2dbcd", "#c9c1b2"),
    "glass": mat_glass("glass"),
    "frame": mat_plain("frame", "#3a3d41", 0.38, 0, 0.85),
    "darkSteel": mat_plain("darkSteel", "#2b2d30", 0.4, 0, 0.9),
    "metal": mat_plain("metal", "#b9bbbd", 0.3, 0, 1.0),
    "timber": mat_scan("timber", "black_walnut_veneer_01", 1.2, "#e8c9a2", 0.8, 0.6),
    "walnut": mat_scan("walnut", "black_walnut_veneer_01", 1.2, None, 0.7, 0.6),
    "worktop": mat_plain("worktop", "#d9cbb4", 0.45),
    "ceramic": mat_plain("ceramic", "#f6f6f3", 0.08, 0, 0, 0.7),
    "velvet": mat_velvet("velvet", "#5a0f1c"),
    "upholstery": mat_plain("upholstery", "#5b4a3c", 0.85, 200),
    "upholsteryAccent": mat_plain("upholsteryAccent", "#8a6a3a", 0.8, 200),
    "paving": mat_floor_tiles("paving", "#bdb6a8", "#aea697", "#8f887b", 0.4, 0.7),
    "terrain:soil": mat_soil("soil"),
    "terrain:paving": mat_floor_tiles("terrainPaving", "#bdb6a8", "#aea697", "#8f887b", 0.4, 0.7),
}

for mat, (V, F) in buckets.items():
    me = bpy.data.meshes.new(mat)
    me.from_pydata(V, [], F)
    me.validate(clean_customdata=False)
    me.update()
    ob = bpy.data.objects.new(mat, me)
    scene.collection.objects.link(ob)
    mm = MATS.get(mat) or MATS.get(mat.split(":")[-1]) or mat_plain(mat, "#bbbbbb", 0.8)
    ob.data.materials.append(mm)
    print("MESH", mat, len(V), len(F))

# a ground beyond the site's own terrain, a touch below it
gs = 400
gme = bpy.data.meshes.new("far-ground")
gme.from_pydata([(-gs, -gs, -0.6), (gs, -gs, -0.6), (gs, gs, -0.6), (-gs, gs, -0.6)], [], [(0, 1, 2, 3)])
gob = bpy.data.objects.new("far-ground", gme); scene.collection.objects.link(gob); gob.data.materials.append(MATS["terrain:soil"])

# ---------------------------------------------------------------- sky and sun
sun_az = math.radians(job.get("sunAzimuthDeg", 225))   # clockwise from north (−z in three = +Y in Blender)
sun_el = math.radians(job.get("sunElevationDeg", 38))
world = bpy.data.worlds.new("sky"); scene.world = world; world.use_nodes = True
wn = world.node_tree
for n in list(wn.nodes): wn.nodes.remove(n)
wout = wn.nodes.new("ShaderNodeOutputWorld")
sky = wn.nodes.new("ShaderNodeTexSky")
sky.sky_type = "NISHITA"
sky.sun_disc = True
sky.sun_elevation = sun_el
# Nishita's rotation: 0 looks along +Y (north here), counter-clockwise; ours runs clockwise from north
sky.sun_rotation = -sun_az
sky.altitude = 300
sky.air_density = 1.0
sky.dust_density = 1.6
sky.ozone_density = 1.0
bg = wn.nodes.new("ShaderNodeBackground"); bg.inputs["Strength"].default_value = float(job.get("skyStrength", 0.32))
wn.links.new(sky.outputs["Color"], bg.inputs["Color"]); wn.links.new(bg.outputs["Background"], wout.inputs["Surface"])

sun_dir = mathutils.Vector((math.sin(sun_az) * math.cos(sun_el), math.cos(sun_az) * math.cos(sun_el), math.sin(sun_el)))
sl = bpy.data.lights.new("sun", "SUN"); sl.energy = float(job.get("sunStrength", 4.2)); sl.angle = math.radians(0.6)
sl.color = (1.0, 0.96, 0.9)
so = bpy.data.objects.new("sun", sl); scene.collection.objects.link(so)
so.rotation_euler = (-sun_dir).to_track_quat("-Z", "Y").to_euler()

# ---------------------------------------------------------------- lamps the job asks for (scene metres, three's frame)
for L in job.get("lamps", []):
    kind = L.get("kind", "area")
    lt = bpy.data.lights.new("lamp", "AREA" if kind == "area" else "POINT")
    lt.energy = L["watts"]
    lt.color = tuple(L.get("color", (1.0, 0.86, 0.68)))
    if kind == "area":
        lt.shape = "RECTANGLE"; lt.size = L.get("w", 0.6); lt.size_y = L.get("d", 0.6)
    else:
        lt.shadow_soft_size = L.get("r", 0.05)
    lo = bpy.data.objects.new("lamp", lt); scene.collection.objects.link(lo)
    lo.location = B(L["x"], L["y"], L["z"])
    try: lo.visible_camera = False
    except Exception: pass

# ---------------------------------------------------------------- shots
os.makedirs(job["out"], exist_ok=True)
for shot in job["shots"]:
    cam = bpy.data.cameras.new(shot["id"])
    cam.sensor_fit = "VERTICAL"
    cam.angle_y = math.radians(shot["fovDeg"])
    cam.clip_start = 0.05; cam.clip_end = 2000
    co = bpy.data.objects.new(shot["id"], cam); scene.collection.objects.link(co)
    p, t = shot["position"], shot["target"]
    co.location = B(p["x"], p["y"], p["z"])
    d = mathutils.Vector(B(t["x"], t["y"], t["z"])) - co.location
    co.rotation_euler = d.to_track_quat("-Z", "Z").to_euler()
    if shot.get("shiftY"): cam.shift_y = shot["shiftY"]
    scene.camera = co
    scene.render.resolution_x = shot.get("w", 1600)
    scene.render.resolution_y = shot.get("h", 2000)
    scene.render.resolution_percentage = 100
    if shot.get("samples"): cy.samples = int(shot["samples"])
    if shot.get("exposure") is not None: scene.view_settings.exposure = shot["exposure"]
    scene.render.filepath = os.path.join(job["out"], shot["id"] + ".png")
    import time; t0 = time.time()
    bpy.ops.render.render(write_still=True)
    print("SHOT", shot["id"], round(time.time() - t0, 1), "s")
