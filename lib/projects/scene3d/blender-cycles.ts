import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import type { CameraRig, ViewSpec } from "@/lib/projects/scene3d/cameras";
import { QUALITY, type QualityProfile } from "@/lib/projects/scene3d/quality";
import { buildRenderPayload, type RenderPayload } from "@/lib/projects/scene3d/render-payload";
import { sunDirection, type SceneStyle } from "@/lib/projects/scene3d/style";
import type { FlatScene, Vec3 } from "@/lib/projects/scene3d/types";

/**
 * Blender's Cycles, as one more renderer behind the same scene.
 *
 * The measured flat is already a scene of boxes and materials. Chromium
 * rasterises it. Cycles path-traces the same payload: the camera, the sun
 * and the meshes are decided here, and Blender only draws. The website never
 * calls this — Cycles needs a local Blender — so a missing binary is a skip,
 * not a failed run.
 */

const log = createLogger("blender-cycles");

export type CyclesShot = {
  width: number;
  height: number;
  position: Vec3;
  target: Vec3;
  up: Vec3;
  fovDeg: number;
  cutAboveM?: number;
  sunAzimuthDeg?: number;
  sunElevationDeg?: number;
  samples?: number;
  deadlineMs?: number;
  /** A room seen from inside: a ceiling over the flat, no shadowless fill from above. */
  interior?: boolean;
  /** The sun low and amber, the sky Blender's own, the lamps warm. */
  golden?: boolean;
  /** From above, a warm late-afternoon light, brighter than the plain daylight: a sales sheet's inviting doll's house. */
  warm?: boolean;
  /** Hidden light along the ceilings, scene metres: a strip's centre, its length and width. */
  coves?: Array<{ x: number; y: number; z: number; w: number; d: number }>;
  /** A town round the building, for the windows to look out on: the flat's floor this high above the street. */
  surroundingsFloorM?: number;
  /** Scanned surfaces by material id. */
  textures?: Record<string, CyclesTexture>;
};

const SAMPLES: Record<QualityProfile["id"], number> = {
  preview: 32,
  booklet: 64,
  gpu: 128,
};

/** Where Blender is, if this machine has it. */
export function findBlender(envBin = env.BLENDER_BIN): string | null {
  const named = envBin?.trim();
  if (named && existsSync(named)) return named;
  const candidates = [
    "C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe",
    "C:\\Program Files\\Blender Foundation\\Blender 4.4\\blender.exe",
    "C:\\Program Files\\Blender Foundation\\Blender 4.3\\blender.exe",
    "C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe",
    "C:\\Program Files\\Blender Foundation\\Blender 4.1\\blender.exe",
    "C:\\Program Files\\Blender Foundation\\Blender 4.0\\blender.exe",
  ];
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  const found = spawnSync("where", ["blender"], { encoding: "utf8", windowsHide: true });
  const line = found.stdout?.split(/\r?\n/).map((row) => row.trim()).find((row) => row.endsWith(".exe") || row.endsWith("blender"));
  return line && existsSync(line) ? line : null;
}

/** True when the pipeline was asked to photograph with Cycles and Blender is installed. */
export function cyclesEnabled(): boolean {
  return env.FLOORPLAN_TRACE_ENGINE === "cycles" && findBlender() != null;
}

/**
 * The script Blender runs. It is plain Python against bpy: read the payload,
 * build one mesh per box, aim the camera, and render with Cycles.
 */
export function cyclesPython(): string {
  return `import json, math, sys
import bpy
import mathutils

payload_path, image_path = sys.argv[sys.argv.index("--") + 1:]
payload = json.load(open(payload_path, encoding="utf-8"))

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = int(payload.get("samples") or 32)
scene.cycles.use_denoising = True
# Denoised with the albedo and normal passes and kept crisp: edges and grain stay, the noise goes.
try:
    scene.cycles.denoiser = "OPENIMAGEDENOISE"
    scene.cycles.denoising_input_passes = "RGB_ALBEDO_NORMAL"
    scene.cycles.denoising_prefilter = "ACCURATE"
except Exception:
    pass
scene.cycles.filter_width = 1.0
prefs = bpy.context.preferences.addons["cycles"].preferences
for device_type in ("OPTIX", "CUDA", "HIP", "ONEAPI", "METAL"):
    try:
        prefs.compute_device_type = device_type
        prefs.get_devices()
        used = False
        for device in prefs.devices:
            if device.type != "CPU":
                device.use = True
                used = True
        if used:
            scene.cycles.device = "GPU"
            break
    except Exception:
        continue

def linear(c):
    # Hex colours are sRGB; Blender's inputs are linear. Sent as they were, every finish came out pale.
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def colour(value):
    n = int(value)
    return linear(((n >> 16) & 255) / 255), linear(((n >> 8) & 255) / 255), linear((n & 255) / 255), 1

# A floor or a wall is many boxes edge to edge: its grain is laid in the world's
# coordinates, one pattern across them all. In each box's own the pattern began
# again at every box, and the parquet came out in patches.
def seamless(name):
    key = name.lower()
    return key.startswith("floor") or key == "wall"

def surface_coords(nodes, name):
    if seamless(name):
        return nodes.new("ShaderNodeNewGeometry").outputs["Position"]
    return nodes.new("ShaderNodeTexCoord").outputs["Object"]

materials = {}
for name, spec in payload["materials"].items():
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    node = mat.node_tree.nodes.get("Principled BSDF")
    if node:
        base = colour(spec["color"])
        node.inputs["Base Color"].default_value = base
        node.inputs["Roughness"].default_value = float(spec.get("roughness") or 0.5)
        node.inputs["Metallic"].default_value = float(spec.get("metalness") or 0)
        glow = spec.get("emissive")
        if glow is not None:
            emit = "Emission Color" if "Emission Color" in node.inputs else "Emission"
            node.inputs[emit].default_value = colour(glow)
            if "Emission Strength" in node.inputs:
                node.inputs["Emission Strength"].default_value = 6.0
        alpha = spec.get("opacity")
        if alpha is not None and float(alpha) < 0.999:
            node.inputs["Alpha"].default_value = float(alpha)
            try:
                mat.blend_method = "BLEND"
            except Exception:
                pass
        key = name.lower()
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        coord = surface_coords(nodes, name)
        if ("glass" in key or "glaz" in key) and (payload.get("extra") or {}).get("interior"):
            # Clear float glass: the view through it and the room mirrored on it. The sun's
            # shadow rays pass straight through, or every pane would cast a shadow on the floor.
            node.inputs["Base Color"].default_value = (0.92, 0.95, 0.94, 1)
            node.inputs["Roughness"].default_value = 0.0
            node.inputs["Alpha"].default_value = 1.0
            if "IOR" in node.inputs:
                node.inputs["IOR"].default_value = 1.5
            transmit = "Transmission Weight" if "Transmission Weight" in node.inputs else "Transmission"
            if transmit in node.inputs:
                node.inputs[transmit].default_value = 1.0
            out = nodes.get("Material Output")
            path_node = nodes.new("ShaderNodeLightPath")
            clear = nodes.new("ShaderNodeBsdfTransparent")
            mix = nodes.new("ShaderNodeMixShader")
            links.new(path_node.outputs["Is Shadow Ray"], mix.inputs["Fac"])
            links.new(node.outputs["BSDF"], mix.inputs[1])
            links.new(clear.outputs["BSDF"], mix.inputs[2])
            links.new(mix.outputs["Shader"], out.inputs["Surface"])
        elif "glass" in key or "glaz" in key:
            node.inputs["Roughness"].default_value = 0.04
            transmit = "Transmission Weight" if "Transmission Weight" in node.inputs else "Transmission"
            if transmit in node.inputs:
                node.inputs[transmit].default_value = 0.9
            node.inputs["Alpha"].default_value = 0.35
        elif "wood" in key or "timber" in key:
            noise = nodes.new("ShaderNodeTexNoise")
            noise.inputs["Scale"].default_value = 9
            noise.inputs["Detail"].default_value = 8
            links.new(coord, noise.inputs["Vector"])
            mix = nodes.new("ShaderNodeMixRGB")
            mix.inputs["Color1"].default_value = (base[0] * 0.62, base[1] * 0.58, base[2] * 0.5, 1)
            mix.inputs["Color2"].default_value = base
            links.new(noise.outputs["Fac"], mix.inputs["Fac"])
            links.new(mix.outputs["Color"], node.inputs["Base Color"])
            bump = nodes.new("ShaderNodeBump")
            bump.inputs["Strength"].default_value = 0.18
            links.new(noise.outputs["Fac"], bump.inputs["Height"])
            links.new(bump.outputs["Normal"], node.inputs["Normal"])
            node.inputs["Roughness"].default_value = 0.42
        elif "tile" in key or "ceramic" in key or "stone" in key:
            brick = nodes.new("ShaderNodeTexBrick")
            brick.inputs["Color1"].default_value = base
            brick.inputs["Color2"].default_value = (base[0] * 0.9, base[1] * 0.9, base[2] * 0.88, 1)
            brick.inputs["Mortar"].default_value = (0.72, 0.7, 0.66, 1)
            brick.inputs["Scale"].default_value = 14
            brick.inputs["Mortar Size"].default_value = 0.015
            links.new(coord, brick.inputs["Vector"])
            links.new(brick.outputs["Color"], node.inputs["Base Color"])
            node.inputs["Roughness"].default_value = 0.28
        elif "wall" in key:
            noise = nodes.new("ShaderNodeTexNoise")
            noise.inputs["Scale"].default_value = 28
            noise.inputs["Detail"].default_value = 3
            links.new(coord, noise.inputs["Vector"])
            bump = nodes.new("ShaderNodeBump")
            bump.inputs["Strength"].default_value = 0.08
            links.new(noise.outputs["Fac"], bump.inputs["Height"])
            links.new(bump.outputs["Normal"], node.inputs["Normal"])
            node.inputs["Roughness"].default_value = 0.72
    materials[name] = mat

# Photographed surfaces (CC0 scans): a material named here takes its grain from
# the image — tinted to the style's colour, or only its relief where the scan's
# own colour is not the brief's (a check bouclé, a blue linen).
def textured(mat, tex):
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    scale = nodes.new("ShaderNodeMapping")
    scale.inputs["Scale"].default_value = (1 / tex["sizeM"],) * 3
    links.new(surface_coords(nodes, mat.name), scale.inputs["Vector"])
    def image(path, colour_data):
        node = nodes.new("ShaderNodeTexImage")
        node.image = bpy.data.images.load(path, check_existing=True)
        node.image.colorspace_settings.name = "sRGB" if colour_data else "Non-Color"
        node.projection = "BOX"
        node.projection_blend = 0.25
        links.new(scale.outputs["Vector"], node.inputs["Vector"])
        return node
    if tex.get("diff") and tex.get("mode") == "full":
        diff = image(tex["diff"], True)
        tint = nodes.new("ShaderNodeMixRGB")
        tint.blend_type = "MULTIPLY"
        tint.inputs["Fac"].default_value = 1.0
        tint.inputs["Color2"].default_value = (*[linear(c) for c in tex.get("tint", (1, 1, 1))], 1)
        links.new(diff.outputs["Color"], tint.inputs["Color1"])
        links.new(tint.outputs["Color"], bsdf.inputs["Base Color"])
        planks = tex.get("planks")
        if planks:
            # Long boards from a straight-grained scan: each board a shade of its own, a hairline joint between.
            boards = nodes.new("ShaderNodeTexBrick")
            boards.inputs["Scale"].default_value = 1.0
            boards.inputs["Brick Width"].default_value = float(planks[0])
            boards.inputs["Row Height"].default_value = float(planks[1])
            boards.inputs["Mortar Size"].default_value = 0.0015
            boards.inputs["Mortar Smooth"].default_value = 0.3
            boards.inputs["Bias"].default_value = 0.0
            boards.offset = 0.37
            boards.inputs["Color1"].default_value = (1, 1, 1, 1)
            boards.inputs["Color2"].default_value = (0.84, 0.8, 0.76, 1)
            boards.inputs["Mortar"].default_value = (0.35, 0.3, 0.26, 1)
            links.new(surface_coords(nodes, mat.name), boards.inputs["Vector"])
            shade = nodes.new("ShaderNodeMixRGB")
            shade.blend_type = "MULTIPLY"
            shade.inputs["Fac"].default_value = 1.0
            links.new(tint.outputs["Color"], shade.inputs["Color1"])
            links.new(boards.outputs["Color"], shade.inputs["Color2"])
            links.new(shade.outputs["Color"], bsdf.inputs["Base Color"])
    if tex.get("rough"):
        rough = image(tex["rough"], False)
        ramp = nodes.new("ShaderNodeMapRange")
        ramp.inputs["To Min"].default_value = float(tex.get("roughMin", 0.2))
        ramp.inputs["To Max"].default_value = float(tex.get("roughMax", 0.8))
        links.new(rough.outputs["Color"], ramp.inputs["Value"])
        links.new(ramp.outputs["Result"], bsdf.inputs["Roughness"])
    if tex.get("nor"):
        nor = image(tex["nor"], False)
        nmap = nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = float(tex.get("normal", 1.0))
        links.new(nor.outputs["Color"], nmap.inputs["Color"])
        links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

for name, tex in ((payload.get("extra") or {}).get("textures") or {}).items():
    mat = materials.get(name)
    if mat:
        try:
            textured(mat, tex)
        except Exception as err:
            print("texture failed", name, err)
textured_names = set(((payload.get("extra") or {}).get("textures") or {}).keys())

for index, mesh in enumerate(payload["meshes"]):
    # Scene Y is up and north is -z; Blender Z is up and north is +y, so (x, y, z) is sent as (x, -z, y).
    # (x, z, y) alone is a reflection: every still came out mirrored.
    if mesh.get("g"):
        raw = mesh["g"]["p"]
        verts = [(raw[i], -raw[i + 2], raw[i + 1]) for i in range(0, len(raw), 3)]
        idx = mesh["g"]["i"]
        faces = list(zip(idx[0::3], idx[2::3], idx[1::3]))
        data = bpy.data.meshes.new("tri%d" % index)
        data.from_pydata(verts, [], faces)
        data.update()
        obj = bpy.data.objects.new("tri%d" % index, data)
        bpy.context.collection.objects.link(obj)
    else:
        # size=2 is the cube from -1 to 1. Scale of half the measured edge
        # then lands on the real metres. size=1 drew every wall and floor at half.
        bpy.ops.mesh.primitive_cube_add(size=2, location=(mesh["c"][0], -mesh["c"][2], mesh["c"][1]))
        obj = bpy.context.active_object
        obj.scale = (max(mesh["s"][0], 0.001) / 2, max(mesh["s"][2], 0.001) / 2, max(mesh["s"][1], 0.001) / 2)
        # Edges eased a few millimetres: a sharp box reads as a model, a softened one as joinery and plaster.
        # A textured box is measured in metres, not in a unit cube: its grain keeps its size.
        if mesh["m"] in textured_names and min(mesh["s"]) <= 0.02:
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        # Not a floor or a wall: they are laid in pieces edge to edge, and eased each piece drew a groove at every join.
        if min(mesh["s"]) > 0.02 and not seamless(mesh["m"]):
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            bevel = obj.modifiers.new("ease", "BEVEL")
            bevel.width = min(0.006, min(mesh["s"]) / 4)
            bevel.segments = 2
            bevel.limit_method = "ANGLE"
    if not mesh.get("sh", True):
        obj.visible_shadow = False
    mat = materials.get(mesh["m"])
    if mat:
        obj.data.materials.append(mat)

cam_data = bpy.data.cameras.new("cam")
cam = bpy.data.objects.new("cam", cam_data)
bpy.context.collection.objects.link(cam)
scene.camera = cam
def as_vector(value):
    if isinstance(value, dict):
        return mathutils.Vector((float(value["x"]), float(value["y"]), float(value["z"])))
    return mathutils.Vector((float(value[0]), float(value[1]), float(value[2])))

cam_spec = payload["camera"]
loc = as_vector(cam_spec["position"])
target = as_vector(cam_spec["target"])
up = as_vector(cam_spec["up"]).normalized()
forward = target - loc
if forward.length < 1e-6:
    forward = mathutils.Vector((0, -1, 0))
# Blender's camera looks along its local -Z. A hand-built basis came out
# mirrored on this scene and the still was the empty backdrop.
cam.matrix_world = mathutils.Matrix.Identity(4)
cam.location = loc
cam.rotation_euler = forward.to_track_quat("-Z", "Y").to_euler()
if cam_spec.get("kind") == "orthographic":
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = float(cam_spec.get("halfWidth") or 5) * 2
else:
    cam_data.type = "PERSP"
    # three's field of view is vertical: fit the sensor the same way.
    fov = math.radians(float(cam_spec.get("fovDeg") or 32))
    cam_data.sensor_fit = "VERTICAL"
    cam_data.sensor_height = 24
    cam_data.lens = 12 / math.tan(fov / 2) if fov > 0.01 else 35
cam_data.clip_start = float(cam_spec.get("near") or 0.05)
cam_data.clip_end = float(cam_spec.get("far") or 400)

extra = payload.get("extra") or {}
interior = bool(extra.get("interior"))
golden = bool(extra.get("golden"))
warm = bool(extra.get("warm"))
sun_spec = payload["sun"]
sun = bpy.data.lights.new("sun", "SUN")
sun.energy = 4.5 if golden else float(sun_spec["intensity"]) * (2.2 if interior else 5)
sun.angle = math.radians(1.2 if golden else 2.2)
# Seen from above, daylight: the style's 2900 K tinted the whole doll's house pink and hid its floors' colours.
sun.color = (1.0, 0.52, 0.26) if golden else (colour(sun_spec["colour"])[:3] if interior else ((1.0, 0.8, 0.56) if warm else (1.0, 0.96, 0.9)))
sun_obj = bpy.data.objects.new("sun", sun)
bpy.context.collection.objects.link(sun_obj)
direction = as_vector(sun_spec["direction"]).normalized()
quat = (-direction).to_track_quat("-Z", "Y")
sun_obj.rotation_euler = quat.to_euler()
span = float(sun_spec.get("distance") or 20)
sun_obj.location = direction * span
# A second sun straight down, without shadows. One wall was shading a whole
# floor slab to black, so the plan read as a hole.
if not interior:
    fill = bpy.data.lights.new("fill", "SUN")
    # Soft from straight above: at 0.85 it flattened a doll's house to pastel, no shadow under a wall.
    fill.energy = 0.55 if warm else 0.35
    if warm:
        fill.color = (1.0, 0.9, 0.78)
    fill.use_shadow = False
    fill_obj = bpy.data.objects.new("fill", fill)
    bpy.context.collection.objects.link(fill_obj)
    fill_obj.rotation_euler = (0, 0, 0)

warm = (1.0, 0.78, 0.55)
# The flat's own lamps: pendants and lamps the staging hung.
for k, light in enumerate(payload.get("lights") or []):
    lamp = bpy.data.lights.new("lamp%d" % k, "POINT")
    lamp.energy = float(light["intensity"]) * 7
    lamp.shadow_soft_size = 0.08
    lamp.color = warm if golden else colour(light["colour"])[:3]
    lamp_obj = bpy.data.objects.new("lamp%d" % k, lamp)
    lamp_obj.location = (light["p"][0], -light["p"][2], light["p"][1])
    bpy.context.collection.objects.link(lamp_obj)

# Hidden light: a strip in a cove along the ceiling, an area light facing down and the glowing strip itself.
glow_mat = bpy.data.materials.new("cove")
glow_mat.use_nodes = True
gnode = glow_mat.node_tree.nodes.get("Principled BSDF")
emit_in = "Emission Color" if "Emission Color" in gnode.inputs else "Emission"
gnode.inputs[emit_in].default_value = (1.0, 0.82, 0.6, 1)
if "Emission Strength" in gnode.inputs:
    gnode.inputs["Emission Strength"].default_value = 8.0
for k, strip in enumerate(extra.get("coves") or []):
    length = max(strip["w"], strip["d"])
    area = bpy.data.lights.new("cove%d" % k, "AREA")
    area.shape = "RECTANGLE"
    area.size = max(strip["w"], 0.04)
    area.size_y = max(strip["d"], 0.04)
    # From above the strip runs along a wall's cut top, by the floor: at the ceiling's power it burned the rooms white,
    # and at 3–8 W/m it did not read, so the painter lit some rooms and not others (client, 03/11/2026).
    area.energy = (24 if extra.get("interior") else 22) * length
    area.color = warm
    area_obj = bpy.data.objects.new("cove%d" % k, area)
    area_obj.location = (strip["x"], -strip["z"], strip["y"] - 0.03)
    bpy.context.collection.objects.link(area_obj)
    if extra.get("interior"):
        # And up: the cove's band of light on the ceiling along the wall, the same in every room.
        up = bpy.data.lights.new("coveup%d" % k, "AREA")
        up.shape = "RECTANGLE"
        up.size = max(strip["w"], 0.04)
        up.size_y = max(strip["d"], 0.04)
        up.energy = 10 * length
        up.color = warm
        up_obj = bpy.data.objects.new("coveup%d" % k, up)
        up_obj.location = (strip["x"], -strip["z"], strip["y"] - 0.02)
        up_obj.rotation_euler = (math.pi, 0, 0)
        bpy.context.collection.objects.link(up_obj)
    bpy.ops.mesh.primitive_cube_add(size=2, location=(strip["x"], -strip["z"], strip["y"]))
    bar = bpy.context.active_object
    bar.scale = (max(strip["w"], 0.02) / 2, max(strip["d"], 0.02) / 2, 0.012)
    bar.data.materials.append(glow_mat)
    bar.visible_shadow = False
    # Hidden light: its glow on the wall and the ceiling, never the strip itself — seen, it was painted as a fitting.
    bar.visible_camera = False

ceiling = extra.get("ceiling")
if ceiling:
    ceil_mat = bpy.data.materials.new("ceilingPaint")
    ceil_mat.use_nodes = True
    cnode = ceil_mat.node_tree.nodes.get("Principled BSDF")
    cnode.inputs["Base Color"].default_value = (0.93, 0.91, 0.87, 1)
    cnode.inputs["Roughness"].default_value = 0.9
    bpy.ops.mesh.primitive_cube_add(size=2, location=((ceiling["x0"] + ceiling["x1"]) / 2, -(ceiling["z0"] + ceiling["z1"]) / 2, ceiling["y"] + 0.05))
    slab = bpy.context.active_object
    slab.scale = ((ceiling["x1"] - ceiling["x0"]) / 2, (ceiling["z1"] - ceiling["z0"]) / 2, 0.05)
    slab.data.materials.append(ceil_mat)

# What the windows look out on: the ground a few storeys down, a town of stone
# blocks round the building and hills on the horizon. Staging, not drawing —
# fixed by a seed so every view of the flat sees the same street.
around = extra.get("surroundings")
if around:
    import random
    rng = random.Random(14)
    level = float(around.get("floorLevelM") or 9.6)
    cx, cz = float(around["x"]), float(around["z"])
    keep = float(around.get("clearM") or 22)
    def flat_mat(name, rgb, rough=0.9):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        b = m.node_tree.nodes.get("Principled BSDF")
        b.inputs["Base Color"].default_value = (linear(rgb[0]), linear(rgb[1]), linear(rgb[2]), 1)
        b.inputs["Roughness"].default_value = rough
        return m
    # Each material's pieces are one mesh: a few thousand separate objects took Blender past ten minutes.
    groups = {}
    def box(group, x, y, z, w, d, h, turn=0.0):
        verts, faces = groups.setdefault(group, ([], []))
        c, s_ = math.cos(turn), math.sin(turn)
        base = len(verts)
        for dz in (-h / 2, h / 2):
            for dx, dy in ((-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2)):
                verts.append((x + dx * c - dy * s_, y + dx * s_ + dy * c, z + dz))
        for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            faces.append(tuple(base + i for i in f))
    box("ground", cx, -cz, -level - 0.06, 1600, 1600, 0.1)
    box("road", cx, -cz + 30, -level, 1200, 9, 0.04)
    box("road", cx - 34, -cz, -level, 9, 1200, 0.04)
    for i in range(320):
        r = keep + rng.random() ** 0.7 * 260
        a = rng.random() * math.tau
        x = cx + r * math.cos(a)
        y = -cz + r * math.sin(a)
        w = rng.uniform(12, 26)
        d = rng.uniform(12, 22)
        h = rng.choice([9, 12, 15, 18, 21, 24, 30]) * (0.6 if r > 180 else 1)
        turn = rng.choice([0, math.pi / 2]) + rng.uniform(-0.08, 0.08)
        box("stone%d" % (i % 4), x, y, -level + h / 2, w, d, h, turn)
        # A band of dark windows per storey.
        for f in range(int(h // 3)):
            box("farWindows", x, y, -level + 1.6 + f * 3, w * 0.86, d + 0.06, 1.1, turn)
    for i in range(140):
        r = keep * 0.7 + rng.random() * 200
        a = rng.random() * math.tau
        t = rng.uniform(3, 6)
        box("trees", cx + r * math.cos(a), -cz + r * math.sin(a), -level + 2 + t / 2, t, t, t, rng.random())
    for i in range(14):
        a = i / 14 * math.tau + rng.uniform(-0.1, 0.1)
        r = rng.uniform(700, 1000)
        box("hills", cx + r * math.cos(a), -cz + r * math.sin(a), -level + 20, rng.uniform(400, 700), rng.uniform(300, 500), rng.uniform(40, 110), a)
    looks = {
        "ground": ((0.52, 0.5, 0.42), 0.95), "road": ((0.22, 0.22, 0.23), 0.7), "farWindows": ((0.12, 0.13, 0.15), 0.15),
        "trees": ((0.24, 0.31, 0.17), 0.95), "hills": ((0.5, 0.48, 0.36), 1.0),
        "stone0": ((0.86, 0.8, 0.68), 0.85), "stone1": ((0.8, 0.74, 0.62), 0.85), "stone2": ((0.9, 0.86, 0.77), 0.85), "stone3": ((0.75, 0.69, 0.58), 0.85),
    }
    for group, (verts, faces) in groups.items():
        data = bpy.data.meshes.new(group)
        data.from_pydata(verts, [], faces)
        data.update()
        obj = bpy.data.objects.new(group, data)
        bpy.context.collection.objects.link(obj)
        rgb, rough = looks[group]
        obj.data.materials.append(flat_mat(group, rgb, rough))

world = bpy.data.worlds.new("world")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes.get("Background")
if bg and (golden or interior):
    # Outside the windows, a sky: Blender's own, the sun where the payload puts it.
    sky = world.node_tree.nodes.new("ShaderNodeTexSky")
    try:
        sky.sky_type = "NISHITA"
        d = as_vector(sun_spec["direction"]).normalized()
        sky.sun_elevation = math.asin(max(-1.0, min(1.0, d.z)))
        sky.sun_rotation = math.atan2(d.x, d.y)
        sky.sun_intensity = 0.4
    except Exception:
        pass
    world.node_tree.links.new(sky.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 0.35 if golden else 0.6
elif bg:
    bg.inputs["Color"].default_value = colour(payload["background"])
    bg.inputs["Strength"].default_value = 0.42

try:
    scene.view_settings.view_transform = "AgX"
except Exception:
    scene.view_settings.view_transform = "Filmic"
scene.view_settings.exposure = math.log2(max(float(payload.get("exposure") or 1), 0.05)) + (0.55 if interior else (-1.1 if warm else -1.3))
try:
    scene.view_settings.look = "AgX - Medium High Contrast"
except Exception:
    pass
scene.render.resolution_x = int(payload["width"])
scene.render.resolution_y = int(payload["height"])
scene.render.filepath = image_path
scene.render.image_settings.file_format = "JPEG"
scene.render.image_settings.quality = 92
bpy.ops.render.render(write_still=True)
`;
}

/** A scanned surface for one material: image paths on this machine, its real size, and whether its colour is used. */
export type CyclesTexture = {
  diff?: string;
  rough?: string;
  nor?: string;
  sizeM: number;
  /** "full": the scan's colour, multiplied by `tint`; "relief": its roughness and normal only. */
  mode: "full" | "relief";
  tint?: [number, number, number];
  roughMin?: number;
  roughMax?: number;
  normal?: number;
  /** Laid as boards, metres: each board's length and width. */
  planks?: [number, number];
};
type CyclesExtra = {
  interior: boolean;
  golden: boolean;
  warm: boolean;
  /** Blender axes: scene y is height. */
  ceiling: { x0: number; x1: number; z0: number; z1: number; y: number } | null;
  coves: Array<{ x: number; y: number; z: number; w: number; d: number }>;
  surroundings: { x: number; z: number; floorLevelM: number; clearM: number } | null;
  textures: Record<string, CyclesTexture>;
};
type CyclesPayload = RenderPayload & { samples: number; extra?: CyclesExtra };

function cameraVector(v: Vec3): [number, number, number] {
  // Scene Y is up and north -z; Blender's Z is up and north +y, so a scene point (x, y, z) is (x, -z, y).
  return [v.x, -v.z, v.y];
}

function payloadForCycles(payload: RenderPayload, samples: number, sun?: { azimuthDeg: number; elevationDeg: number }): CyclesPayload {
  const direction = sun
    ? sunDirection({ ...{ kelvin: 0, exposure: 1, sunIntensity: 1, skyIntensity: 1, skyColor: 0, groundColor: 0 }, sunAzimuthDeg: sun.azimuthDeg, sunElevationDeg: sun.elevationDeg })
    : { x: payload.sun.direction[0], y: payload.sun.direction[1], z: payload.sun.direction[2] };
  return {
    ...payload,
    samples,
    sun: { ...payload.sun, direction: [direction.x, -direction.z, direction.y] },
    camera: toBlenderCamera(payload.camera),
  };
}

/** Camera numbers in Blender's axes: Y of the scene becomes Blender Z. */
function vec3(tuple: [number, number, number]): Vec3 {
  return { x: tuple[0], y: tuple[1], z: tuple[2] };
}

function toBlenderCamera(camera: CameraRig): CameraRig {
  return {
    ...camera,
    position: vec3(cameraVector(camera.position)),
    target: vec3(cameraVector(camera.target)),
    up: vec3(cameraVector(camera.up)),
  };
}

type CyclesResult = {
  mimeType: string;
  base64: string;
  widthPx: number;
  heightPx: number;
  quality: QualityProfile["id"];
  ms: number;
};

async function runCycles(payload: CyclesPayload, deadlineMs?: number): Promise<CyclesResult | null> {
  const blender = findBlender();
  if (!blender) {
    log.warn("cycles skipped; blender is not installed");
    return null;
  }
  const started = Date.now();
  const dir = mkdtempSync(path.join(tmpdir(), "bsd-cycles-"));
  const jsonPath = path.join(dir, "payload.json");
  const pyPath = path.join(dir, "render.py");
  const imagePath = path.join(dir, "still.jpg");
  const budget = deadlineMs ? Math.max(5_000, deadlineMs - Date.now()) : 180_000;
  try {
    writeFileSync(jsonPath, JSON.stringify(payload));
    writeFileSync(pyPath, cyclesPython());
    // Asynchronous: a render takes minutes, and the server goes on serving meanwhile.
    const run = await new Promise<{ status: number | null; error?: string; stderr: string; stdout: string; timedOut: boolean }>((resolve) => {
      const child = spawn(blender, ["--background", "--python-exit-code", "1", "--python", pyPath, "--", jsonPath, imagePath], { windowsHide: true });
      let stderr = "";
      // Blender prints its own warnings (a missing texture, a fallback device) on stdout: kept, not thrown away.
      let stdout = "";
      let timedOut = false;
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = (stderr + chunk.toString("utf8")).slice(-4000);
      });
      child.stdout.on("data", (chunk: Buffer) => {
        stdout = (stdout + chunk.toString("utf8")).slice(-4000);
      });
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, budget);
      child.on("error", (err: Error) => {
        clearTimeout(timer);
        resolve({ status: null, error: err.message, stderr, stdout, timedOut });
      });
      child.on("close", (status: number | null) => {
        clearTimeout(timer);
        resolve({ status, stderr, stdout, timedOut });
      });
    });
    if (run.error || run.status !== 0 || !existsSync(imagePath)) {
      log.warn("cycles render failed", { status: run.status, timedOut: run.timedOut, budgetMs: budget, error: run.error, stderr: run.stderr.slice(-800), stdout: run.stdout.slice(-800) });
      return null;
    }
    const warnings = run.stdout.split(String.fromCharCode(10)).filter((row) => /warning|error|not found|fallback/i.test(row));
    if (warnings.length) log.warn("cycles rendered with warnings", { warnings: warnings.slice(-8) });
    const jpeg = readFileSync(imagePath);
    return {
      mimeType: "image/jpeg",
      base64: jpeg.toString("base64"),
      widthPx: payload.width,
      heightPx: payload.height,
      quality: "gpu",
      ms: Date.now() - started,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Photograph a flat with the pipeline's own camera. Same request the Chromium renderer takes. */
export const cyclesSceneRenderer = async (req: {
  scene: FlatScene;
  style: SceneStyle;
  view: ViewSpec;
  quality?: QualityProfile;
  deadlineMs?: number;
}): Promise<CyclesResult | null> => {
  const quality = req.quality ?? QUALITY.booklet;
  const payload = buildRenderPayload(req.scene, req.style, req.view, quality, await import("three"));
  return runCycles(payloadForCycles(payload, SAMPLES[quality.id]), req.deadlineMs);
};

/**
 * Photograph the flat from a camera the booklet already chose (the dollhouse
 * view), so a Cycles still lines up with the frame the rest of the pipeline measures.
 */
export async function photographWithCycles(
  scene: FlatScene,
  style: SceneStyle,
  shot: CyclesShot,
): Promise<CyclesResult | null> {
  // "overview" cuts the walls by default; a room seen from inside keeps them whole.
  const view: ViewSpec = { id: "overview", cutawayM: shot.interior ? 100 : shot.cutAboveM, fovDeg: shot.fovDeg };
  const payload = buildRenderPayload(scene, style, view, QUALITY.booklet, await import("three"));
  payload.width = shot.width;
  payload.height = shot.height;
  payload.camera = {
    kind: "perspective",
    position: shot.position,
    target: shot.target,
    up: shot.up,
    fovDeg: shot.fovDeg,
    near: 0.05,
    far: Math.max(40, shot.position.y * 8),
  };
  const sun = shot.sunAzimuthDeg != null && shot.sunElevationDeg != null
    ? { azimuthDeg: shot.sunAzimuthDeg, elevationDeg: shot.sunElevationDeg }
    : undefined;
  const sent = payloadForCycles(payload, shot.samples ?? SAMPLES.booklet, sun);
  const e = scene.extent;
  sent.extra = {
    interior: shot.interior === true,
    golden: shot.golden === true,
    warm: shot.warm === true,
    ceiling: shot.interior ? { x0: e.x - 1, x1: e.x + e.width + 1, z0: e.z - 1, z1: e.z + e.depth + 1, y: 2.7 } : null,
    coves: shot.coves ?? [],
    surroundings:
      shot.surroundingsFloorM != null
        ? { x: e.x + e.width / 2, z: e.z + e.depth / 2, floorLevelM: shot.surroundingsFloorM, clearM: Math.max(e.width, e.depth) / 2 + 14 }
        : null,
    textures: shot.textures ?? {},
  };
  return runCycles(sent, shot.deadlineMs);
}

export { cameraVector };
