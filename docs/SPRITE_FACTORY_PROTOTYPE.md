# Sprite factory - Mayuna bird study 0.1

Based on feature/modular-world-studio at a6b5fa1944466f596767f7e265855ef0e00c7dd2. Existing Studio and world modules are reused, not replaced.

Run the normal project build and dev server, then open /sprite-factory.html. No image API, credentials, Blender installation, backend queue or cloud writes are needed. Rendering runs on the reviewing computer.

The authored geometric bird has 8 bones and 62 rigidly weighted skinned parts. Three animations (idle, walk, attack) are sampled into 8 actual views, 8 frames each. This is an early geometric study of the reference, NOT an approved painted-art replacement. The deliberately limited procedural geometry cannot recreate the detailed reference by itself.

The capture uses the elevation derived from WORLD_VIEW, an orthographic camera, fixed framing and projected ground-origin pivot. No per-frame normalization, image mirroring or root translation is applied. Export is 2048x6144 RGBA PNG plus the existing version-1 atlas JSON, with all 192 indices mapped to clips. Idle/walk loop; attack does not. The exporter rejects empty frames, opaque-only backgrounds and occupied border pixels. Artist review of foot sliding, silhouettes and timing remains required.

The preview feeds this PNG and atlas to the existing WorldStage. The world uses its existing movement, collisions and action system. Review camera zoom is 2.5; this does not change world code. The scene uses existing procedural rocks; it is not the completed refuge art. Save writes only to the existing local asset library in this origin. Opening the Studio on a different origin will not expose that library; use exported PNG/JSON instead.

GLB export includes skinning and three named animation clips. It converts toon materials to rough standard materials because glTF does not represent the custom toon shading. Consequently the GLB in another viewer can look different from the capture. The editable source is web/scene/mayuna-rig.js; there is no Blender source file yet.

Provenance records the study library version and seed (19). This seed currently drives only the fixed surface texture; it is NOT a general companion recipe or an evolution-identity guarantee.

Verified in an offline Chromium harness with local bytes: 192 nonempty frames; alpha range 0-255; zero occupied border pixels; existing atlas validation; 9 world chunks; movement changes position; attack action activation; local library save. Exported GLB JSON contains idle/walk/attack and skins. Syntax and esbuild bundle passed. This is not a production deployment/account test. Art approval and mobile performance remain pending.

Next: review the actual appearance, adjust feathers/face/materials and foot motion before scaling any factory infrastructure. Do not replace the current Mayuna art automatically.
