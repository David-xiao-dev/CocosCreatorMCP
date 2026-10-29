# 与 DaxianLee/cocos-mcp-server 的源码对比

> 本文保留公开版与本地 0.1.0 的历史对比。当前完整分析与研发规格见 [Pro 功能分析与产品规格](PRO-CAPABILITY-ANALYSIS.md)，不要将本文源码问题或许可判断直接外推到 Pro。

分析日期：2026-10-28。对比对象：GitHub main 分支提交 `a5db895b3299dccd78979ca0268193e4b6ebf037`，package.json 版本 **1.5.4**；本地项目版本 **0.1.0**。

第三方仓库已下载到 `artifacts/references/cocos-mcp-server`。本次对它进行静态源码分析，未安装到 Creator 运行；本地项目的运行证据来自上一轮 5 项自动测试、15 项真实编辑器检查，以及窗口操作记录。

## 判断

第三方项目提供更多已经命名和组织好的专用操作，以及更完整的插件管理界面。本地首版提供的专用功能较少，但已经针对本机 Creator 3.8.8 和 Codex 验证了连接、基础编辑、撤销、日志和窗口控制，并保留通用 API/脚本通道。

不能用“50 个工具对 30 个工具”直接判断覆盖率：第三方工具往往用 action 分发多个功能，本地工具中则包含能调用其他编辑器消息的通用入口。两者都没有证据证明所有人工编辑工作流已得到完整验收。

## 先区分公开版和 Pro

- 公开源码当前版本 1.5.4，移除被注释的工具定义后，统计得到 **50 个工具定义、13 类工具模块**。
- README 提到的 **Pro 1.7.8、16 个意图工具、231 项操作、动画/Spine、知识库、场景构建器和失败回滚**属于另一产品的介绍，不能据此认定这些实现已经在当前 GitHub 源码中提供。
- README 的“99% 编辑器控制”和性能、Token 节省比例没有在这个提交中提供可复现的完整验收依据。
- package.json 声明 Creator `>=3.8.6`，3.8.8 在其声明范围内；本地首版明确针对 3.8.8，扩展声明范围为 `>=3.8.8 <3.9.0`。

证据：[公开版 package.json](https://github.com/DaxianLee/cocos-mcp-server/blob/a5db895b3299dccd78979ca0268193e4b6ebf037/package.json)、[README 中的 Pro 说明](https://github.com/DaxianLee/cocos-mcp-server/blob/a5db895b3299dccd78979ca0268193e4b6ebf037/README.md#L9)。

## 能力比较

| 维度 | GitHub 公开版 1.5.4 | 本地首版 0.1.0 |
| --- | --- | --- |
| 整体架构 | MCP HTTP 服务直接运行在 Creator 扩展主进程 | 独立 Node.js MCP STDIO 服务，连接 Creator 中的本机桥接扩展 |
| MCP 实现 | 手写 HTTP/JSON-RPC，源码处理 initialize、tools/list、tools/call | 官方 MCP SDK，Zod 校验工具入口参数，提供工具注解和 isError |
| 安装与管理 | Vue 插件面板、启停服务、端口、自动启动、工具配置和持久化 | 外部 Node.js 22；扩展无需编译；安装脚本和诊断命令；尚无完整管理面板 |
| 工具组织 | 50 个工具，许多工具包含多个 action | 30 个工具，基础专用工具加通用消息/API/脚本入口 |
| 节点和组件 | 更多专用查询、节点类型、剪贴板、数组、脚本挂载和多属性转换 | 常用节点与组件操作已实测；高级能力主要经通用接口调用 |
| 按钮事件 | configure_click_event 提供添加、修改、删除和清空事件的专用封装 | 尚无专用按钮事件工具，需读取属性或用脚本/消息完成 |
| 预制体 | 专用创建、校验、实例化、关联、应用/还原和编辑模式实现，代码规模较大 | 可通过 assetUuid 创建实例及通用接口操作，未完成完整预制体工作流验收 |
| 场景视图与参考图 | 专门封装 Gizmo、2D/3D、网格、相机、参考图变换和显示 | 无专用封装，可经消息发现调用；另有真实窗口截图和输入 |
| UI 操作 | 在所审源码中未发现窗口截图、鼠标键盘输入或主菜单操作工具 | 支持窗口截图、焦点、鼠标、文字、键盘及主菜单；部分操作已实测 |
| 通用扩展能力 | 可执行组件方法和已注册的场景脚本方法 | 可发现已安装消息、读取实际类型声明、调用任意编辑器消息；可在 main/scene 执行异步 JS |
| 日志 | 有内存控制台缓存和磁盘日志读/搜索；控制台缓存接入存在缺口 | 直接读取 Editor.Logger.query，已验证已知日志标记 |
| 预览与构建 | 专用入口实际打开构建面板，要求用户手工继续 | 已查询预览 URL，保留消息/窗口通道；同样未完成自动构建闭环验收 |
| 长操作反馈 | 未见服务级操作队列、requestId 状态历史或客户端超时后的查询工具 | 串行操作队列、requestId、状态历史和事件；不提供事务回滚，扩展重启后历史消失 |
| 多项目连接 | 默认固定端口 3000，可配置其他端口 | 每实例动态端口，客户端明确绑定项目，检查连接文件的项目路径 |
| 本机访问限制 | 监听 127.0.0.1；HTTP 接口未检查 Token，CORS 为 * | 监听 127.0.0.1；随机 Bearer Token，拒绝 Origin，请求/响应大小限制 |
| 测试证据 | 作者 README 称测试过 Claude 客户端/CLI、Cursor；当前提交未找到自动测试文件或 test script | 本机 SDK 协议/桥接测试 5 项、真实 Creator 检查 15 项、界面操作记录；不代表完整游戏开发已验收 |

“更多专用封装”有实际价值：AI 不必每次查询底层参数、寻找组件下标或自行拼接事件结构。本地首版的通用执行入口虽然覆盖面灵活，但会把更多决策和验证工作交给 AI，调用次数与出错率仍取决于任务。后续值得补齐高频任务的专用工具。

## 源码中确认的缺口与疑点

### 1. build/run 目前不等于完成运行或构建

`runProject()` 和 `buildProject()` 都只调用 `Editor.Message.request('builder', 'open')`，返回的说明明确要求手动操作；构建选项只是生成数据，并没有传给实际构建任务。

这意味着用公开版下达“构建 Android”后，返回 success 不能理解为 APK 已生成。本地首版也尚未完成自动构建验收，不能声称这项已经优于对方。

证据：[project-tools.ts:109](https://github.com/DaxianLee/cocos-mcp-server/blob/a5db895b3299dccd78979ca0268193e4b6ebf037/source/tools/project-tools.ts#L109)。

### 2. 工具禁用主要影响工具列表，执行入口未校验

`setupTools()` 根据配置筛选暴露的列表，但 `executeToolCall()` 只按类别和方法派发，不检查目标工具是否已启用。如果请求方知道工具名称，列表中被隐藏的工具仍可到达执行代码。并且启用列表为空时会回退为暴露全部工具，因此“全不选”的语义有问题。

本地首版暂时没有插件内部的工具配置界面，不能将这一点描述为两边都有完整权限系统；这里指出的是第三方现有工具管理功能的实现缺口。

证据：[mcp-server.ts:105](https://github.com/DaxianLee/cocos-mcp-server/blob/a5db895b3299dccd78979ca0268193e4b6ebf037/source/mcp-server.ts#L105)、[执行入口:138](https://github.com/DaxianLee/cocos-mcp-server/blob/a5db895b3299dccd78979ca0268193e4b6ebf037/source/mcp-server.ts#L138)。

### 3. 控制台实时采集尚未接入

`setupConsoleCapture()` 只打印初始化提示；`getConsoleLogs()` 读取私有数组。仓库中 `addConsoleMessage()` 只有定义，未找到调用或事件注册。因此不能据 `debug_console/get_logs` 的存在就认定它已能持续获取真实编辑器控制台消息。它的磁盘日志读取能力是另一条独立通道。

证据：[debug-tools.ts:15](https://github.com/DaxianLee/cocos-mcp-server/blob/a5db895b3299dccd78979ca0268193e4b6ebf037/source/tools/debug-tools.ts#L15)。本地实现位于 `extension/main.js` 的 editor.logs 分支，直接调用 Editor.Logger.query。

### 4. 预制体标准实例化路径有明显适配风险

`instantiatePrefabStandard()` 不传 parentUuid 时使用写死的场景 UUID。它调用 begin-recording 后未保存返回值，结束时却传入临时拼出的数组 `instantiate-${Date.now()}`，而不是该次记录 ID。

这些都是可定位的代码事实，会影响不同场景中的实例化和撤销可靠性。该工具还有简化回退路径，因此不能仅凭这一处断言预制体功能全部不可用；具体影响仍需在真实项目复现。

证据：[prefab-tools.ts:802](https://github.com/DaxianLee/cocos-mcp-server/blob/a5db895b3299dccd78979ca0268193e4b6ebf037/source/tools/prefab-tools.ts#L802)、[结束记录:840](https://github.com/DaxianLee/cocos-mcp-server/blob/a5db895b3299dccd78979ca0268193e4b6ebf037/source/tools/prefab-tools.ts#L840)。本地版本的属性撤销会传递真实 recording ID，且已在节点和组件属性上验证 undo/redo。

### 5. 协议和来源校验需要补强

HTTP 层对所有来源返回 `Access-Control-Allow-Origin: *`，未见 Authorization 实际校验。settings 中的 allowedOrigins/maxConnections 在服务端未被使用。它虽仅监听本机地址，但本机高权限端点仍缺少明确的调用方隔离。

手写 MCP 处理器声明协议版本 2024-11-05，仅分派三个方法，所有工具结果均包装为文本，业务返回 success=false 时没有设置 MCP isError。未见初始化通知、ping 等分支；其 Codex 兼容性仍需实际客户端验收，不能据此直接断言不能连接。

本地版本有随机令牌及来源拒绝，但 editor_script 本身是高权限执行通道，不是沙箱。二者都需要将脚本执行视为受信任开发能力。

证据：[HTTP 入口:164](https://github.com/DaxianLee/cocos-mcp-server/blob/a5db895b3299dccd78979ca0268193e4b6ebf037/source/mcp-server.ts#L164)、[协议分派:250](https://github.com/DaxianLee/cocos-mcp-server/blob/a5db895b3299dccd78979ca0268193e4b6ebf037/source/mcp-server.ts#L250)。

## 授权是采用方案时的实际差别

当前仓库没有明确的 MIT/Apache 许可证文件；英文 README 的 License 段明确表示源码供学习和个人修改，禁止将项目代码或衍生代码用于商业用途或转售，商业授权需联系作者。

因此不能将“GitHub 源码可见”当成可以任意移植和商用的授权。若要在商业开发流程中使用或合并代码，应先向作者确认适用范围并取得相应授权。当前本地首版独立编写，本次分析未复制其实现代码。

证据：[README.EN.md:520](https://github.com/DaxianLee/cocos-mcp-server/blob/a5db895b3299dccd78979ca0268193e4b6ebf037/README.EN.md#L520)。

## 对当前需求的建议

保留本地已经通过实测的 SDK 接入、项目绑定、操作状态、真实日志和窗口控制，在此基础上按实际游戏开发任务独立补充专用工具。优先顺序可借鉴第三方的功能分类：

1. 预制体创建/实例化/应用/还原，以及按钮事件与脚本挂载。
2. 按名称和路径解析节点、批量属性修改、JSON 描述 UI 层级。
3. 真正启动预览和构建任务，返回任务 ID、进度与最终产物，而不只打开面板。
4. 场景视图、参考图、动画和材质的专用操作与回归用例。
5. 管理面板与工具筛选，在列表和实际执行层同步实施。

若选择试用第三方公开版，适合先在独立项目验证上述关键路径；若考虑 Pro，应把 3.8.8 + Codex 的连接、一次完整 UI 构建、预制体往返、错误回滚和自动构建产物列入实际验收，而不能用 README 的功能表代替运行结果。
