# 字体、文字与 UI 测量

0.6.0 开发预览；实测 Windows + Creator 3.8.8。新增五项专用操作，目录共 87 项，默认仍只有四个 MCP 入口。完整编辑器覆盖、Pro 同任务领先和跨平台效果不是本版的验收结论。

## 操作与支持

| 操作 | 支持 | 范围 |
| --- | --- | --- |
| `font.inspect` | 引擎加载 imported Font、TTF/bitmap 类型、位图字库 glyph/纹理/缺字样本 | URL 或 UUID；缺字列表最多 100，另返总数/截断标志；TTF 和系统字体的字形覆盖未知 |
| `text.inspect` | 当前 Label/RichText、字体绑定、预览文本、字号、实际缩小字号、排版参数 | 不强制更新 renderData；默认文本最多 160 字符，`includeText` 才返回全文 |
| `text.configure` | 已有 Label/RichText 的文字、字体、字号/行高/颜色/对齐 | 复用原生属性补丁：预检查、一个撤销组、逐字段回读与失败恢复；不自动添加组件或保存 |
| `ui.measure` | 自身 UITransform 四角/AABB、最近 Canvas、Camera/layer、文字观察值 | 默认 compact 去重 Canvas、省略四角/祖先/完整字体信息；`detail:full` 按需获取 |
| `ui.validate` | 具证据的有限规则扫描、明确范围/预算、可选 Button 矩形重叠提示 | 不自动修改布局；节点/问题/配对预算耗尽时不声称完整 |

| 字体/组件 | 本版验证 | 限制 |
| --- | --- | --- |
| 系统字体 + Label | 中英文、字体家族、颜色/对齐、CLAMP/SHRINK/换行 | 字体安装与 fallback 随机器而异；不是国际化系统或复杂文字排版认证 |
| TTF + Label | 导入、绑定、保存重开、实际预览 | 字体必须具有用户自己的使用授权；不将本机系统字体打入源码包 |
| BitmapFont + Label | 原创 FNT/PNG、纹理解析、字形检查、显示与缺字诊断 | 不包含所有外部 FNT 导出工具/多页字体矩阵 |
| TTF / 系统字体 + RichText | 标签颜色/粗斜体、字号/行高、maxWidth、持久化与实际显示 | BitmapFont 在写入前拒绝；局部样式用 markup，Label 的 overflow/wrap/bold 等参数不适用 |

## 让 AI 使用

先获取 schemas：

```json
{"ops":["font.inspect","text.inspect","text.configure","ui.measure","ui.validate"]}
```

分别通过 `cocos_execute` 执行以下单步配置的 dryRun 和实际应用；`cocos_observe` 用于随后读取。完整外层调用格式见 [精简工具](COMPACT-TOOLS.md)。

```json
{"node":"Canvas/Title","component":"cc.Label","text":"开始游戏","font":{"system":"Microsoft YaHei"},"fontSize":32,"horizontalAlign":"CENTER","overflow":"SHRINK","wrap":false,"dryRun":true}
```

资源字体改为 `"font":{"asset":"db://assets/MyFont.ttf"}`。省略的字段不修改；显式 `"text":""` 会清空文字。枚举名称经本机检查器元数据转换，不硬编码 Creator 数字值。目标支持 UUID/路径/唯一名称，有歧义时拒绝。

Label 使用 `component.patch` 修改 `cc.UITransform.contentSize`。`NONE` 会按文本修改尺寸，`RESIZE_HEIGHT` 接管高度；先在 CLAMP 下设置固定宽度，再启用 RESIZE_HEIGHT，避免同时强行指定派生高度。配置成功后检查 `text.inspect`、`ui.measure`、运行截图，再显式 `scene.save`。

## 诊断规则与误报边界

| 规则 | 意义 |
| --- | --- |
| `ui.projection-limit` | 倾斜 UI/透视投影超出当前平面矩形诊断能力，信息提示 |
| `ui.zero-size` | UI 宽或高非正值 |
| `ui.no-canvas` | 缺少项目 Canvas 祖先 |
| `ui.camera-layer` | 可渲染组件的 Canvas/相机未激活或相机不覆盖其 layer |
| `ui.outside-canvas` | Canvas 本地矩形越界，附 Mask 祖先；滚动/刻意离屏可能合法 |
| `text.missing-font` | 不使用系统字体却没有观察到字体引用 |
| `text.small-render-size` | 引擎实际字号小于阈值，默认 12 |
| `text.missing-bitmap-glyphs` | 位图字库中不存在指定 codepoint |
| `ui.potential-button-overlap` | 可选的同 Canvas Button AABB 交叠，排除父子，最多检查 10,000 对；仅为信息 |

只测项目层级，不包含 Creator 辅助 Canvas 和 RichText 自动生成的子节点。四角先转换至世界坐标，再转换到最近 Canvas 本地坐标，包含 anchor/旋转/缩放。它们不是屏幕像素、字体墨迹边缘、实际遮挡或点击命中证明；诊断无问题也不保证视觉正确。`completeWithinScope` 只表示上述有限规则在本次预算中跑完。

面板「文字与布局」提供读取、子树测量/诊断、文字/字号/字体的配置预检查与应用。留空目标可使用单个选中节点；诊断结果可选中问题节点。所有操作走同一桥接队列和控制开关，选中问题节点会替换旧选择。

## 验证与复测

在独立 test-project 保存当前场景后运行：

```sh
npm run demo:typography
# 已创建过：先打开并保存 MCP_TypographyDemo，再运行：
node scripts/create-typography-demo.mjs --resume
npm run test:live:typography
npm run test:live:typography:panel
```

样例不会覆盖已有场景。Windows 默认从本机导入 Arial；其他系统可用 `--font /path/to/YourFont.ttf`，不提供则跳过 TTF 导入；中文系统字体仍需本机安装。源码包仅带按本项目 [LICENSE](../LICENSE) 提供的原创位图生成器及其示例图形，不含本机 TTF、test-project、截图或连接信息。

实测：样例生成与保存重开三组、原生/运行检查五组、面板真实输入三组通过；自动测试共 45 项。面板检查包含预检查不写入、字号应用与恢复、缺字诊断与精确选择。几何包含 anchor (0,0)、90° 旋转、非均匀缩放；不是所有 UI 组合的数学验证。

同一九节点样例，compact/full 几何相等；返回 JSON 从 11,999 降为 4,091 字节，减少 65.9%。这是 UTF-8 JSON 体积，不是模型 Token、端到端耗时或 Pro 对比。

本地证据：`artifacts/typography-demo.json`、`live-typography-check.json`、`live-typography-panel-check.json`、`typography-measure-benchmark.json`、`typography-runtime.png`、`typography-panel-verified.png`。这些生成文件不随源码分发。
