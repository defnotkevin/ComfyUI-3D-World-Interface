# 3D World Interface — prototype 0.1.4

Arrange up to four input 3D assets together inside ComfyUI. A compact inspection viewport opens into a large **Edit** overlay with Unreal-style controls, transform gizmos, numeric fields, undo/redo, **Save Work**, and **Export GLB**.

This package is separate from the Native Hunyuan wrapper. It does not install Python dependencies or download AI models. Three.js 0.180.0 is bundled locally with its MIT license.

## Compatibility and validation

Target: ComfyUI `v0.36.0-13-ga8686f2b`, commit `a8686f2b33fc540f137df50c0f0719953830a5e7`.

- 16 Python storage and backend-contract tests passed (ComfyUI imports mocked for the backend tests).
- JavaScript syntax checks passed.
- Actual browser rendering checked with four sample GLBs, including a textured asset.
- Browser checks passed for numeric transforms, translation gizmo dragging, duplicate/undo, saving, node revision updates, reopening a saved workflow, asset replacement preserving placement, and the unsaved-edits dialog.
- Saved GLB inspected: four meshes, four materials, embedded texture, and expected object names.
- Overlay integration tested in a lightweight ComfyUI host harness using the actual extension code. **Not yet tested inside the user's running ComfyUI installation or with their full-resolution Hunyuan assets.**

## Install from GitHub (RunPod)

This repository is the complete custom node, including Python code, browser UI, bundled Three.js, and demo assets. No installer script, pip install, npm build, or AI model download is needed. ComfyUI supplies the Python dependencies.

After publishing the repository, substitute its actual URL below:

```bash
cd /workspace/ComfyUI/custom_nodes
git clone https://github.com/YOUR_USERNAME/ComfyUI-3D-World-Interface.git
```

Restart ComfyUI and hard-refresh the browser. Open `example_workflows/built_in_demo.json`, then click Run and Edit. The built-in demo loads assets directly from this repository.

### Update an existing Git clone

```bash
cd /workspace/ComfyUI/custom_nodes/ComfyUI-3D-World-Interface
git pull --ff-only
```

Restart ComfyUI and hard-refresh the browser after updating. If Git reports local modifications or divergent history, keep those changes and resolve them before updating; do not force-reset them.

### Replace an earlier ZIP or patch-only installation

Move the old viewer folder **outside** `custom_nodes` before cloning this repository. Keep only one installed copy. A ZIP extraction is not a Git clone and cannot be updated with `git pull`.

Saved worlds live in `ComfyUI/output/world_viewer`, outside this repository. Replacing or updating the custom node does not remove them. Moving to a new container requires restoring that folder and your workflow JSON, or keeping them on persistent storage.

### Local installation

Clone into your ComfyUI installation's configured `custom_nodes` directory, then restart. This prototype targets the ComfyUI revision listed above; other installations need validation.

## Try it first without running any AI models

For the optional file-loader example, copy the four `example_workflows/demo_*.glb` files into `ComfyUI/input/world_viewer_demo`.
Open `example_workflows/four_assets.json` in ComfyUI. The four Load World Asset nodes feed the viewer. Click **Run**, then **Edit**. Assets initially appear side by side, at their existing scale. Select an object to frame or reposition it. These demos are simple geometric test assets, not generated characters.

A pure-Python `Demo World Asset` node is also provided: it loads one of the same bundled samples directly, so the **built_in_demo.json** workflow needs no input-folder copying or GPU models.

## Use Hunyuan meshes

```
Hunyuan Images → Mesh (Native)
            ↓ mesh
    Mesh to World Asset
            ↓ world asset
  3D World Interface / asset_1
```

Connect up to four independent **Mesh to World Asset** or **Load World Asset (GLB)** outputs into `asset_1` through `asset_4`. All slots are optional; connect at least one for a new scene. Name assets in their adapter nodes. A single slot is one selectable asset; an imported GLB's internal parts stay grouped. Duplicate inside the editor to create additional instances (up to 256 scene objects).

## Load existing GLBs

Put files in `ComfyUI/input` or a subfolder, using the RunPod/Jupyter file browser. Select them in **Load World Asset (GLB)**. Refresh the browser if newly uploaded files are absent from its dropdown.

Supported:
- Native single-item ComfyUI `MESH`, converted with ComfyUI's native GLB writer.
- Static, self-contained, uncompressed `.glb` files, with embedded PNG/JPEG textures and supported glTF materials.
- Multiple internal meshes/materials preserved as one input asset.

Not included yet: rigged/skinned or animated GLBs, external resource files, Draco/Meshopt/KTX2 compression, OBJ/FBX/Blend/USD, point clouds, splats, per-part editing, editable custom lights, material painting, camera/image outputs, portable scene-package export, or variable input counts. File uploads and individual saved GLBs are limited to 256 MiB here; the ComfyUI server may impose a lower upload limit. Large meshes can also exceed the local browser's GPU memory even if RunPod has free VRAM.

## Controls

| Action | Control |
|---|---|
| Orbit | Left-mouse drag on empty viewport |
| Pan | Middle-mouse drag |
| Zoom | Mouse wheel |
| Fly | Hold right mouse, move mouse to look, W/A/S/D to travel |
| Fly vertically | E up, Q down while holding right mouse |
| Faster flight | Hold Shift |
| Move / rotate / scale | W / E / R when not flying |
| Frame selection (or scene if none selected) | F |
| Undo / redo | Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z, or toolbar arrows |
| Delete selected | Delete, or Delete button |
| Exit overlay | Close button or Escape |

Select an object in the list or click its visible surface. Numeric position is in **centimeters**; rotation is in degrees. The internal scene uses meters and **Z-up**. GLBs import/export with glTF's Y-up convention. No automatic scale normalization is applied. Hunyuan geometry has arbitrary scale: use the scale fields to establish relative size. **Place on ground** moves the lowest bounding-box point to Z=0.

Snapping: 10 cm translation, 15-degree rotation, 0.1 scale steps. **World/Local** switches gizmo coordinate space. Shortcuts are confined to the focused editor and disabled in text/numeric fields. The node preview offers orbit/pan/zoom but no object editing.

Grid, axes, and lighting are preview controls, persisted with the saved scene. Lighting is a fixed hemisphere/key/fill setup controlled by one intensity slider. Preview lights, grid, and gizmos are omitted from the exported GLB; other applications may render the materials differently.

## Save Work versus Export

**Save Work**:
1. Writes the editable scene description and assembled GLB into `ComfyUI/output/world_viewer/revisions`.
2. Updates the node's `scene_revision` widget and preview immediately.
3. Does not run generation. Run the workflow to deliver the new revision to downstream nodes.
4. Save your ComfyUI workflow normally to retain that updated revision and preview state after closing the workflow.

**Export GLB** downloads the current editor scene to your browser, including unsaved edits. It does not commit the scene to the workflow. Hidden objects remain in the editable scene but are omitted from GLB output. Export contains supported geometry, transforms, and materials, not the grid, gizmos, preview lighting, or editor metadata.

The viewer outputs:
- `scene` (`WORLD_SCENE`): committed revision/state, or an uncommitted initial scene before the first Save Work.
- `glb_path` (`STRING`): absolute path to the committed GLB on the ComfyUI server, empty before the first Save Work.

To use native 3D saving/preview nodes:

```
3D World Interface / scene → World Scene to GLB → Save 3D Model
```

**World Scene to GLB** outputs native `FILE_3D_GLB`. Before the first save it blocks downstream execution without triggering an error. After **Save Work**, run again to produce the updated file output. The initial input nodes normally remain cached, so editing alone should not regenerate models; disable randomize-after-generation upstream if you want to keep those inputs fixed during repeated runs.

## Asset updates and persistence

Each input slot is a stable source identity. On workflow execution, the preview and editor automatically adopt current input geometry while preserving names/transforms. Save Work commits that updated scene; downstream outputs continue to use the last committed revision until you save and run again. Unsaved editor placement is preserved when new geometry arrives. Disconnected inputs do not silently delete existing scene objects. Explicitly delete objects in the editor when needed. Swapping the meaning of an input slot means replacement of that slot's asset.

Assets are copied into a content-addressed store under `ComfyUI/output/world_viewer/assets`. Identical content is deduplicated. Source files are never modified. Every save creates an immutable revision; no automatic cleanup is performed in this prototype. Old assets/revisions consume disk space until deliberately removed.

Back up BOTH the workflow JSON and the complete `output/world_viewer` folder. Workflow JSON does not embed model bytes. The usual RunPod volume must be persistent for these files to survive restart; terminating a pod without a retained network volume can delete them.

Closing with unsaved changes offers Save, Discard, or Cancel. Drafts are also recoverable on the same browser via local storage. Browser storage is a convenience, not a backup of server-side assets. The node's saved revision is the authority for downstream execution.

## Troubleshooting

- **No node appears:** check the ComfyUI startup log and ensure one correctly nested package folder exists. The Hunyuan wrapper can remain installed.
- **Blank viewer:** inspect the browser console for WebGL or loading errors. Test the small built-in demo before a large Hunyuan mesh.
- **New GLB missing:** refresh ComfyUI; put it under the actual configured input folder.
- **Save failed:** check server upload limits, disk space, and the error in the editor's bottom status bar.
- **Saved scene missing:** restore the `output/world_viewer` folder; a workflow alone cannot recreate its asset snapshots.
- **Model is lying down:** verify its original orientation. Rotate it numerically; the viewer assumes standard Y-up GLB input.
- **GLB export looks different:** other viewers use different lighting; the exporter preserves supported materials, not this viewport's lighting setup.

## Developer checks

```bash
python -m unittest discover -s tests -v
node tests/test_asset_updates.mjs
```

The code uses legacy ComfyUI node registration for the main nodes, a browser extension in `web/`, and an isolated Three.js UI served through same-origin `/worldviewer` routes. Vendor modules are outside `WEB_DIRECTORY` so ComfyUI will not try to load every Three.js source file as an extension.

## Third-party notices

Three.js 0.180.0: MIT; license in `ui/vendor/LICENSE`. Downloaded from the official npm package distribution. This is an independent prototype, not an official ComfyUI or Tencent product. AI model licenses continue to apply to the corresponding models.

## Rename compatibility (0.1.4)

The display name is now **3D World Interface**. Existing workflow node identifiers, saved revision IDs, storage at `output/world_viewer`, and internal routes remain compatible. The internal `WorldViewer` identifier is intentional.

When migrating from the old package, move the old custom-node folder outside `custom_nodes` before installing this package. Do not install both copies. Existing Git clones may keep their folder name; update their remote URL if you rename the GitHub repository. Restart ComfyUI and hard-refresh after updating. User-assigned node titles are not overwritten.
