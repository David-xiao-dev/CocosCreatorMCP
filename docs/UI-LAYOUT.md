# UI 自适应布局

0.8.0 在 `ui.build` 的 JSON 层级生成之外，增加了一个紧凑的 `ui.layout` 操作，用于配置 Creator 3.8.8 的常用 UI 自适应组件。一次调用只带目标节点、组件和语义属性，适合让 Codex 先预检查再批量应用，避免模型重复读取低层检查器 dump。

支持的组件和主要字段如下：

| 组件 | 语义字段 |
| --- | --- |
| `widget` | `alignTop`、`alignBottom`、`alignLeft`、`alignRight`、`alignHorizontalCenter`、`alignVerticalCenter`、`top`、`bottom`、`left`、`right`、`horizontalCenter`、`verticalCenter`、`absolute*`、`alignMode`、`target` |
| `layout` | `type`（`NONE`/`HORIZONTAL`/`VERTICAL`/`GRID`）、`resizeMode`、`cellSize`、`startAxis`、四向 padding、`spacingX/Y`、排列方向、`constraint`、`constraintNum`、`alignHorizontal/Vertical` |
| `scrollView` | `content`、`horizontal`、`vertical`、`inertia`、`elastic`、`brake`、`bounceDuration`、`cancelInnerEvents` |
| `mask` | `type`、`inverted`、`segments`、`alphaThreshold` |
| `safeArea` | `symmetric` |
| `blockInputEvents` | `enabled` |

`ensure` 会在目标节点缺少组件时通过 Creator 原生 `component.add` 补齐；`configure` 默认也会补齐，传 `ensure:false` 可改成缺失即报错。`target` 和 `content` 可以填写 UUID、项目层级路径或 `{$node: ...}`，由统一节点解析器检查歧义和编辑器辅助节点。枚举名称由已安装组件的检查器 `enumList` 转换为 Creator 内部值，修改后再次读取组件 dump 验证；失败时沿用组件属性工作流的恢复策略。`remove` 会检查组件已经消失。

示例：

```json
{
  "action": "ensure",
  "node": "Canvas/MainMenu/Panel",
  "component": "layout",
  "properties": {
    "type": "VERTICAL",
    "resizeMode": "CHILDREN",
    "paddingLeft": 24,
    "paddingRight": 24,
    "spacingY": 12
  }
}
```

滚动列表通常先用 `ui.build` 创建 Viewport、Content 和列表项，再用一次 `ui.layout` 将 ScrollView 的 `content` 指向 Content，并给 Content 配置 `layout`。这项操作不会替项目创建业务数据、复用池、滚动条贴图或按钮事件；这些对象仍应由模板/脚本或后续专用工作流提供。组件修改不会自动保存，保存仍是显式的 `scene.save`。

Windows + Creator 3.8.8 的实时检查覆盖 Widget 锚点、Layout 纵向/子节点自适应、ScrollView 内容引用、Mask/SafeArea/BlockInputEvents 补齐、dryRun 和删除清理。该验证证明编辑器状态和序列化入口可用，不等于所有设备比例、SafeArea 组合或最终屏幕像素都已视觉验收；跨分辨率视觉回归仍在路线图中。
