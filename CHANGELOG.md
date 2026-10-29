# Changelog

## 0.8.1 — 2026-10-29 (development preview)

- Make extension.zip a complete project extension: include the MCP service, pinned production JavaScript dependencies and their license files. Extract into extensions, enable in Creator 3.8.8 and copy client configuration; no user npm, separate Node installation or manual server startup.
- Resolve installation paths after extraction and use the installed Creator Electron runtime in Node mode. Keep source-install support, reject mixed source/complete installations and disable copying incomplete configuration. Client setup remains a one-time step; moving the project or upgrading Creator to another path requires copying configuration again.
- Verify the extracted package in an unrelated path with spaces/Unicode and an empty PATH: real STDIO handshake, four tools, schemas, status, readonly rejection, batch result references and image content. Exercise the same package with the actual Windows Creator 3.8.8 executable; CI uses Node and does not certify other Creator operating systems.
- This improves distribution only. Editor workflow coverage and known layout/visual/recovery limitations remain as documented for 0.8.0. The personal non-commercial license is unchanged.

## 0.8.0 — 2026-10-29 (development preview)

- Replace this distribution's MIT terms with CocosCreatorMCP Personal Non-Commercial License 1.0: free personal non-commercial use; prior written authorization for commercial/organizational use and redistribution. Add licensing/contact guidance, contribution-agreement requirements and GitHub configuration for CocosCreatorMCP. Third-party licenses and valid prior grants are unaffected; historical entries below do not license this distribution under MIT.
- Prepare public GitHub documentation: complete Windows setup, source/extension installation, Codex config, troubleshooting, upgrade/uninstall and maintainer publishing guide. Add draft prerelease workflow, checksummed source ZIP/TAR and extension ZIP, exact archive verification and fresh-install regression.
- Keep preview boundaries explicit: layout property readback has passed; full new-panel input regression, missing-component configuration failure cleanup and cross-resolution visual acceptance remain incomplete.

- Add compact `ui.layout` for Widget anchors, Layout flow/grid, ScrollView content/axes, Mask, SafeArea and BlockInputEvents. Semantic enum names are resolved against the installed Creator inspector; node references are checked before writes and component state is read back after edits.
- Missing layout components can be ensured, configure supports dry-run, and remove verifies component absence. The operation keeps the default four MCP entry points and raises the catalog to 90 schemas.
- Add a Creator panel page for UI adaptation and a real Creator 3.8.8 regression script covering layout, scrolling content references, dry-run and cleanup. Document the supported fields and visual-validation limits.

## 0.7.0 — 2026-10-29 (development preview)

- Add compact scene.view and reference.image operations covering Creator scene-view Gizmo, Pivot, coordinate system, 2D/3D mode, grid, icon Gizmo, focus/alignment/reset and external reference-image management.
- Batch viewport configuration in one call with native state readback and best-effort recovery. Project hierarchy resolution rejects editor helper nodes and ambiguous names before camera focus.
- Validate external reference paths, image type and 32 MiB size; add/transform/switch/refresh/clear reference overlays with native readback. Reference files remain external and are never imported or modified.
- Add Creator panel page for scene view/reference images and a live regression script. Keep four compact MCP entry points; catalog now has 89 operation schemas.

## 0.6.0 — 2026-10-28 (development preview)

- Five dedicated typography/UI operations, 87 discoverable operations and four default MCP tools. Inspect imported TTF/bitmap fonts, configure existing Label/RichText with typed native patches, and observe actual shrink size without forcing render updates.
- Project-only transformed UI rectangles in nearest Canvas coordinates; compact responses deduplicate Canvas metadata. Same nine-node fixture: full/compact geometry agrees, JSON 11,999 → 4,091 bytes (65.9% smaller); not model-token or Pro performance evidence.
- Bounded diagnostics with rule IDs/evidence for zero size, missing Canvas/font, camera/layer, overflow, small rendered text and bitmap glyphs; potential Button AABB overlaps are informational. Explicit projection and truncation limits.
- Creator typography workbench with inspect/measure/validate, configuration precheck/apply and problem-node selection. Fix selection assignment to replace previous native selection, including explicit empty selection.
- Original MIT bitmap fixture, optional local TTF import, persisted multilingual/RichText preview, anchor/rotation/scale checks, five live operation groups and three real panel-input groups. No system fonts or local project data in source release.
- 45 automated tests. Full internationalization, visual occlusion, reference-image workflows, cross-platform editor validation and complete Pro parity remain outside acceptance scope.

## 0.5.0 — 2026-10-28 (development preview)

- Add 26 operations for assets, native animation, Spine and Web build workflows; 82 discoverable operations, four default MCP tools.
- Bounded dependency/user graphs, invalidation-aware cache, native import/copy/move/reimport, identity/hash-protected reference replacement plans and local recovery. Multi-file failure recovery preserves concurrent external changes.
- Native AnimationClip serialization/deserialization, eight track types, real/quaternion interpolation, asset keys, events, metadata edits and backups. Runtime target sampling and business-event checks run against the actual game.
- Spine runtime compatibility/texture inspection, native binding, skin/mix/track queue controls, per-track complete/custom event observations and bounded runtime inspection.
- Persisted Web Desktop/Mobile build identities, native status/logs, artifact checks with bounded-memory hashing, loopback-only artifact preview. Both targets passed real output startup and animation/Spine checks in Creator 3.8.8.
- Creator resource/build workbench; batched schema discovery; fixed historical benchmark cohort and added a same-task MCP benchmark with discovery overhead reported separately.
- Fix quaternion key parameter shape, distinguish persisted Spine defaultAnimation, wait for native import readiness without replaying writes, and recover newly added components after failed binding.
- 38 automated checks and reproducible live fixtures. Binary Spine, model animation, native platform SDKs and full third-party Pro parity remain outside this release's acceptance scope.

## 0.4.0 — 2026-10-28 (development preview)

- Eleven dedicated prefab operations: inspect/validate/create/instantiate/apply/revert/unlink/open/save/close/restore. Catalog now has 56 operations; default MCP remains four tools.
- Native serialization/linking preserves custom scripts, typed internal references, SpriteFrame, Button events and nested prefabs in the tested fixture. Creation returns new instance UUIDs after Creator replaces the source subtree.
- Block incoming/outgoing external references on create and outgoing refs on apply/save; shared writes check source SHA256 and save identity-bound local backups. AssetDB recovery preserves .meta.
- Add Creator prefab workbench for selection/precheck/create/validate/edit/save/return. Queue and pause rules apply to panel actions too.
- Handle Creator 3.8.8 false apply returns using persisted source readback and wait for stable source reads during native import/normalization.
- Add five automated failure/recovery tests and seven live prefab workflow checks. Still a development preview; no claim of full Pro parity or 100% editor coverage.

## 0.3.0 — 2026-10-28 (development preview)

- Nine dedicated operations: node resolution, compact properties, typed component patches, script registration/attachment, Button events, preview open/status/close. Default MCP remains four tools; catalog has 45 operations.
- Component patches validate fields/references before writing, use one native undo group, verify readback and attempt verified restoration after failure. Equal values skip editing; private Button event details use their specialized workflow.
- Project script attachment checks source UUID, waits for registration/required methods and reuses existing components. This is not a full TypeScript checker or a guarantee of latest-source hot reload.
- Sandboxed project preview supports existing screenshot/input tools and bounded browser logs. Creator panel adds a preview button. Only owned preview windows can be closed by preview.close.
- UI JSON trees support initial active state and typed component properties. A reproducible interactive menu/settings/inventory sample verifies reference/event persistence and real pointer interaction at two window widths.
- Local source release packaging with lockfile, examples, tests, manifest and SHA-256; local-only projects, connection data and third-party references excluded.
- Protocol-side schema/default validation also applies to direct bridge operations. Benchmark keeps its original 30-tool comparison cohort as the catalog grows.

## UI template visibility fix (included in 0.3.0)

- Canvas discovery now uses the editable project hierarchy, excluding Creator's hidden reference-image Canvas, gizmos and cameras. Scene snapshots use the same boundary.
- An empty project can create a real Canvas and UI camera from the installed Creator built-in asset. Dry-run reports this plan without edits; inactive/multiple Canvases or invalid camera settings produce actionable errors.
- Generated nodes must all appear in the project hierarchy before reporting success. Panel generation selects only the new root, switches to 2D and focuses it; a locate button is available.
- Regression coverage includes hidden helper parents, scene snapshots, Canvas bootstrapping, camera checks, save/reopen persistence and the panel's native message entry point.

The previous UI template checks did not prove that generated nodes belonged to the editable project scene. They could pass with nodes under an editor helper Canvas; those earlier checks must not be treated as proof of correct visible/persistent UI.

## 0.2.0 — 2026-10-28 (development preview)

- Creator control panel with connection status, searchable operation schemas, UI templates, operation history and client configuration copying.
- Default compact MCP profile with four tools; legacy individual tools remain available with `--tools legacy`.
- Sequential batches with result references, constant preflight validation, output projection and partial failure reporting.
- Native JSON UI construction plus menu/dialog/hud templates and cleanup of newly created subtrees after failure.
- Bounded in-memory structural snapshots/diffs, two structural validation rules and a small searchable workflow knowledge base.
- Server-enforced pause/advanced-access controls, CLI, MIT license, contributor guidance and CI configuration.
- Local validation: 13 automated tests; 15 original and 9 additional Creator integration checks. Panel rendering inspected; GUI button click validation and non-Windows editor integration remain incomplete.

## 0.1.0 — 2026-10-28

- Initial STDIO MCP service and authenticated loopback Creator bridge.
- Basic scenes, nodes, components, assets, logs, API discovery, scripts and window control.
