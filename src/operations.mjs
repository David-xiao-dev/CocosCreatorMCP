import { z } from 'zod';
export const operations = new Map();
const jsonObject = z.record(z.string(), z.unknown());
const uuids = z.array(z.string().min(1)).min(1).max(200);
function tool(name, description, shape, action, readOnly = false, convert = value => value) {
  operations.set(action, { name, action, description, schema: z.object(shape).strict(), readOnly, convert });
}

const vector = z.object({ x: z.number(), y: z.number(), z: z.number() }).strict();
const prefabAsset = z.string().min(1);
const prefabRevision = z.string().regex(/^[0-9a-f]{64}$/);
const resource = z.string().min(1).max(1000);
const revision = z.string().regex(/^[0-9a-f]{64}$/);
const localUrl = z.string().startsWith('db://assets/').max(1000);
const textComponent=z.enum(['cc.Label','cc.RichText']).default('cc.Label');
const colorValue=z.object({r:z.number().int().min(0).max(255),g:z.number().int().min(0).max(255),b:z.number().int().min(0).max(255),a:z.number().int().min(0).max(255)}).strict();
const viewTool=z.enum(['position','rotation','scale','rect']);
const viewPivot=z.enum(['pivot','center']);
const viewCoordinate=z.enum(['local','global']);
tool('scene_view','Control and inspect Creator scene viewport state in one compact operation: gizmo tool/pivot/coordinate, 2D/3D mode, grid, icon gizmo, focus and align. These settings affect the editor viewport, not saved game content.',{
  action:z.enum(['inspect','configure','focus','align-camera','align-node','reset']),tool:viewTool.optional(),pivot:viewPivot.optional(),coordinate:viewCoordinate.optional(),is2D:z.boolean().optional(),grid:z.boolean().optional(),icon3D:z.boolean().optional(),iconSize:z.number().int().min(10).max(100).optional(),nodes:z.array(resource).max(200).default([])
},'scene.view');
tool('reference_image','Manage Creator reference-image overlays with bounded path validation and native readback. Images are external design files, not project assets; configure position/scale/opacity and inspect or clear the current scene overlay.',{
  action:z.enum(['inspect','add','remove','switch','configure','refresh','clear']),paths:z.array(z.string().min(1).max(4000)).max(20).optional(),path:z.string().min(1).max(4000).optional(),scene:z.string().min(1).optional(),x:z.number().finite().optional(),y:z.number().finite().optional(),sx:z.number().positive().max(100).optional(),sy:z.number().positive().max(100).optional(),opacity:z.number().min(0).max(100).optional()
},'reference.image');
tool('font_inspect','Load an imported Font through the installed engine. Report TTF/bitmap kind, bitmap texture/glyphs and optional missing character sample. TTF/system glyph coverage and fallback remain unknown; loaded is not visual verification.',{asset:resource,text:z.string().max(10000).default('')},'font.inspect',true);
tool('text_inspect','Inspect existing Label/RichText, observed font/actual shrink size and text preview. Does not force layout or modify render data. includeText returns full source; use ui.measure and runtime screenshot for geometry/display.',{node:resource,component:textComponent,includeText:z.boolean().default(false)},'text.inspect',true);
tool('text_configure','Configure an existing Label/RichText using semantic enums and system or imported font. Uses native typed component.patch with undo/readback/recovery. RichText requires TTF; bitmap fonts work with Label. RichText inline styles use markup. No component is added, no save; dryRun validates only.',{
  node:resource,component:textComponent,text:z.string().max(50000).optional(),font:z.union([z.object({system:z.string().min(1).max(150)}).strict(),z.object({asset:resource}).strict()]).optional(),
  fontSize:z.number().positive().max(500).optional(),lineHeight:z.number().positive().max(1000).optional(),color:colorValue.optional(),horizontalAlign:z.enum(['LEFT','CENTER','RIGHT']).optional(),verticalAlign:z.enum(['TOP','CENTER','BOTTOM']).optional(),
  overflow:z.enum(['NONE','CLAMP','SHRINK','RESIZE_HEIGHT']).optional(),wrap:z.boolean().optional(),spacing:z.number().min(-100).max(500).optional(),bold:z.boolean().optional(),italic:z.boolean().optional(),underline:z.boolean().optional(),maxWidth:z.number().min(0).max(10000).optional(),dryRun:z.boolean().default(false)
},'text.configure');
tool('ui_measure','Measure project UITransform own rectangle corners and AABB in nearest Canvas local coordinates; includes camera/layer and observed Label/RichText state. UUID/path/unique name; bounded subtree optional. Not screen pixels, glyph ink, occlusion or hit-test proof.',{node:resource,subtree:z.boolean().default(false),includeInactive:z.boolean().default(false),maxNodes:z.number().int().min(1).max(2000).default(200),detail:z.enum(['compact','full']).default('compact')},'ui.measure',true);
tool('ui_validate','Diagnose project UI rectangles and typography with rule IDs/evidence: zero size, missing Canvas, camera/layer, Canvas overflow, missing font, small actual text and missing bitmap glyphs. Optional potential button AABB overlap is informational, not occlusion proof. No auto-fix; budgets/truncation explicit. Omitting node scans project scene.',{node:resource.optional(),includeInactive:z.boolean().default(false),maxNodes:z.number().int().min(1).max(2000).default(500),limit:z.number().int().min(1).max(500).default(100),tolerance:z.number().min(0).max(100).default(0.5),minFontSize:z.number().min(1).max(100).default(12),overlaps:z.boolean().default(false)},'ui.validate',true);
tool('ui_layout','Configure UI adaptation components through semantic fields with typed enum conversion and native readback. Supports Widget anchors, Layout flow/grid, ScrollView content/axes, Mask, SafeArea and BlockInputEvents. ensure adds a missing component; configure can dry-run; remove verifies absence. Node references accept UUID/path strings and are checked before edits.',{
  action:z.enum(['inspect','configure','ensure','remove']),
  node:resource,
  component:z.enum(['widget','layout','scrollView','mask','safeArea','blockInputEvents','cc.Widget','cc.Layout','cc.ScrollView','cc.Mask','cc.SafeArea','cc.BlockInputEvents']),
  properties:jsonObject.default({}),
  ensure:z.boolean().default(true),
  dryRun:z.boolean().default(false),
},'ui.layout');
tool('asset_info', 'Read compact imported asset identity, source SHA256, subassets, direct dependencies/users. Uses native AssetDB; source hashing limited to 16 MiB.', { asset: resource }, 'asset.info', true);
tool('asset_graph', 'Read bounded native AssetDB dependency/user graph. Cached edges expire after 1.5s and invalidate on asset broadcasts. Budget/depth limits are explicit; dynamic string loads are outside this index. Both directions can reach unrelated shared users; prefer dependencies for build impact.', {
  asset: resource, direction: z.enum(['dependencies','users','both']).default('dependencies'), type: z.enum(['asset','script','all']).default('all'), depth: z.number().int().min(1).max(8).default(2), maxNodes: z.number().int().min(1).max(1000).default(100), maxEdges: z.number().int().min(1).max(3000).default(300),
}, 'asset.graph', true);
tool('asset_import', 'Import a local absolute file/folder via native AssetDB without overwrite/rename. Includes binary assets and normal importer/meta behavior. dryRun prechecks source/destination only.', { source: resource, url: localUrl, dryRun: z.boolean().default(false) }, 'asset.import');
for (const mode of ['move','copy']) tool(`asset_${mode}`, `Native AssetDB ${mode} of a project source file. Requires current SHA256 expectedRevision; refuses overwrite, dirty current scene, folders/subassets/internal assets. Move verifies main/subasset UUID preservation; copy verifies a fresh main UUID. Runtime string paths still need review.`, { asset: resource, url: localUrl, expectedRevision: revision, dryRun: z.boolean().default(false) }, `asset.${mode}`);
tool('asset_reimport', 'Reimport a project source file with expectedRevision and clean editor context; verify native UUID/URL after import.', { asset: resource, expectedRevision: revision }, 'asset.reimport');
tool('asset_replace_plan', 'Plan exact serialized __uuid__ replacements across native direct users of one asset, requiring same imported type. Read-only to project assets. Returns planId, affected fields and unsupported users; unsupported users block apply. Excludes script class migrations and dynamic paths. Plans expire after 5 minutes/reload.', { from: resource, to: resource, maxAssets: z.number().int().min(1).max(100).default(30) }, 'asset.replace.plan', true);
tool('asset_replace_apply', 'Apply a replacement plan once: recheck source hashes/users, create local backups, native AssetDB save and exact source readback. On failure best-effort restore only unchanged attempted writes, report incomplete recovery. Non-atomic across scene/runtime state; reopen affected scenes and verify.', { planId: z.string().uuid() }, 'asset.replace.apply');
tool('asset_restore', 'Restore source backups from asset replacement or animation editing. Requires clean scene and exact post-write hashes; refuses stale/tampered/moved assets. Backups current source before restoring through AssetDB; does not overwrite meta. Non-atomic across files.', { backupId: z.string().uuid(), dryRun: z.boolean().default(false) }, 'asset.restore');
const keyValue = z.union([z.number(),z.string().max(5000),z.boolean(),z.null(),z.object({$asset:resource}).strict(),z.object({x:z.number(),y:z.number(),z:z.number(),w:z.number()}).strict()]);
const key = z.object({time:z.number().min(0).max(86400),value:keyValue,interpolation:z.enum(['LINEAR','CONSTANT','CUBIC']).optional(),leftTangent:z.number().optional(),rightTangent:z.number().optional()}).strict();
const track = z.object({type:z.enum(['real','vector2','vector3','vector4','color','size','quat','object']),nodePath:z.string().max(500).default(''),component:z.string().min(1).max(150).optional(),property:z.string().min(1).max(200),channels:z.record(z.string(),z.array(key).min(1).max(2000))}).strict();
const event = z.object({time:z.number().min(0).max(86400),method:z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),args:z.array(z.union([z.string().max(1000),z.number(),z.boolean()])).max(10).default([])}).strict();
const clipSpec = z.object({name:z.string().min(1).max(100),duration:z.number().positive().max(86400),sample:z.number().int().min(1).max(240).default(60),speed:z.number().positive().max(100).default(1),wrap:z.enum(['Normal','Loop','PingPong','Reverse','LoopReverse']).default('Normal'),tracks:z.array(track).min(1).max(100),events:z.array(event).max(500).default([])}).strict();
tool('animation_create', 'Create a native serialized .anim using installed engine track APIs: scalar/vector/color/size/quaternion/object channels, linear/constant/cubic keys and component event methods. Strict sorted times; object asset references resolved before save. No overwrite; dryRun does not save. Binding and runtime playback are separate.', {url:localUrl.endsWith('.anim'),spec:clipSpec,dryRun:z.boolean().default(false)}, 'animation.create');
const clipPatch = z.object({name:clipSpec.shape.name.optional(),duration:clipSpec.shape.duration.optional(),sample:z.number().int().min(1).max(240).optional(),speed:z.number().positive().max(100).optional(),wrap:z.enum(['Normal','Loop','PingPong','Reverse','LoopReverse']).optional(),tracks:z.array(track).max(100).optional(),events:z.array(event).max(500).optional()}).strict();
tool('animation_edit', 'Edit a project .anim source with expectedRevision and backup. Metadata patch preserves tracks/events unless supplied; supplied arrays replace the entire track/event list. Native deserialize resolves asset refs, checks duration and reserializes. Model-imported clips are excluded. Restore with asset.restore.', {asset:resource,expectedRevision:revision,spec:clipPatch,dryRun:z.boolean().default(false)}, 'animation.edit');
tool('animation_inspect', 'Read a project .anim source through engine deserialization: revision, tracks/channel counts, path and events. keys=true includes full key values; avoid it unless needed.', {asset:resource,keys:z.boolean().default(false)}, 'animation.inspect', true);
tool('animation_sample', 'Evaluate native clip curves at a time without modifying scene nodes. Returns per-channel samples, not proof of target binding/gameplay. Use animation.control and runtime.inspect in the preview for runtime verification.', {asset:resource,time:z.number().min(0).max(86400)}, 'animation.sample', true);
tool('animation_bind', 'Attach/reuse cc.Animation and bind an existing .anim, preserving existing clips. Optionally set default clip and playOnLoad. Native typed edits; save scene explicitly. This does not verify all animated target paths or business event handlers.', {node:resource,asset:resource,defaultClip:z.boolean().default(true),playOnLoad:z.boolean().default(true)}, 'animation.bind');
const runtimeWindow = z.number().int().positive();
tool('runtime_inspect', 'Read actual game node state in an MCP-owned preview/build window: transforms, UI size/anchor, Label/RichText font bindings and actual shrink size, Animation states, Spine tracks/bones and retained adapter events. Requires engine ready; exact runtime path/UUID or unique name. Runtime UUIDs differ from editor UUIDs. Event subscriptions start when using control operations.', {windowId:runtimeWindow,node:resource,bones:z.array(z.string().max(150)).max(30).default([]),after:z.number().int().min(0).default(0),limit:z.number().int().min(1).max(100).default(30)}, 'runtime.inspect', true);
tool('animation_control', 'Control cc.Animation in an MCP-owned running game window: play/pause/resume/stop/crossFade/sample. Runtime only, never saves editor content. sample pauses chosen/default state, sets time and samples actual targets. Inspect afterward to verify.', {windowId:runtimeWindow,node:resource,action:z.enum(['play','pause','resume','stop','crossFade','sample']),clip:z.string().min(1).optional(),fade:z.number().min(0).max(60).default(0.3),time:z.number().min(0).max(86400).default(0)}, 'animation.control');
tool('spine_inspect', 'Load imported sp.SkeletonData using installed engine runtime. Read runtime/source version compatibility, parse success, animations, skins, bones, slots/events and direct textures. Binary null compatibility is not a positive version check.', {asset:resource}, 'spine.inspect', true);
tool('spine_configure', 'Attach/reuse sp.Skeleton and bind a parsed compatible imported skeleton, validated skin/animation, loop and timeScale via typed native properties. Save scene explicitly. Not a skeleton authoring/exporter tool.', {node:resource,asset:resource,skin:z.string().min(1).optional(),animation:z.string().min(1).optional(),loop:z.boolean().default(true),timeScale:z.number().min(0).max(100).default(1)}, 'spine.configure');
tool('spine_control', 'Control actual Spine runtime in an MCP-owned preview/build: play/queue tracks, skin, mix, clear, pause/resume. Validates animation/skin names. Retains bounded per-track complete/custom event observations without replacing global gameplay listeners. Changes are runtime only.', {windowId:runtimeWindow,node:resource,action:z.enum(['play','queue','skin','mix','clear','pause','resume']),animation:z.string().min(1).optional(),skin:z.string().min(1).optional(),track:z.number().int().min(0).max(7).default(0),loop:z.boolean().default(true),delay:z.number().min(0).max(3600).default(0),from:z.string().min(1).optional(),to:z.string().min(1).optional(),duration:z.number().min(0).max(60).default(0.3)}, 'spine.control');
tool('build_platforms', 'List installed Creator build platforms. Dedicated validated task/artifact/preview workflow currently targets Web desktop/mobile; native platforms still require SDK/toolchain-specific acceptance.', {}, 'build.platforms', true);
tool('build_start', 'Queue a native Web build of explicit saved project scenes. Requires clean editor and no running build. Uses unique output under project build/cocos-mcp; returns durable runId, not completion. Poll status, inspect logs/artifacts and launch built game. dryRun validates inputs only.', {platform:z.enum(['web-desktop','web-mobile']).default('web-desktop'),scenes:z.array(resource).min(1).max(100),startScene:resource.optional(),debug:z.boolean().default(true),sourceMaps:z.boolean().default(false),dryRun:z.boolean().default(false)}, 'build.start');
tool('build_status', 'Read an owned build run by persistent runId and correlate unique native task. Reports native waiting/processing/success/failure/cancel, progress and bounded message. Unknown is not success; accepted/start is not completion.', {runId:z.string().uuid()}, 'build.status', true);
tool('build_artifacts', 'Require native terminal success, inventory owned Web output and verify nonempty index/JS. Optional per-file SHA256; bounded result. Files existing alone are not gameplay verification; use build.preview and runtime checks.', {runId:z.string().uuid(),hashes:z.boolean().default(false),limit:z.number().int().min(1).max(500).default(30)}, 'build.artifacts', true);
tool('build_logs', 'Read bounded native build log tail for an owned run. Last 128 KiB, optional substring filter and line limit. No arbitrary filesystem path access.', {runId:z.string().uuid(),filter:z.string().max(200).optional(),limit:z.number().int().min(1).max(200).default(40)}, 'build.logs', true);
tool('build_preview', 'Verify successful owned build, serve only its artifacts on loopback and open in a sandboxed MCP game window. Reuses owned preview. Loaded does not prove game-ready; inspect runtime, console and screenshot. Server stops on extension unload or build.stopServer.', {runId:z.string().uuid(),width:z.number().int().min(480).max(2560).default(1100),height:z.number().int().min(480).max(1600).default(800),testEvidence:z.boolean().default(false)}, 'build.preview');
tool('build_stop_server', 'Stop only this owned build static server. Preserve build files/native task; preview window can be closed separately.', {runId:z.string().uuid()}, 'build.stopServer');
tool('prefab_inspect', 'Inspect a project subtree/instance: actual prefab root, asset SHA256 revision, dependencies and external Node/Component references. Use UUIDs returned by prefab.open in prefab editing mode.', { node: z.string().min(1) }, 'prefab.inspect', true);
tool('prefab_validate', 'Validate a project prefab source: serialized object references, AssetDB dependencies and registered classes. Returns SHA256 revision needed by apply/save/restore. Does not prove visual or runtime correctness.', { asset: prefabAsset }, 'prefab.validate', true);
tool('prefab_create', 'Create a linked prefab using Creator native serialization. Refuses overwrite, existing prefab membership and incoming/outgoing external Node/Component references. Creator REPLACES the subtree with new UUIDs and filename; use returned node UUID and resolve descendants again. dryRun prechecks only. Save scene explicitly.', {
  node: z.string().min(1), url: z.string().startsWith('db://assets/').endsWith('.prefab'), dryRun: z.boolean().default(false),
}, 'prefab.create');
tool('prefab_instantiate', 'Instantiate an imported project prefab and verify linkage. parent accepts UUID/path/name; explicit content parent required in prefab mode. Returns node UUID. Save scene explicitly.', {
  asset: prefabAsset, parent: z.string().min(1).optional(), name: z.string().min(1).max(100).optional(), position: vector.optional(),
}, 'prefab.instantiate');
tool('prefab_apply', 'Apply a linked instance ROOT to its shared prefab asset with native Creator API. Refuses external refs and stale expectedRevision from inspect/validate. Saves local recoverable backup before writing. Affects other instances; scene save is explicit. dryRun does not write.', {
  node: z.string().min(1), expectedRevision: prefabRevision, dryRun: z.boolean().default(false),
}, 'prefab.apply');
tool('prefab_revert', 'Restore a linked instance ROOT from its prefab asset using native undo-aware restore. Discards instance overrides; does not modify the asset. Save scene explicitly.', { node: z.string().min(1) }, 'prefab.revert');
tool('prefab_unlink', 'Unlink a linked instance ROOT using native undo-aware API. recursive=false preserves nested prefab links; true unlinks nested instances too. Does not delete the asset. Save scene explicitly.', { node: z.string().min(1), recursive: z.boolean().default(false) }, 'prefab.unlink');
tool('prefab_open', 'Enter native prefab editing mode. Refuses unsaved current edits; returns real content root UUID, asset revision and returnAsset. Edit through normal node/component tools, then prefab.save and prefab.close.', { asset: prefabAsset }, 'prefab.open');
tool('prefab_save', 'Save current native prefab editing context. Requires expectedRevision from open/validate, checks external refs, creates local backup, verifies serialized asset and clean dirty state. This writes a shared asset.', { expectedRevision: prefabRevision }, 'prefab.save');
tool('prefab_close', 'Leave prefab editing mode for explicit returnAsset UUID/URL returned by prefab.open. Refuses unsaved edits; never discards or silently saves.', { returnAsset: z.string().min(1) }, 'prefab.close');
tool('prefab_restore', 'Restore a prefab backup created by apply/save/restore through AssetDB, preserving .meta. Requires clean current context and expectedRevision; backs up current content first. backupId is project-local and bound to this exact asset. Reopen scene to verify instance sync.', {
  asset: prefabAsset, backupId: z.string().uuid(), expectedRevision: prefabRevision, dryRun: z.boolean().default(false),
}, 'prefab.restore');
tool('preview_open', 'Open/reload this project local Web preview in a dedicated sandboxed Electron window controlled by editor.screenshot and editor.input. Requires a saved scene. Reuses its own preview window. Loaded is not game-ready; inspect screenshot/runtime evidence. testEvidence adds mcp-test=1 for the bundled demo only.', {
  width: z.number().int().min(480).max(2560).default(1100), height: z.number().int().min(480).max(1600).default(800), testEvidence: z.boolean().default(false),
}, 'preview.open');
tool('preview_close', 'Close only a dedicated preview window created by preview.open. Does not close Creator editor windows or external browsers.', { windowId: z.number().int().positive() }, 'preview.close');
tool('preview_status', 'Read a dedicated MCP preview window: load state, canvas bounds, bounded browser console logs and optional bundled-demo test evidence. DOM/canvas readiness is not proof of working gameplay. Use screenshot and real input. since filters retained logs by timestamp in ms.', {
  windowId: z.number().int().positive(), since: z.number().nonnegative().optional(), limit: z.number().int().min(1).max(100).default(30),
}, 'preview.status', true);
tool('node_resolve', 'Resolve a project node by UUID, exact Canvas/Panel path or unique name. Rejects ambiguous names and editor helper nodes. Returns a compact identity and component list.', { target: z.string().min(1).max(500) }, 'node.resolve', true);
tool('component_properties', 'Read plain component properties and types without full inspector metadata. node accepts UUID/path/unique name; component accepts registered type or component UUID. Use names to return only needed fields.', {
  node: z.string().min(1), component: z.string().min(1), names: z.array(z.string().min(1)).max(40).optional(),
}, 'component.properties', true);
tool('component_patch', 'Set 1–40 public top-level component properties using plain values and installed inspector types. References: {$node:"Canvas/Panel"}, {$component:{node:"path",type:"cc.Label"}}, {$asset:"db://assets/..."}, {uuid:"..."}, null to clear. Checks all fields/references before edits; one undo group, readback and best-effort restoration on error. Not a whole-scene transaction. dryRun makes no edits.', {
  node: z.string().min(1), component: z.string().min(1), properties: jsonObject, dryRun: z.boolean().default(false),
}, 'component.patch');
tool('script_status', 'Check whether a Component ccclass is registered in the scene. Optional asset URL/UUID verifies script ownership. This does not run full TypeScript type checking or prove latest source hot-reloaded.', {
  className: z.string().min(1).max(150), asset: z.string().min(1).optional(),
}, 'script.status', true);
tool('script_attach', 'Wait for a project script ccclass to register, verify ownership against required asset URL/UUID, then attach once through native messages. Existing component is reused. Write scripts with asset.write first. Timeout never adds a component; inspect editor.logs. Saves are explicit. Registration does not prove latest hot-reloaded code or TS type correctness.', {
  node: z.string().min(1), className: z.string().min(1).max(150), asset: z.string().min(1), timeoutMs: z.number().int().min(0).max(25000).default(15000),
  requiredMethods: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/)).max(30).optional(),
}, 'script.attach');
tool('button_events', 'Configure Button click events through typed native property dumps. Resolve target by UUID/path/name, verify target component and handler. replace sets exact list; append skips identical events; remove uses zero-based index; clear removes all. dryRun validates without edits. Readback does not replace runtime click testing.', {
  node: z.string().min(1), mode: z.enum(['replace', 'append', 'remove', 'clear']), index: z.number().int().nonnegative().optional(),
  events: z.array(z.object({ target: z.string().min(1), component: z.string().min(1), handler: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/), customEventData: z.string().max(5000).default('') }).strict()).max(100).optional(),
  dryRun: z.boolean().default(false),
}, 'button.events');
const nodeSpec = z.lazy(() => z.object({
  name: z.string().min(1).max(100),
  active: z.boolean().optional(),
  position: vector.optional(),
  size: z.object({ width: z.number().positive().max(10000), height: z.number().positive().max(10000) }).strict().optional(),
  components: z.array(z.object({ type: z.string().min(1), properties: jsonObject.optional() }).strict()).max(20).optional(),
  children: z.array(nodeSpec).max(100).optional(),
}).strict());
tool('ui_templates', 'List built-in UI templates and their intended parent. Templates are source-controlled and can be inspected without editing.', {}, 'ui.templates', true);
tool('ui_build', 'Build UI through native undo-aware messages in the project hierarchy, excluding editor helper Canvases. Supply tree or template. Defaults to the sole active project Canvas; creates a Canvas and UI camera if absent unless createCanvas=false. An explicit parent must be inside a project Canvas. Multiple Canvases require parent. Checks hierarchy membership and camera; use dryRun first. Failure cleans up only this build.', {
  parent: z.string().min(1).optional(), template: z.enum(['menu', 'dialog', 'hud']).optional(), tree: nodeSpec.optional(), dryRun: z.boolean().default(false), createCanvas: z.boolean().default(true),
}, 'ui.build');
tool('scene_snapshot', 'Capture a bounded scene snapshot in editor memory (max 8); returns its id and node count. Snapshots contain structure, transforms, UI size and label text, not a complete scene serialization. Not an undo backup.', {}, 'scene.snapshot', true);
tool('scene_diff', 'Compare a saved snapshot to the current scene; reports added/removed/changed nodes. IDs expire on extension reload. Checks structural and selected UI properties only.', {
  snapshotId: z.string().min(1), limit: z.number().int().min(1).max(500).default(100),
}, 'scene.diff', true);
tool('scene_validate', 'Check scene for duplicate sibling names and zero-size UI transforms. Bounded structural/UI diagnostics; does not claim comprehensive asset-reference or visual validation.', { limit: z.number().int().min(1).max(500).default(100) }, 'scene.validate', true);
tool('knowledge_query', 'Search bundled practical guidance for UI, undo, prefabs, animation, assets, debugging and build workflows. Results distinguish implemented tools from workflow advice.', {
  query: z.string().min(1).max(200), limit: z.number().int().min(1).max(10).default(3),
}, 'knowledge.query', true);
tool('editor_status', 'Check bridge connection, actual Creator version and configured project. Does not require the scene to be ready.', {}, 'status', true);
tool('editor_operation_status', 'Inspect a timed-out request by requestId. Completed means the handler returned; verify resulting editor state. History holds up to 200 operations.', { requestId: z.string() }, 'operation.status', true);
tool('editor_events', 'Read recent bridge operation events and scene/save/compile/build broadcasts. This is not the complete Creator console. Use after=latest to poll incrementally.', { after: z.number().int().nonnegative().optional() }, 'events', true);
tool('editor_logs', 'Read Creator console logs (including errors and compilation messages) via Editor.Logger.query. Filter by level, message substring, or since timestamp in milliseconds. Returns the latest matching entries.', {
  level: z.enum(['log', 'info', 'warn', 'error']).optional(), filter: z.string().optional(),
  since: z.number().nonnegative().optional(), limit: z.number().int().min(1).max(500).default(100),
}, 'editor.logs', true);
tool('editor_api', 'Read actual installed Creator/engine TypeScript declarations to discover precise parameters before invoking advanced APIs. source=message/types requires package; editor is Editor API; engine is project cc.d.ts. Search returns matching line numbers, then use startLine to read context.', {
  source: z.enum(['message', 'types', 'editor', 'engine']).default('message'), package: z.string().default('scene'),
  search: z.string().optional(), startLine: z.number().int().positive().default(1), limit: z.number().int().min(1).max(300).default(100),
}, 'editor.api', true);
tool('editor_messages', 'Discover installed editor/extension messages with localized documentation and examples. Filter by package, e.g. scene, asset-db, builder, preview, animation. Private messages may change between Creator versions.', {
  package: z.string().optional(), filter: z.string().optional(), publicOnly: z.boolean().optional(),
  offset: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(500).optional(),
}, 'editor.messages', true);
tool('editor_request', 'Invoke any installed Creator message. Discover its exact arguments with editor_messages first. request awaits its handler; send only acknowledges dispatch and can trigger UI operations without a reply.', {
  package: z.string().min(1), message: z.string().min(1), args: z.array(z.unknown()).default([]), mode: z.enum(['request', 'send']).default('request'),
}, 'editor.request');
tool('editor_script', 'Run an async JavaScript function body in the editor main process (Editor, require, args) or scene process (cc, Editor, require, args). Full local trust, no sandbox. Explicitly return plain JSON; never return engine/native objects. Direct scene engine mutations may bypass undo/dirty tracking; prefer native messages, then verify and save.', {
  context: z.enum(['main', 'scene']), code: z.string().min(1).max(500_000), args: jsonObject.default({}),
}, 'editor.script');
tool('scene_tree', 'Read the open scene node hierarchy, optionally rooted at uuid. Query object dumps with node_inspect before setting properties.', { uuid: z.string().optional() }, 'scene.tree', true);
tool('scene_open', 'Open an existing .scene asset by db:// URL or asset UUID. Refuses if current scene has unsaved edits.', { asset: z.string().min(1) }, 'scene.open');
tool('scene_save', 'Save the current scene and check its dirty state. Untitled scenes may require a Save As dialog; prefer opening an existing scene first.', {}, 'scene.save');
tool('node_inspect', 'Get the full Creator inspector dump for a node or component. Use dump types/paths to update properties.', { uuid: z.string().min(1), kind: z.enum(['node', 'component']).default('node') }, 'node.inspect', true);
tool('node_create', 'Create an undoable node, or instantiate a prefab/built-in asset via assetUuid. Returns the new node UUID.', {
  name: z.string().min(1), parent: z.string().optional(), assetUuid: z.string().optional(),
  position: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
  nameIncrease: z.boolean().default(false),
}, 'node.create');
tool('node_remove', 'Delete the specified scene nodes using the editor.', { uuids }, 'node.remove');
tool('node_duplicate', 'Duplicate scene nodes using Creator.', { uuids }, 'node.duplicate');
tool('node_reparent', 'Move scene nodes under a parent, optionally preserving world transforms.', { uuids, parent: z.string().min(1), keepWorldTransform: z.boolean().default(true) }, 'node.reparent');
tool('property_set', 'Set one inspector property through Creator with undo recording. Provide a dump using the actual type and new value from node_inspect, e.g. {type:"String",value:"Player"}. Node paths include name, position, rotation, scale; component paths are relative to its UUID.', {
  uuid: z.string().min(1), path: z.string().min(1), dump: jsonObject,
}, 'property.set');
tool('component_add', 'Add a registered component (e.g. cc.Label, cc.Sprite, cc.RigidBody2D or a project ccclass) to a node; return its updated dump.', { uuid: z.string().min(1), component: z.string().min(1) }, 'component.add');
tool('component_remove', 'Remove a component by its component UUID.', { uuid: z.string().min(1) }, 'component.remove');
tool('editor_selection', 'Get selection, or set it when uuids is supplied. type is node or asset. An empty uuids array clears selection.', { type: z.enum(['node', 'asset']).default('node'), uuids: z.array(z.string()).optional() }, 'selection');
tool('asset_query', 'Search the Creator asset database. Example pattern db://assets/**/*.scene and type cc.SceneAsset. Results are paginated.', {
  pattern: z.string().default('db://assets/**'), type: z.string().optional(),
  offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(500).default(100),
}, 'asset.query', true);
tool('asset_write', 'Create or save a text asset/script using Creator AssetDB, preserving meta/import behavior. Create refuses existing assets; save requires an existing asset. Use editor_request for import/copy/move/delete/reimport or binary assets.', {
  url: z.string().startsWith('db://assets/'), content: z.string().max(1_000_000), mode: z.enum(['create', 'save']).default('create'),
}, 'asset.write');
tool('project_read', 'Read a UTF-8 project file up to 1 MiB. Paths must remain inside the project after resolving symlinks. For assets write through asset_write.', { path: z.string() }, 'project.read', true);
tool('project_files', 'List a project directory, excluding generated/dependency directories.', { path: z.string().default('.') }, 'project.files', true);
tool('editor_panel', 'Open an editor panel by registered name, e.g. inspector, assets, console, builder. Verify using screenshot.', { name: z.string().min(1) }, 'editor.panel');
tool('editor_windows', 'List Electron windows owned by this Creator instance, IDs and content bounds in DIP coordinates.', {}, 'editor.windows', true);
tool('editor_window', 'Focus/show/restore, maximize or minimize a Creator window. Focus a minimized window before screenshot or input.', {
  windowId: z.number().int().positive(), action: z.enum(['focus', 'restore', 'maximize', 'minimize']),
}, 'editor.window');
tool('editor_screenshot', 'Capture a Creator Electron window as PNG. Metadata includes originalSize, imageSize and contentBounds. Map image coordinates to content DIP: x * contentBounds.width / imageSize.width (and similarly y). Native scene surfaces can appear blank on some GPU configurations.', {
  windowId: z.number().int().positive(), maxWidth: z.number().int().min(320).max(3840).optional(),
}, 'editor.screenshot', true);
tool('editor_input', 'Send input to an observed Creator window. Coordinates are content-local DIP, not desktop pixels. For a click send mouseDown and mouseUp; use mouseMove sequences for drag. text inserts Unicode at focus. This cannot control OS-native dialogs or external apps. Re-capture to verify.', {
  windowId: z.number().int().positive(), text: z.string().max(100_000).optional(),
  events: z.array(z.object({
    type: z.enum(['mouseDown', 'mouseUp', 'mouseMove', 'mouseWheel', 'keyDown', 'keyUp', 'char']),
    x: z.number().int().optional(), y: z.number().int().optional(), button: z.enum(['left', 'middle', 'right']).optional(),
    clickCount: z.number().int().min(1).max(3).optional(), deltaX: z.number().optional(), deltaY: z.number().optional(),
    keyCode: z.string().optional(), modifiers: z.array(z.string()).optional(),
  })).max(200).optional(),
}, 'editor.input');
tool('editor_menu', 'List the actual application menu, or dispatch a leaf item using its numeric path from that list, e.g. [1,0]. Verify the resulting state separately.', { path: z.array(z.number().int().nonnegative()).min(1).optional() }, 'editor.menu');

