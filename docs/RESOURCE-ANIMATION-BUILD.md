# 资源、动画、Spine 与 Web 构建（0.5）

支持基线：Windows、Creator 3.8.8、其内置 Spine 3.8 runtime。四个 MCP 入口保持不变；先用 `cocos_catalog` 查询准确 schema，可一次传 `ops` 数组获取最多 12 项。

## 资源工作流

`asset.info` 返回资源主/子身份、源 SHA256、直接依赖和反向引用。`asset.graph` 通过原生 AssetDB 做有界遍历，支持 dependencies/users/both，默认深度 2、100 节点、300 边；上限为深度 8、1000 节点、3000 边。结果显式报告 missing、truncated、depthLimited、changedDuringRead；这些标志存在时，不应当作完整依赖闭包。动态图路径及脚本字符串不在索引内。

边缓存 1.5 秒，资源广播和本工具写操作使其失效；generation 检测读取期间变化。边去重使用 Set。`queries` 是依赖/引用查询次数，`cachedQueries` 是其中的缓存命中数，不包含身份查询。移动、复制、重导入目前处理项目源文件，拒绝目录、子资源、内部资源和覆盖已有目标；二进制/文件夹导入走 `asset.import`，保留原生 importer 行为。

推荐替换流程：

1. 用 `asset.info`、`asset.graph` 查看身份与引用，先自行保存当前场景。
2. `asset.replace.plan {from,to}`：要求相同导入类型，仅替换原生直接 users 源 JSON 中精确的 `__uuid__` 字段；显示受影响文件/位置。任何不支持的 user 都会阻止 apply，脚本类迁移不支持。
3. 检查计划后，`asset.replace.apply {planId}` 重新核对 users、URL/UUID、源哈希，写本地备份，再通过 AssetDB 保存并回读。
4. 重开受影响场景并验证显示/运行。源文件正确不代表运行时已经重新加载。
5. 需要恢复时，`asset.restore {backupId,dryRun:true}` 先检查，再实际恢复；拒绝外部新修改、移动和篡改备份。保留 `.meta`，不会盲目覆盖。

源文件限制 16 MiB；每计划保留源缓冲最多 32 MiB，所有计划共最多 64 MiB，最多 8 份、5 分钟有效，扩展重载后失效。多文件写入不是事务；失败时尽力恢复本工具已尝试、且未被其他人修改的文件，报告不完整恢复和备份 ID。备份在项目 `local/cocos-mcp/resource-backups`。

## 原生动画

`animation.create` 通过已安装引擎的公开 Track/Curve API 创建 `.anim`，由 Creator 序列化器输出源文件，不手写内部序列化格式。`animation.edit` 要求 `expectedRevision`，修改前备份；省略 tracks/events 时保留原列表，显式传数组则替换整个列表。编辑共享资源要求当前场景干净；新建资源允许继续编辑当前场景。

轨道支持 real、vector2/3/4、color、size、quat、object。实数支持 LINEAR/CONSTANT/CUBIC 及切线；四元数使用 LINEAR→SLERP 或 CONSTANT，拒绝 CUBIC；对象轨道为离散值，可用 primitive/null/`{$asset:urlOrUuid}`。限制 20,000 个关键帧，时间严格递增且位于 duration 内，四元数须归一化。模型导入子动画、动画图/状态机、时间轴界面编辑与预设库尚未提供专用流程。

`animation.inspect` 默认只读轨道路径、有效通道、键数与事件，`keys:true` 才读全键。`animation.sample` 返回曲线值，不修改场景目标。`animation.bind` 复用或添加 `cc.Animation`，保留已绑定 clips，配置默认动画/自动播放；配置失败尝试移除本次新增组件。随后显式保存场景，再在预览中验证真实目标和业务事件。运行时 Clip 名称以导入后的检查结果为准，可能采用资源文件名。

## Spine

`spine.inspect` 实际加载 `sp.SkeletonData`，报告安装 runtime/source 版本、兼容检测、解析结果、动画/皮肤/骨骼/槽/事件与纹理。JSON 用完整 skeleton 数据做兼容判断；二进制资源 compatibility=null 不代表已通过版本检查。本版实际验证的是原创 JSON 3.8.99 样例；二进制及其他导出版本需要独立验收。

`spine.configure` 先核对资源、纹理尺寸、skin/animation，再绑定 `sp.Skeleton`。Creator 检查器保存自动播放字段为 `defaultAnimation`；运行时控制使用实际 track。它不编辑 Spine 工程或代替 Spine 导出器。

在本工具拥有的预览或构建窗口中：

- `runtime.inspect`：实际节点位置、组件、Label、Animation 状态、Spine tracks/指定 bones 和增量事件。
- `animation.control`：play/pause/resume/stop/crossFade/sample；sample 会暂停选中状态并采样实际目标。
- `spine.control`：play/queue、skin、mix、clear、pause/resume，验证动画/皮肤名称。监听本工具创建的 track entry 的完成/自定义事件，不替换游戏全局监听。

这些改变只影响运行中的游戏，不保存编辑器。事件缓冲最多 200 条，用 `after` 序号增量读取；观察从 adapter 订阅后开始。运行树最多 5000 节点、100 层，路径/名称歧义会拒绝。缓存动画模式、复杂混合和自定义运行管线需额外验收。

## Web 构建闭环

`build.platforms` 列出安装平台；专用完整流程当前针对 web-desktop/web-mobile。

1. `build.start {platform,scenes:[...],dryRun:true}` 预检查；scenes 必须明确，首项默认启动场景。
2. 保存场景后实际 start。AssetDB 必须就绪，拒绝并行提交另一构建。返回持久 `runId`；accepted 只是提交，不是完成。
3. `build.status {runId}` 读取 waiting/processing/success/failure/cancel。使用唯一输出名关联 native task ID；unknown 不视为成功，不应重新提交。
4. `build.logs` 读取原生日志末尾最多 128 KiB，可过滤/限行。`build.artifacts` 要求 native success，检查自有目录、非空 index 与 JS、文件数/大小，可 SHA256；哈希按 1 MiB 块读取。
5. `build.preview` 仅在 loopback 服务该次产物，打开沙箱游戏窗口。继续读取 runtime/控制动画、检查日志和截图，才证明产物启动与所测行为成立。
6. `build.stopServer` 停止本次本地服务，保留产物与原生任务。扩展卸载关闭自有服务/窗口。

产物位置：项目 `build/cocos-mcp/web-<runId>`；manifest：`local/cocos-mcp/build-runs`。Creator 任务历史消失后返回 unknown，暂不根据旧文件推断成功。构建取消专用接口、Android/iOS/桌面原生 SDK 工具链、小游戏发布与上传未验收；本工具不自动发布到外部平台。

Creator 面板「资源与构建」提供资源图、动画/Spine 检查、构建预检查/启动/3 秒状态轮询/日志/产物/启动入口，走同一队列和暂停控制。离开该页停止状态轮询，重新打开可粘贴 Run ID 继续查询。

## 复现与证据

在独立测试项目安装当前扩展、等待资源就绪并保存当前场景后：

```sh
npm run demo:workflow
npm run test:live:resources
npm run test:live:animation
npm run test:live:workflow
# 通过 build.start 提交，再只读查询终态 success 后：
node scripts/live-workflow-check.mjs --run <runId>
npm run benchmark:workflow
```

样例生成器拒绝覆盖已有场景；要重复配置自己的样例，先打开并保存它，再运行 `node scripts/create-workflow-demo.mjs --resume`。原创 PNG、atlas、Spine JSON 与事件脚本见 `examples/animation-spine/fixture.mjs`，无第三方示例资源。资源/动画回归保留独立命名资产，便于检查。

本机报告：`artifacts/workflow-demo.json`、`live-resource-check.json`、`live-animation-check.json`、`live-workflow-check.json`、`live-build-<runId>.json`、对应截图和 `workflow-benchmark.json`。这些本地验证文件不混入源码发行包；用户可以运行脚本生成自己的结果。

2026-10-28：Web Desktop 40 个文件、native 23 秒；Web Mobile 39 个文件、native 65 秒。二者均通过实际产物动画采样/业务 Label 更新/Spine 事件检查。时间依赖本机引擎缓存，不能当作跨机器性能保证或 Pro 对比。
