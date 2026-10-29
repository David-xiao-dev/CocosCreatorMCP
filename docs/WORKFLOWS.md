# AI 开发工作流

本文示例使用旧单工具名称，需要 `--tools legacy`。0.2.0 默认精简模式请按 [精简 MCP 使用方式](COMPACT-TOOLS.md) 通过目录发现相应 action，再使用 `cocos_execute` 或 `cocos_observe` 调用。

## 开始任务

1. `editor_status` 确认版本和项目路径。
2. `editor_request` 调用 `asset-db/query-ready`、`scene/query-is-ready`，确认首次导入已结束。
3. `scene_tree`、`editor_selection` 和 `editor_logs` 获取当前状态。
4. 先查已有节点和资源，再实施修改；完成后重新查询属性、检查新错误，最后按任务要求保存。

切换场景前检查未保存内容。`scene_open` 会拒绝直接覆盖当前脏场景。

## 修改节点和组件

创建空节点：

```json
{"name":"Player"}
```

`node_create` 返回 UUID；不提供 parent 时明确挂到场景根节点。

先 `node_inspect` 读取实际属性 dump，再向 `property_set` 传入正确类型和值。例如：

```json
{"uuid":"节点UUID","path":"position","dump":{"type":"cc.Vec3","value":{"x":1,"y":2,"z":3}}}
```

添加 `cc.UITransform` 后，从节点 dump 的 `__comps__` 找到组件 UUID，再使用该组件 UUID 和相对属性路径：

```json
{"uuid":"组件UUID","path":"contentSize","dump":{"type":"cc.Size","value":{"width":320,"height":180}}}
```

服务会转换成 Creator 所需的所属节点和 `__comps__.N.contentSize` 路径，并建立独立撤销记录。

撤销/重做由 `editor_request` 调用 `scene/undo` 或 `scene/redo`，之后重新检查目标状态。

## 创建脚本和引用资源

通过 `asset_write` 在 `db://assets/...` 创建 TypeScript 文件，保留 AssetDB 导入和 meta 生成流程。已有文件使用 `mode=save`，避免意外覆盖。

等候编译后检查 `editor_logs`；类名和组件注册完成后，再由 `component_add` 挂载。绑定资源时，从 `asset_query` 或 AssetDB 的 `query-uuid` 获取 UUID，读取对应组件的 dump 类型，再用 `property_set` 写入 `{uuid: "资源UUID"}` 等真实需要的数据结构。

二进制导入、资源移动、重命名和删除，先用 `editor_messages` 查询 `asset-db` 对应消息的参数和示例，再调用 `editor_request`。不要直接改写 `.meta` 或 `library`。

## 高级功能

1. `editor_messages` 指定 package/filter，例如 `package=scene, filter=material`。
2. 如果消息文档不足，调用 `editor_api` 搜索类型，再按行号读取上下文。
3. 使用 `editor_request` 传递实际参数；选择 request 等待结果，只有对方不提供回复的交互才用 send。
4. 在消息接口不足时使用 `editor_script`，明确主进程或场景进程，并只返回普通 JSON。

场景脚本示例：

```js
const scene = cc.director.getScene();
return { name: scene.name, children: scene.children.map(n => ({uuid:n.uuid, name:n.name})) };
```

脚本直接改变引擎对象可能绕过编辑器撤销和脏状态，应优先通过原生消息编辑。主进程和场景进程的对象不能互相直接传递。

## 界面操作

1. 用 `editor_windows` 找到实际编辑器窗口；必要时调用 `editor_window` 的 focus。
2. 截图观察当前界面。若返回缩放截图，坐标换算为：`x_DIP = x_image × contentBounds.width / imageSize.width`，y 同理；不要加桌面偏移 x/y。
3. 单击由 mouseDown 和 mouseUp 组成，二者坐标相同，button 为 left、clickCount 为 1。
4. `text` 可输入 Unicode；快捷键通过 keyDown / keyUp 和 modifiers 实现。
5. 输入完成后重新截图，或读取对应原生状态确认效果。

主菜单优先用 `editor_menu` 列出当前菜单并按其 numeric path 调用，无需猜测语言或屏幕位置。菜单、坐标和布局都可能变化，不能在未观察当前状态时复用旧位置。

## 超时与恢复

超时错误返回 requestId。先查询 `editor_operation_status`：

- queued/running：原调用可能还会完成，不要重试写操作。
- completed：重新读取场景或资源确认最终结果；历史状态不保留大型原始返回值。
- failed：查看错误、事件和日志，检查是否发生部分修改。

本服务不提供多步事务回滚；编辑器原生撤销是否可用取决于具体操作。重启扩展会丢失状态历史，必须先检查场景和磁盘实际情况。

