# 场景视图与参考图

0.7.0 开发预览；实测 Windows + Cocos Creator 3.8.8。参考 DaxianLee Cocos MCP Pro 公开的场景视图和参考图模块，使用两个紧凑语义操作覆盖原生高频能力，避免把多个低层工具同时加载到模型上下文。

## scene.view

action 可以是：

- inspect：一次读取 Gizmo 工具、Pivot、局部/世界坐标、2D/3D、网格、图标 Gizmo 和图标大小。
- configure：只修改填写的视口状态，应用后一次性读取原生状态；多字段失败会尝试恢复已修改字段。
- focus：按 UUID、路径或唯一名称解析项目节点并调用 Creator 相机聚焦；编辑器辅助节点会被拒绝。
- align-camera：将场景相机与当前视图对齐。
- align-node：将当前视图与当前选中节点对齐。
- reset：恢复位置 Gizmo、Pivot、局部坐标、3D、网格、3D 图标和图标大小 60。

这些设置属于 Creator 编辑器视口，不写入 .scene 内容。读取结果带 scope，不能把它当作游戏运行时相机或最终屏幕像素。focus 的节点解析是项目层级白名单，名称歧义会报错。align-node 依赖 Creator 当前选择，因此需要先用 selection 设置选择并回读。

示例：

~~~json
{
  "action": "configure",
  "tool": "rect",
  "pivot": "center",
  "coordinate": "global",
  "is2D": true,
  "grid": true,
  "icon3D": false,
  "iconSize": 30
}
~~~

## reference.image

action 可以是：

- inspect：返回当前场景参考图配置和当前图。
- add：添加一个或多个本机绝对路径图片，并读取 Creator 配置确认 missing:false。
- remove：删除指定路径；省略路径删除当前图。
- switch：切换已添加图片，可选传场景 UUID。
- configure：修改 x/y/sx/sy/opacity，其中透明度使用 Creator 实际的 0–100 数值。
- refresh：刷新显示。
- clear：清空当前参考图。

路径在进入 Creator 前会检查绝对路径、扩展名和 32 MiB 大小上限。支持 PNG/JPG/JPEG/GIF/WebP。参考图是编辑器外部文件，工具不会复制、导入或修改该文件，也不会把它当作项目资源依赖。每次写入都读取 query-current；回读不一致会报告错误并尝试恢复已应用字段。

## 面板与低 Token 使用

Creator 控制台的「场景视图与参考图」页使用同一桥接队列，提供视口状态读取、批量设置、聚焦、重置以及参考图添加/变换/清理。面板操作不会自动保存场景，因为视口状态不属于场景序列化内容。

推荐 AI 流程：

1. scene.view {action:"inspect"} 读取一次当前视口。
2. 需要修改时用一个 configure 请求提交多个字段，避免逐个调用。
3. 用 focus 定位项目节点，截图确认视口结果。
4. 设计稿对齐时 reference.image 先 add，再一次 configure，最后 inspect 或截图。
5. 任务结束调用 reference.image {action:"clear"}，避免后续截图被参考图干扰。

视口状态查询和参考图读取都已通过 Creator 原生消息回读。它们不会证明节点在游戏运行时可见，也不会证明参考图与运行时 Canvas 像素完全一致；最终画面仍需 editor.screenshot 或预览验证。

## 验证

~~~sh
npm run test:live:scene-view
~~~

复测覆盖视口批量设置、项目节点聚焦、参考图添加、缩放/透明度/位置、状态读取和清理，并在结束时恢复开始前的视口字段。自动单元测试覆盖路径限制、节点解析、原生回读和失败恢复。Pro 的内部实现、实际成功率和 Token 消耗没有可运行对照，因此本模块只声明公开能力覆盖和我们的调用压缩设计。
