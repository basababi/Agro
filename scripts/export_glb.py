"""Export the Agro-Forest Learning Center .blend to a Draco-compressed GLB.

Runs inside Blender in background mode and never saves the .blend:

    blender -b <file.blend> --python-exit-code 1 --python scripts/export_glb.py -- <out.glb>

Everything below changes the scene in memory only.
"""
import os
import sys
from collections import Counter

import bpy

# Collection name -> value of the "group" custom property (glTF extras -> userData.group).
GROUPS = {
    "01_Terrain": "terrain",
    "02_Building": "building",
    "03_Interior_F1": "floor1",
    "04_Interior_F2": "floor2",
    "05_Greenhouse": "greenhouse",
    "06_Outdoor_Modules": "outdoor",
    "07_Vegetation": "vegetation",
    "08_Paths_Signs": "paths",
}
SKIP_COLLECTION = "09_Lights_Cameras"
GRASS_HEX = 0x93A35C
MAX_BYTES = 8 * 1024 * 1024
# The signs use the default curve resolution (12), which turns 48 small labels into ~670k
# triangles. 3 is visually identical at 8-25 cm letter height and keeps phones fast.
TEXT_RESOLUTION = 3


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear_rgba(value):
    channels = ((value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF)
    return (*(srgb_to_linear(c / 255.0) for c in channels), 1.0)


def remove_skipped_collection():
    coll = bpy.data.collections.get(SKIP_COLLECTION)
    if coll is None:
        print(f"[export] WARNING: collection {SKIP_COLLECTION!r} not found")
        return 0
    objects = list(coll.all_objects)
    for obj in objects:
        bpy.data.objects.remove(obj, do_unlink=True)
    return len(objects)


def convert_text_to_mesh():
    """Replace every FONT object with a mesh object of the same name and transform."""
    fonts = [o for o in bpy.data.objects if o.type == "FONT"]
    for obj in fonts:
        obj.data.resolution_u = min(obj.data.resolution_u, TEXT_RESOLUTION)
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()

    # Evaluate all texts first: adding/removing objects invalidates the depsgraph.
    meshes = [(o, bpy.data.meshes.new_from_object(o.evaluated_get(depsgraph))) for o in fonts]

    converted = []
    for old, mesh in meshes:
        name = old.name
        world = old.matrix_world.copy()
        if not mesh.materials:
            for slot in old.material_slots:
                if slot.material:
                    mesh.materials.append(slot.material)

        new = bpy.data.objects.new(name + "__mesh", mesh)
        for coll in old.users_collection:
            coll.objects.link(new)
        new.parent = old.parent
        new.parent_type = old.parent_type
        new.matrix_parent_inverse = old.matrix_parent_inverse.copy()
        new.matrix_basis = old.matrix_basis.copy()
        new.hide_render = old.hide_render

        bpy.data.objects.remove(old, do_unlink=True)
        new.name = name
        mesh.name = name
        converted.append((new, world))

    bpy.context.view_layer.update()
    drift = 0.0
    for new, world in converted:
        for row_new, row_old in zip(new.matrix_world, world):
            for a, b in zip(row_new, row_old):
                drift = max(drift, abs(a - b))
    if drift > 1e-4:
        raise RuntimeError(f"text objects moved during conversion (max matrix drift {drift:.6f})")
    return len(converted)


def tag_groups():
    counts = Counter()
    for coll_name, group in GROUPS.items():
        coll = bpy.data.collections.get(coll_name)
        if coll is None:
            raise RuntimeError(f"collection {coll_name!r} not found in the .blend")
        for obj in coll.all_objects:
            obj["group"] = group
            counts[group] += 1
    return counts


def flatten_grass():
    mat = bpy.data.materials.get("grass")
    if mat is None or mat.node_tree is None:
        print("[export] WARNING: material 'grass' not found")
        return False
    nodes = mat.node_tree.nodes
    for node in list(nodes):
        if node.type in {"TEX_NOISE", "VALTORGB"}:
            nodes.remove(node)
    bsdf = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        print("[export] WARNING: 'grass' has no Principled BSDF")
        return False
    base = bsdf.inputs["Base Color"]
    for link in list(base.links):
        mat.node_tree.links.remove(link)
    base.default_value = hex_to_linear_rgba(GRASS_HEX)
    return True


def export_glb(out_path):
    wanted = dict(
        filepath=out_path,
        check_existing=False,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_extras=True,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_texcoords=False,  # plain colour materials, no textures
        use_selection=False,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
    )
    # Parameter names change between Blender versions: only pass the ones that exist.
    available = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    missing = sorted(k for k in wanted if k not in available)
    if missing:
        print(f"[export] WARNING: exporter has no parameter(s): {', '.join(missing)}")
    for required in ("export_format", "export_yup", "export_extras", "export_draco_mesh_compression_enable"):
        if required in missing:
            raise RuntimeError(f"glTF exporter is missing required parameter {required!r}")

    kwargs = {k: v for k, v in wanted.items() if k in available}
    result = bpy.ops.export_scene.gltf(**kwargs)
    if "FINISHED" not in result:
        raise RuntimeError(f"glTF export did not finish: {result}")


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if len(argv) != 1:
        raise SystemExit("usage: blender -b <file.blend> --python export_glb.py -- <out.glb>")
    out_path = os.path.abspath(argv[0])
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    print(f"[export] Blender {bpy.app.version_string}")
    print(f"[export] source {bpy.data.filepath}")

    removed = remove_skipped_collection()
    texts = convert_text_to_mesh()
    counts = tag_groups()
    grass = flatten_grass()

    hidden = [o.name for o in bpy.data.objects if o.hide_get() or o.hide_render]
    untagged = [o.name for o in bpy.data.objects if "group" not in o.keys() and o.type != "EMPTY"]

    export_glb(out_path)

    size = os.path.getsize(out_path)
    print("[export] ---------------- report ----------------")
    print(f"[export] output            {out_path}")
    print(f"[export] file size         {size / 1024 / 1024:.2f} MB ({size} bytes)")
    print(f"[export] removed objects   {removed} (from {SKIP_COLLECTION})")
    print(f"[export] text -> mesh      {texts}")
    print(f"[export] grass flattened   {grass}")
    for group in GROUPS.values():
        print(f"[export] group {group:<11} {counts[group]} objects")
    print(f"[export] total tagged      {sum(counts.values())}")
    if hidden:
        print(f"[export] NOTE: {len(hidden)} hidden object(s) were exported too: {hidden[:10]}")
    if untagged:
        print(f"[export] WARNING: {len(untagged)} object(s) without a group: {untagged[:10]}")
    print("[export] -----------------------------------------")

    empty = [g for g in GROUPS.values() if counts[g] == 0]
    if empty:
        raise RuntimeError(f"group(s) with no objects: {empty}")
    if size >= MAX_BYTES:
        raise RuntimeError(f"GLB is {size} bytes, must stay under {MAX_BYTES}")


main()
