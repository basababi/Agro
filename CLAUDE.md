# Agro-Forest Learning Center — 3D Web Viewer

> Монгол тэмдэглэл: Энэ файлыг Claude Code төсөл бүрийн эхэнд уншина. Доорх шаардлагын дагуу Blender загварыг вебэд гаргаж, хулгана, гар болон утсаар удирдан алхаж үздэг сайт хийж Vercel дээр байршуулна.

## 0. Context

- **What:** A public website where hackathon judges and visitors explore our team's 3D concept of the *Agro-Forest Learning Center* (Agro-Forest Learning Center Design Hackathon 2026, organised by ХААИС, МУИС, ШУТИС). Judges will mostly open it from a **QR code on their phones**; we will also demo it on a laptop during the 10–15 minute presentation.
- **Deadline:** event is Saturday **17 Oct 2026** (confirm with user). The site must be live and stable by **15 Oct**. Deploy a first working version to Vercel at the end of Phase 1, then improve.
- **User:** IT student on **Windows 11**, Blender **5.1.2** installed. **Always reply to the user in Mongolian.** Code, comments and commit messages in English.
- **The design concept** (already modelled in Blender): an arched, non-traditional 2-storey building on a 0.14 ha site (≈37.5 × 37.5 m), on a 15° slope facing north-west, 900 m from the forest edge. Ground floor = exhibition and learning zones in the middle, left wing (seen from the courtyard) = staff/office/kitchen, right wing = glass greenhouse-lab; first floor = laboratories only. Outdoors = 6 "Living Laboratory" modules.

## 1. Stack (fixed — ask before adding other heavy dependencies)

- Vite + React + TypeScript
- `three`, `@react-three/fiber`, `@react-three/drei`
- `three-mesh-bvh` for walk-mode collision (follow its official *characterMovement* example)
- `zustand` for UI state
- Plain CSS (CSS variables). No UI framework needed.
- Static deploy on **Vercel**. No backend, no environment variables, no analytics, no secrets.

## 2. Repository layout

```
agroforest-web/
  CLAUDE.md
  scripts/
    export_glb.py          # runs inside Blender (background mode)
    export-model.mjs       # Node wrapper: finds blender.exe, runs the export
  public/
    models/center.glb      # generated, committed (must stay < 8 MB)
    draco/                 # self-hosted Draco decoder (copied from three/examples/jsm/libs/draco/gltf)
  src/
    data/hotspots.json     # copy of Appendix A
    data/views.ts          # camera presets, spawn, tour route (Appendix B)
    scene/                 # Model, Lighting, FarGround, WalkController, OrbitRig, Hotspots
    ui/                    # Loading, StartScreen, Toolbar, InfoPanel, Minimap, HelpOverlay, About
    store.ts
  vercel.json
```

## 3. Source model (Blender)

- File: `C:\Users\Dell\Documents\AgroForest_LearningCenter_2026.blend`
- **Never modify or save the original `.blend`.** The export script opens it in background mode, changes things in memory only, exports, and quits without saving.
- Blender executable: try `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe`; otherwise search `C:\Program Files\Blender Foundation\` or ask the user. Allow override with env var `BLENDER_PATH`.
- Units: metres. Blender is Z-up.
- Every site object is parented to an empty **`SITE_FRAME`** rotated **45° around Z**, so in world space the square site is a diamond. Objects carry their world transform correctly in the export; nothing to undo.
- Collections → `group` value to write into each object's custom property (exported as glTF `extras` → three.js `object.userData.group`):

| Collection | group | Contents |
|---|---|---|
| `01_Terrain` | `terrain` | sloped terrain mesh, extends to ±45 m site-local |
| `02_Building` | `building` | slabs, walls, glass, green roof, solar panels, stair (`Bld_*`) |
| `03_Interior_F1` | `floor1` | ground-floor furniture, exhibits, partitions, signs (`F1_*`, `Label_*`) |
| `04_Interior_F2` | `floor2` | lab benches, cabinets, signs (`F2_*`, `Label_*`) |
| `05_Greenhouse` | `greenhouse` | frame, glass, benches, seedlings, grow lights (`GH_*`) |
| `06_Outdoor_Modules` | `outdoor` | nursery beds, pond, swales, insect hotels, amphitheatre (`OUT_*`, `Swale_*`, …) |
| `07_Vegetation` | `vegetation` | tree/shrub instances (`larch_000`, …) + name plates |
| `08_Paths_Signs` | `paths` | path ribbons, boundary curb, gate, module signs (`Path_*`, `PS_*`) |
| `09_Lights_Cameras` | — | **do not export** (Area lights, cameras, `Walk_Target`) |

- Materials are simple Principled BSDF colours. Names to know: `glass`, `gh_glass`, `water` (transparent), `screen`, `growlight`, `text` (emissive), `grass` (has a procedural noise → must be flattened), `plant`, `roofgreen`, `solar`, `wood`, `wooddark`, `concrete`, `white`, `metal`, `stone`, `path`, `soil`, `larch`, `pine`, `birch`, `shrub`, `trunk`, and flower colours `pink`, `yellow`, `purple`, `orange`.
- Signs are Blender **Text** objects in Mongolian Cyrillic (Arial, packed). They must be converted to meshes before export or they disappear.

## 4. Coordinates (already converted for three.js — Y-up, metres)

- Blender world `(x, y, z)` → three.js `(x, z, −y)` (the glTF exporter does this with `export_yup=True`).
- Site-local frame (used in Appendix C and for the minimap): origin = site centre, `+ly` points **downhill (north-west)**, building is on the uphill side.
  - local → three.js: `X = 0.7071·(lx − ly)`, `Z = −0.7071·(lx + ly)`
  - three.js → local: `lx = 0.7071·(X − Z)`, `ly = −0.7071·(X + Z)`
  - Site boundary: `|lx| ≤ 18.75` and `|ly| ≤ 18.75`. Terrain mesh ends at `|lx|,|ly| = 45`.
- **North is −Z** in three.js.
- Terrain height outside the building pad and pond: Blender `z ≈ −tan(15°)·ly`.

| Level | three.js Y |
|---|---|
| Plaza / courtyard in front of the building | 1.072 |
| Ground floor (F1) | 1.272 |
| First floor (F2) | 5.172 |
| Roof slab bottom | 8.372 |
| Ground at the gate | −4.98 |
| Site corner, uphill / downhill | +4.82 / −4.82 |

- **Stair** (20 steps, rise 0.195 m, run 0.28 m, width 0.9 m): bottom `[3.52, 1.27, 0.56]` → top `[6.81, 5.17, 5.09]`. The first-floor slab has an opening above it.
- **Openings you must be able to walk through:** gaps in the courtyard glass wall (main entrance in the middle, two side doors), a doorway in every interior partition, the end-wall door to the greenhouse link at about `[-6.62, 1.27, 6.63]`, and the greenhouse door. There are no door leaves; they are open gaps.

## 5. Export pipeline (Phase 0)

`scripts/export_glb.py`, run as `blender -b <blend> --python scripts/export_glb.py -- <out.glb>` via `npm run export-model`:

1. Delete everything in `09_Lights_Cameras` (in memory only).
2. Convert every `FONT` object to a mesh (`bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))`, keep world matrix, collection and the `text` material).
3. Set `obj["group"]` from the collection table above. Keep original object names.
4. Flatten the `grass` material: remove the noise/ramp nodes, set Base Color to `#93A35C`.
5. Export GLB: `export_format='GLB'`, `export_yup=True`, `export_apply=True`, `export_extras=True`, cameras and lights off, Draco mesh compression on (level 6). **Check the parameter names against the installed Blender first** (`bpy.ops.export_scene.gltf.get_rna_type().properties.keys()`), because they change between versions.
6. Print a report: file size, object count per group, number of former text objects.

**Acceptance:** `public/models/center.glb` exists, < 8 MB, every group present, Cyrillic signs visible in the viewer, original `.blend` unchanged (check its modified time).

If Blender's Draco gives problems, fall back to an uncompressed export plus `@gltf-transform/cli` compression — but **never** use its `join`, `flatten`, `simplify` or instancing steps, they destroy object names and walls.

## 6. Features and phases

Work **one phase at a time**. At the end of each phase: `npm run build` passes, run the dev server and check it in a browser (use a browser tool if you have one; otherwise ask the user to check and send screenshots), summarise in Mongolian what to test, `git commit`, then **stop and wait** for the user before starting the next phase.

### Phase 1 — Viewer + first deploy
- Load the GLB with drei `useGLTF(url, '/draco/')` (self-hosted decoder).
- Material fixes by material name: `glass`, `gh_glass` → transparent, opacity ≈ 0.25, `depthWrite: false`; `water` → opacity 0.8; `screen`, `growlight`, `text` → emissive.
- Lighting: drei `<Sky>`, a hemisphere light, one directional sun from the south-west, high. Shadows on desktop only (shadow camera covering ±30 m, map 2048).
- **Far ground:** the terrain ends at ±45 m site-local. Build a large ground mesh in code: an outer square ±400 m with a square hole ±44.9 m (site-local), vertex height Blender `z = −tan(15°)·ly − 0.03`, converted to three.js with the formulas in §4, same grass colour. Add fog (about 90–260 m) so its edge disappears.
- **Overview (orbit) mode:** drei `<CameraControls>`; start at preset `aerial`; min distance 3, max 120; keep the camera above the terrain.
- Loading screen with progress (`useProgress`): "Загвар ачаалж байна…".
- Start screen with two big buttons: **"Тойм харах"** and **"Дотор нь алхах"**.
- `vercel.json` with long cache headers for `/models/*` and `/draco/*`.
- **Deploy to Vercel** (GitHub repo → import in Vercel, preset *Vite*, build `npm run build`, output `dist`). The user logs in to GitHub/Vercel himself — never ask for or store tokens.

### Phase 2 — Walk mode (desktop)
- Pointer lock on click. Controls: **W A S D / arrow keys** move, **mouse** look, **Shift** run, **Space** small jump, **F** toggles fly mode (no gravity, **E/Q** up/down), **Esc** releases pointer and shows the menu.
- Eye height 1.65 m, capsule radius 0.3 m, height 1.7 m, walk 2.0 m/s, run 4.5 m/s, gravity −9.8.
- Collision: build one BVH from all meshes **except** `group === 'vegetation'`, emissive/`text` meshes, `plant` meshes and flower meshes. Add invisible cylinder colliders (r 0.25 m) at tree trunk positions instead.
- Stairs: if the capsule cannot climb the 0.195 m steps smoothly, add an invisible ramp collider along the stair line from §4 (do not change visible geometry).
- Keep the player inside site-local `|lx|, |ly| < 40`.
- Spawn at `spawn` (Appendix B), outside the gate looking up the main path.
- Must work: walk from the gate up the path, into the courtyard, through the main entrance, through each zone door, up the stair to the labs, and through the end-wall door into the greenhouse.

### Phase 3 — Hotspots, info panel, tours, cutaway
- Hotspots from Appendix A: drei `<Html>` pins showing the `badge`. Show all non-minor pins in overview mode; in walk mode show pins within 20 m and fade them by distance. Avoid `occlude` on many pins (performance).
- Click a pin (overview) or press **E** when within 3 m and looking at it (walk) → right-side info panel: `title`, `tagline`, `desc`, and a button **"Энд очих"** that flies the camera to `view`.
- Toolbar with camera presets (Appendix B, Mongolian labels) and **"Аялал"**: an automatic guided walk along `tourRoute` at about 1.5 m/s, looking ahead, pausable.
- **Cutaway** buttons "Бүтэн / 2 давхар / 1 давхар": clone the materials of meshes in groups `building`, `floor1`, `floor2`, `greenhouse` and apply a horizontal clipping plane at Y = 8.30 (removes the roof) or Y = 4.80 (removes floor 2 and the roof). Set those materials to `DoubleSide` while clipped. Disable the cutaway when entering walk mode.

### Phase 4 — Mobile
- Detect touch / coarse pointer. Default to overview mode on phones.
- Walk mode on touch: left-side virtual joystick to move, drag on the right side to look, buttons for fly up/down when flying. No pointer lock.
- All buttons ≥ 44 px, safe-area insets respected, UI readable at 360 px width.
- Performance: DPR capped (desktop 1.75, mobile 1.5), drei `<PerformanceMonitor>` / `<AdaptiveDpr>`, shadows off on mobile, `matrixAutoUpdate = false` for static objects. Target 60 fps on a mid-range phone; first load under ~5 s on 4G.

### Phase 5 — Minimap, language, about, polish
- Minimap (bottom-left): an SVG drawn from Appendix C in site-local coordinates, player dot plus view direction, north arrow, clickable in overview mode to fly to a module.
- **MN / EN** toggle (Mongolian default). English uses `en.title` and `en.tagline`; for the description show the Mongolian text if no English text exists.
- Help overlay on first visit (and via a "?" button), with the controls for desktop or mobile.
- "Төслийн тухай" panel: hackathon name, concept summary (Living Laboratory, 0.14 ha, 15° NW slope, arched 2-storey building, 6 modules), and the line "Энэ вэб загвар нь төвийн VR буланд ашиглагдах виртуал аяллын эхний хувилбар." Team names and programmes: **TODO — ask the user**, never invent them.
- `npm run qr -- <url>` writes `public/qr.png` (dev dependency `qrcode`) for the presentation slides.
- If WebGL is unavailable, show a friendly message and a link to `/media/walkthrough.mp4` if that file exists.
- Optional if time allows: winter toggle (snow-white terrain, roof and shrubs, lighter fog, light snowfall particles).

### Phase 6 — Final check
- Test on Chrome desktop, Edge, an Android phone and an iPhone (ask the user).
- Lighthouse performance check, no console errors, all hotspots open, all presets work, the tour finishes in the greenhouse.
- Final production deploy; give the user the URL and the QR image.

## 7. UI design direction

Calm "nature lab" look: deep forest-green translucent panels (`#1F3D2B` at ~80% with backdrop blur), warm wood accent `#C0925F`, off-white text `#F4F1EA`, soft rounded corners. A font with full Cyrillic support (Montserrat or Inter from Google Fonts). Top-left: project title. Bottom centre: mode switch, presets, tour, cutaway. Right: info panel drawer. Do not cover the centre of the screen in walk mode except for a small crosshair.

UI strings (Mongolian): Тойм харах · Дотор нь алхах · Аялал · Бүтэн · 1 давхар · 2 давхар · Дэлгэрэнгүй · Энд очих · Хаах · Төслийн тухай · Тусламж · Загвар ачаалж байна…
Desktop help: "Хулгана — эргэн харах · W A S D — алхах · Shift — гүйх · Space — үсрэх · F — нисэх горим · E — дэлгэрэнгүй · Esc — цэс"
Mobile help: "Зүүн талын жойстик — алхах · Баруун талыг чирэх — эргэн харах"

## 8. Rules

- Never touch or overwrite the original `.blend`. Regenerate the GLB only through the export script.
- Do not invent facts in the info panels beyond Appendix A; mark anything missing as TODO and ask.
- Keep `center.glb` < 8 MB and the JS bundle lean (code-split heavy parts if needed).
- `.gitignore` must exclude `node_modules`, `dist`, `.vercel`.
- Commit after each phase with a clear message. Stop and report after each phase.

---

## Appendix A — Hotspots (`src/data/hotspots.json`)

`pos` = pin position, `view` = camera for "Энд очих". All in three.js coordinates.

```json
[
  {
    "id": "gate",
    "group": "outdoor",
    "badge": "Орц",
    "minor": false,
    "pos": [-9.26, -1.58, -17.04],
    "view": { "pos": [-13.44, -4.91, -21.21], "target": [-9.26, -2.58, -17.04] },
    "mn": {
      "title": "Гол хаалга",
      "tagline": "Агро-ойн сургалт судалгааны төв",
      "desc": "Талбайн гол орц. Явган зам налуу өгсөж, гадаах модулиудын дундуур барилгын хашаа болон гол орц руу хөтөлнө."
    },
    "en": { "title": "Main gate", "tagline": "Agro-Forest Learning Center" }
  },
  {
    "id": "A_nursery",
    "group": "outdoor",
    "badge": "А",
    "minor": false,
    "pos": [-14.21, 0.15, 6.58],
    "view": { "pos": [-12.73, 0.69, -2.12], "target": [-14.21, -0.85, 6.58] },
    "mn": {
      "title": "А. Мод үржүүлэг",
      "tagline": "Үрээс суулгац хүртэл",
      "desc": "Үр соёололтын өргөгдсөн хайрцгууд, хүйтэн хүлэмж (cold frame), суулгацыг шилжүүлэн суулгах гадаах талбай. Сурагчид үр тарьж, соёололтыг ажиглаж, суулгацаа өөрсдөө тарина."
    },
    "en": { "title": "A. Tree Nursery", "tagline": "From seed to seedling" }
  },
  {
    "id": "B_tree_trail",
    "group": "outdoor",
    "badge": "Б",
    "minor": false,
    "pos": [5.69, 2.67, -11.28],
    "view": { "pos": [-1.41, 0.64, -11.03], "target": [7.07, 2.57, -12.02] },
    "mn": {
      "title": "Б. Ой ба мод таних зам",
      "tagline": "Ойг уншиж сурах",
      "desc": "Монгол орны голлох мод, сөөг бүхий сургалтын явган зам: шинэс, нарс, хус, улиас, хайлаас, чацаргана, харгана. Мод бүрт монгол болон латин нэртэй хаяг байна. Зүйл таних, нас, өсөлт, жилийн цагирагийн тухай суралцана."
    },
    "en": { "title": "B. Forest & Tree ID Trail", "tagline": "Learning to read the forest" }
  },
  {
    "id": "C_agroforestry",
    "group": "outdoor",
    "badge": "В",
    "minor": false,
    "pos": [-19.02, -1.86, 0.78],
    "view": { "pos": [-10.96, 1.09, -1.77], "target": [-19.09, -2.88, 0.71] },
    "mn": {
      "title": "В. Агро-ойн туршилтын талбай",
      "tagline": "Мод + Ургамал + Хүнс",
      "desc": "Налуугийн хэвтээ шугам дагуу мод, жимсний сөөг (чацаргана), нарийн ногоог хослуулан тарьсан олон давхаргат таримал. Мод салхинаас хамгаалж, хөрсийг бэхжүүлж, ургацыг нэмэгдүүлдгийг харуулна."
    },
    "en": { "title": "C. Agroforestry Trial Plots", "tagline": "Trees + Plants + Food" }
  },
  {
    "id": "D_swales",
    "group": "outdoor",
    "badge": "Г",
    "minor": false,
    "pos": [4.1, 0.76, -13.72],
    "view": { "pos": [-3.75, 0.67, -12.52], "target": [4.1, -0.24, -13.72] },
    "mn": {
      "title": "Г. Хөрс ба усны бүс",
      "tagline": "Бороо хаашаа явдаг вэ?",
      "desc": "Налуугийн хөндлөн ухсан террас сувгууд (swale) борооны усыг барьж хөрсөнд шингээдэг. Элэгдлийн гурван туршилтын талбайд нүцгэн хөрс, хучлагатай хөрс, ургамалтай хөрсний ялгааг харьцуулна."
    },
    "en": { "title": "D. Soil & Water Zone", "tagline": "Where does the rain go?" }
  },
  {
    "id": "D_soil_water_pond",
    "group": "outdoor",
    "badge": "Г",
    "minor": false,
    "pos": [-2.12, -3.44, -18.38],
    "view": { "pos": [-7.71, -2.65, -16.05], "target": [-0.71, -4.75, -17.68] },
    "mn": {
      "title": "Эко цөөрөм",
      "tagline": "Борооны ус цуглуулах",
      "desc": "Налуугийн хамгийн доод хэсэгт байрлах цөөрөм талбайн борооны усыг цуглуулж, усалгаа болон усны амьтан, ургамлыг судлах орчин бүрдүүлнэ. Ажиглалтын модон тавцантай."
    },
    "en": { "title": "Eco-pond", "tagline": "Rainwater harvesting" }
  },
  {
    "id": "rain_cistern",
    "group": "outdoor",
    "badge": "Г",
    "minor": true,
    "pos": [9.97, 3.66, -13.36],
    "view": { "pos": [4.45, 3.03, -11.81], "target": [9.97, 2.26, -13.36] },
    "mn": {
      "title": "Борооны усны сав",
      "tagline": "Усыг дахин ашиглах",
      "desc": "Дээвэр болон гадаргаас урсах борооны усыг хадгалж, хүлэмж, мод үржүүлгийн усалгаанд ашиглах савны концепц."
    },
    "en": { "title": "Rainwater tank", "tagline": "Reusing rainwater" }
  },
  {
    "id": "E_biodiversity",
    "group": "outdoor",
    "badge": "Д",
    "minor": false,
    "pos": [-16.9, -2.26, -7.71],
    "view": { "pos": [-10.61, 0.05, -4.95], "target": [-16.9, -3.66, -7.71] },
    "mn": {
      "title": "Д. Биологийн олон янз байдлын коридор",
      "tagline": "Жижиг талбай – Олон амьдрал",
      "desc": "Унаган зэрлэг цэцгийн зурвас, шавжийн зочид буудал (insect hotel), тоос хүртээгчдэд ээлтэй орчин. Хил дагуух хамгаалалтын ойн зурвас шувуудад нөмөр болж, баруун хойд салхинаас хамгаална."
    },
    "en": { "title": "E. Biodiversity Corridor", "tagline": "Small site – many lives" }
  },
  {
    "id": "F_outdoor_classroom",
    "group": "outdoor",
    "badge": "Е",
    "minor": false,
    "pos": [-12.52, -2.57, -8.98],
    "view": { "pos": [-7.42, 0.47, -3.89], "target": [-12.52, -3.57, -8.98] },
    "mn": {
      "title": "Е. Гадаах сургалтын анги",
      "tagline": "Суралцах орчин өөрөө сургалт",
      "desc": "Налуугийн хэлбэрийг дагасан модон амфитеатр, самбартай тайз. Гадаах хичээл, танилцуулга, бүлгийн ажилд зориулагдсан."
    },
    "en": { "title": "F. Outdoor Classroom", "tagline": "The landscape is the lesson" }
  },
  {
    "id": "F1_welcome_lobby",
    "group": "floor1",
    "badge": "1",
    "minor": false,
    "pos": [7.58, 2.77, 1.12],
    "view": { "pos": [5.51, 2.92, -0.93], "target": [8.96, 2.37, 2.28] },
    "mn": {
      "title": "Угталтын хэсэг & Мэдээллийн лобби",
      "tagline": "Welcome & Intro Zone",
      "desc": "Төвийн интерактив газрын зураг (Digital Master Plan) 0.14 га талбай улирлаар хэрхэн өөрчлөгддөгийг дэлгэц дээр харуулна. Хронологийн ханын самбарт Монгол орны ойжуулалт, агро-ойн аж ахуйн түүх, «Тэрбум мод» хөдөлгөөний үр дүнг үзүүлнэ."
    },
    "en": { "title": "Welcome & Intro Zone", "tagline": "Digital master plan and history wall" }
  },
  {
    "id": "F1_soil_water_exhibit",
    "group": "floor1",
    "badge": "2",
    "minor": false,
    "pos": [9.46, 2.77, -1.95],
    "view": { "pos": [6.89, 2.92, -3.31], "target": [11.12, 2.37, -1.25] },
    "mn": {
      "title": "Хөрс ба усны лаборатори-музей",
      "tagline": "Soil & Water Interactive Exhibit",
      "desc": "Монгол орны бүс нутгуудын хөрсний гүний зүсэлтийг (монолит) шилэн хоргонд үзүүлнэ. Усны эргэлт, элэгдлийн макет дээр зочид товчлуур дарж борооны ус налуу газарт хэрхэн урсаж, хөрсийг эвдэж, түүнийг яаж зогсоодгийг туршина."
    },
    "en": { "title": "Soil & Water Exhibit", "tagline": "Soil monoliths and erosion model" }
  },
  {
    "id": "F1_greenhouse_lab",
    "group": "floor1",
    "badge": "3",
    "minor": false,
    "pos": [-7.07, 2.77, 14.14],
    "view": { "pos": [-8.84, 2.92, 8.41], "target": [-4.6, 2.07, 18.03] },
    "mn": {
      "title": "Өвлийн хүлэмж-лаборатори",
      "tagline": "Indoor Nursery & Tree Lab",
      "desc": "Өвөл ч үр соёолуулах явцыг шилэн хорго цаанаас ажиглана. Модны үрийг лупаар харах станц, жилийн цагирагтай модны зүсэлтээр мод хэдэн настайг тоолж сурна."
    },
    "en": { "title": "Winter Greenhouse Lab", "tagline": "Germination station and tree rings" }
  },
  {
    "id": "F1_biodiversity_corner",
    "group": "floor1",
    "badge": "4",
    "minor": false,
    "pos": [10.39, 2.77, -5.65],
    "view": { "pos": [7.51, 2.92, -6.15], "target": [12.18, 2.37, -5.5] },
    "mn": {
      "title": "Биологийн олон янз байдлын танхим",
      "tagline": "Biodiversity Corner",
      "desc": "Өвөлждөг шавж, ашигтай шавж, шувуудын үүр болон тэдгээрийн экосистем дэх үүрэг. Микроскопоор навч, бичил биетэн харах хэсэг; унаган болон эмийн ургамлын гербари."
    },
    "en": { "title": "Biodiversity Corner", "tagline": "Insects, nests, microscopes, herbarium" }
  },
  {
    "id": "F1_vr_digital",
    "group": "floor1",
    "badge": "5",
    "minor": false,
    "pos": [3.48, 2.77, 4.29],
    "view": { "pos": [2.45, 2.92, 1.57], "target": [4.26, 2.37, 5.92] },
    "mn": {
      "title": "VR & Дижитал сургалтын булан",
      "tagline": "Virtual Tour",
      "desc": "Өвөл цас орсон үед зочид VR нүдний шилээр зуны 0.14 га талбай дундуур алхаж, моддын өсөлтийг харна. Интерактив дэлгэцээр тест бөглөж, танин мэдэхүйн тоглоом тоглоно."
    },
    "en": { "title": "VR & Digital Corner", "tagline": "Walk the summer site in winter" }
  },
  {
    "id": "F1_diy_workshop",
    "group": "floor1",
    "badge": "6",
    "minor": false,
    "pos": [-4.1, 2.77, 5.26],
    "view": { "pos": [-3.3, 2.92, 2.45], "target": [-4.44, 2.37, 7.03] },
    "mn": {
      "title": "DIY урлан",
      "tagline": "Гар урлалын лаборатори",
      "desc": "Модны үлдэгдэл материалаар гар урлал хийх, байгальд ээлтэй зүйл бүтээх практик өрөө — музей үзсэний дараа өөрсдөө хийж үзэх орон зай."
    },
    "en": { "title": "DIY Eco-Workshop", "tagline": "Make things from wood offcuts" }
  },
  {
    "id": "F1_classroom",
    "group": "floor1",
    "badge": "6",
    "minor": false,
    "pos": [-0.7, 2.77, 5.44],
    "view": { "pos": [-0.71, 2.92, 2.52], "target": [-0.55, 2.37, 7.23] },
    "mn": {
      "title": "Сургалтын анги",
      "tagline": "Classroom",
      "desc": "Бүлгийн хичээл, семинар, танилцуулгад зориулсан жижиг танхим."
    },
    "en": { "title": "Classroom", "tagline": "Seminars and group lessons" }
  },
  {
    "id": "F1_staff_office_kitchen",
    "group": "floor1",
    "badge": "Оф",
    "minor": true,
    "pos": [10.17, 2.77, -9.25],
    "view": { "pos": [7.28, 2.92, -8.89], "target": [11.93, 2.37, -9.63] },
    "mn": {
      "title": "Ажилчдын байр, оффис, гал тогоо",
      "tagline": "Зүүн жигүүр",
      "desc": "Ажилтнуудын ажлын байр, оффис, гал тогоо."
    },
    "en": { "title": "Staff, Office & Kitchen", "tagline": "Left wing" }
  },
  {
    "id": "F1_wc",
    "group": "floor1",
    "badge": "WC",
    "minor": true,
    "pos": [1.49, 2.77, 5.04],
    "view": { "pos": [0.95, 2.92, 2.18], "target": [1.97, 2.37, 6.77] },
    "mn": {
      "title": "Ариун цэврийн өрөө",
      "tagline": "WC",
      "desc": "Зочдод зориулсан ариун цэврийн өрөө."
    },
    "en": { "title": "WC", "tagline": "Restrooms" }
  },
  {
    "id": "F2_lab_A_biology_insects",
    "group": "floor2",
    "badge": "Л-A",
    "minor": false,
    "pos": [-1.34, 6.67, 5.48],
    "view": { "pos": [-1.2, 6.82, 2.57], "target": [-1.28, 6.17, 7.27] },
    "mn": {
      "title": "Лаборатори A",
      "tagline": "Биологи • Шавж",
      "desc": "Шавж, бичил биетэн, ургамлын дээжийг судлах туршилтын ширээ, хадгалах шүүгээтэй лаборатори."
    },
    "en": { "title": "Lab A", "tagline": "Biology & insects" }
  },
  {
    "id": "F2_lab_B_trees_seedlings",
    "group": "floor2",
    "badge": "Л-B",
    "minor": false,
    "pos": [6.86, 6.67, 1.91],
    "view": { "pos": [4.98, 6.82, -0.32], "target": [8.13, 6.17, 3.18] },
    "mn": {
      "title": "Лаборатори B",
      "tagline": "Мод • Суулгац",
      "desc": "Үр, суулгац, модны өсөлтийг судлах лаборатори. Шат энэ лабораторид гарч ирнэ."
    },
    "en": { "title": "Lab B", "tagline": "Trees & seedlings" }
  },
  {
    "id": "F2_lab_C_soil_water",
    "group": "floor2",
    "badge": "Л-C",
    "minor": false,
    "pos": [10.43, 6.67, -6.4],
    "view": { "pos": [7.53, 6.82, -6.72], "target": [12.23, 6.17, -6.35] },
    "mn": {
      "title": "Лаборатори C",
      "tagline": "Хөрс • Ус",
      "desc": "Хөрсний дээж, усны чанарын шинжилгээ хийх лаборатори."
    },
    "en": { "title": "Lab C", "tagline": "Soil & water" }
  }
]
```

## Appendix B — Camera presets, spawn and tour route (`src/data/views.ts`)

```ts
export const presets = {
  aerial: { label: 'Агаараас', pos: [-4.24, 34, -41.01], target: [-1.41, 0, -2.83] },
  entrance: { label: 'Хаалга', pos: [-11.31, -3.98, -19.09], target: [3.89, 4.77, -1.06] },
  courtyard: { label: 'Хашаа', pos: [-7.57, 0.18, -5.44], target: [6.36, 3.77, -0.71] },
  lobby: { label: 'Лобби', pos: [5.33, 2.92, -0.55], target: [6.4, 2.67, 5.86] },
  soil_exhibit: { label: 'Хөрсний үзмэр', pos: [7.41, 2.92, -4.26], target: [11.22, 2.47, 0.78] },
  greenhouse: { label: 'Хүлэмж', pos: [-8.84, 2.92, 8.41], target: [-4.6, 2.07, 18.03] },
  lab_floor2: { label: 'Лаборатори (2 давхар)', pos: [3.02, 6.82, 1.25], target: [9.81, 6.17, 2.01] },
  pond: { label: 'Цөөрөм', pos: [-7.71, -2.65, -16.05], target: [-0.71, -3.89, -17.68] },
};

export const spawn = { pos: [-12.37, -4.38, -20.15], target: [3.89, 4.27, -1.06] };

// Guided tour: gate → main path → courtyard → lobby → soil & biodiversity exhibits → back → VR, classroom, DIY → greenhouse
export const tourRoute: [number, number, number][] = [
  [-13.08, -4.78, -20.86],
  [-8.84, -3.15, -16.62],
  [-4.88, -1.83, -12.8],
  [-1.27, -0.23, -8.63],
  [1.41, 1.38, -4.81],
  [3.39, 2.72, -1.7],
  [5.57, 2.92, 0.37],
  [8.07, 2.92, -0.57],
  [8.91, 2.92, -2.19],
  [9.49, 2.92, -3.91],
  [9.79, 2.92, -5.71],
  [9.49, 2.92, -3.91],
  [8.07, 2.92, -0.57],
  [6.14, 2.92, 1.77],
  [4.38, 2.92, 3.12],
  [3.23, 2.92, 3.75],
  [2.01, 2.92, 4.25],
  [0.64, 2.92, 4.63],
  [-0.76, 2.92, 4.84],
  [-2.17, 2.92, 4.88],
  [-3.98, 2.92, 4.67],
  [-6.27, 2.92, 6.75],
  [-7.35, 2.92, 7.21],
  [-8.91, 2.92, 8.63],
  [-7.95, 2.92, 11.49],
  [-3.71, 2.92, 15.73],
];
```

## Appendix C — Minimap geometry (site-local metres; +ly = downhill / north-west)

- Site square: `lx, ly ∈ [−18.75, 18.75]`. Main gate at `(5.5, 18.6)`.
- Building: annular sector, centre `(3.5, 6.0)`, radii 8.5–16.0, angle φ ∈ [−65°, +65°]. A point is `(3.5 + r·sin φ, 6.0 − r·cos φ)`. Zones on the ground floor by φ: staff/office/kitchen 49…65, biodiversity 31…49, soil & water 13…31, lobby −13…13, VR −26…−13, WC −33…−26, classroom −47…−33, DIY workshop −65…−47. Stair at φ = −9.
- Greenhouse: rectangle `lx −18.6…−11.4`, `ly −10.5…1.2`, linked to the building's end-wall door at about `(−9.4, 0)`.
- A. Nursery: `lx −17.9…−6.6`, `ly 2.8…9.2`
- B. Tree trail (polyline): (5.0, 3.7) → (8.5, 4.1) → (12.0, 3.95) → (15.5, 4.6) → (17.0, 7.0) → (16.8, 10.5) → (15.4, 13.2) → (13.0, 17.0) → (6.4, 17.6)
- C. Agroforestry: `lx −18.0…−9.9`, `ly 9.6…16.2`
- D. Swales: two lines `lx 7.8…17.5` at `ly 5.5` and `ly 8.0`; erosion plots `lx 7.8…13.4`, `ly 9.4…10.8`; eco-pond circle centre `(11.5, 14.5)` r 2.55; rain tank `(16.5, 2.4)`
- E. Biodiversity strip: `ly 16.5…18.2` across the site; insect hotels at lx −12.0, −6.5, 1.8 (ly 17.4)
- F. Amphitheatre: stage centre `(−2.5, 15.2)`, seats are arcs r 3.0–6.8 on the uphill side
- Main path (polyline): (5.5, 18.9) → (5.7, 14.5) → (5.6, 10.5) → (5.2, 6.5) → (4.6, 3.2) → (3.7, −0.4)
