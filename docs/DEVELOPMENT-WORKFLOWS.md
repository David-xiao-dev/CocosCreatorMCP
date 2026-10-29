# 0.3.0：脚本、引用、按钮与运行预览

状态：开发预览；已联调环境为 Windows + Creator 3.8.8 + MCP STDIO。保留 4 个常驻入口，能力目录增至 45 项；数量不代表完整编辑器覆盖率。

## 新增专用操作

| 操作 | 行为 |
| --- | --- |
| node.resolve | UUID、精确层级路径或唯一名称；重名返回候选，辅助节点不属于项目查询范围 |
| component.properties | 按字段返回简洁值、类型、枚举；减少完整 inspector dump 的传输 |
| component.patch | 按真实 inspector 元数据转换普通值；预校验、引用类型检查、dryRun、回读；一个撤销组，失败尽力恢复旧属性 |
| script.status | 组件类注册、脚本来源 UUID 和公开方法；不是完整 TS 类型检查 |
| script.attach | 等待注册和可选 requiredMethods、验证脚本来源、原生挂载；重复调用复用现有组件 |
| button.events | replace/append/remove/clear；检查目标组件和方法；相同 append 不重复绑定 |
| preview.open | 创建/重用沙箱 Electron Web 预览；只加载本工程本机预览服务，要求先保存场景 |
| preview.status | 页面/Canvas 尺寸、有限浏览器日志、可选样例测试证据；页面加载不等于游戏工作正常 |
| preview.close | 仅关闭 MCP 创建的预览，不能误关编辑器主窗口 |

面板右上角提供「运行预览」。预览窗口可以使用已有 editor.screenshot/editor.input 截图和真实点击。扩展重载会关闭它创建的预览窗口。

## 简洁属性和引用

先用 cocos_catalog 读取所需操作的准确 schema。下面是 cocos_execute 的单个步骤示例：

```json
{
  "id": "bind",
  "op": "component.patch",
  "params": {
    "node": "Canvas/InteractiveDemo",
    "component": "McpInteractiveDemo",
    "properties": {
      "statusLabel": {"$component": {"node": "Canvas/InteractiveDemo/Status", "type": "cc.Label"}},
      "settingsPanel": {"$node": "Canvas/InteractiveDemo/SettingsPanel"},
      "actionButtons": [{"$node": "Canvas/InteractiveDemo/PlayButton"}]
    },
    "dryRun": true
  }
}
```

引用形式：`{$node:路径}`、`{$component:{node:路径,type:类型或组件UUID}}`、`{$asset:资源URL或UUID}`、`{uuid:UUID}`；`null` 清空引用。资源必须能加载为目标属性所要求的类型。支持有类型元数据的数组和嵌套结构；限制最多 40 个顶层属性、数组最多 200 项。Button.clickEvents 通过专用 button.events 修改。

属性设置使用公开顶层字段；复杂不支持的类型仍需查看实际 dump，不能假定所有自定义 inspector 都兼容。遇到同类型多个组件，用组件 UUID 指定。

## 脚本挂载

1. 通过 asset.write 写入项目 TypeScript 文件。
2. script.attach 提供 node、className、asset，可选 requiredMethods；超时上限 25 秒。
3. component.patch 绑定属性。
4. button.events 绑定事件。
5. 读取属性、保存重开、运行预览并实际点击。

注册与来源检查避免挂错脚本，但不证明最新版源文件已经完整热重载，更不等同 tsc 全量类型检查。修改现有类时，requiredMethods 可避免在新方法尚未出现时继续；已有同名方法的逻辑变化仍需运行验证。超时查看 editor.logs，不盲目重写/重新创建。

```json
{
  "id": "event",
  "op": "button.events",
  "params": {
    "node": "Canvas/InteractiveDemo/PlayButton",
    "mode": "replace",
    "events": [{"target": "Canvas/InteractiveDemo", "component": "McpInteractiveDemo", "handler": "onPlay"}]
  }
}
```

replace 精确设置整个列表；append 跳过完全相同的事件；remove 使用零基 index；clear 清空。相同回调不同 customEventData 是不同事件。检查方法存在不能证明其业务逻辑正确。

## 独立交互示例

在保存好的测试项目中运行：

```sh
npm run demo:interactive
npm run test:live:runtime
npm run test:live:development
```

其他测试工程可加 `-- --project /absolute/project`。生成器默认在仓库 test-project 中创建 `assets/MCP_InteractiveDemo.scene` 和 `assets/McpInteractiveDemo.ts`，保留原 main.scene。

示例包含主菜单、设置页、6 格背包、返回按钮和计分逻辑。脚本/引用/事件全部通过真实 MCP SDK 调用配置；脚本有窗口适配，UI 树增加 active 字段来创建默认隐藏面板。样例资源独立提供在 examples/interactive-demo 中。

生成器不覆盖已有场景/脚本。中途失败保留当前场景和 JSON 报告；打开相同示例场景后可用 `--resume` 继续配置，不重复生成树。`--update-script` 只用于明确更新本示例自己的脚本，不能对用户同名脚本盲目使用。

```sh
npm run demo:interactive -- --resume
```

运行回归使用真实鼠标按下/抬起，经 Button 组件和绑定事件触发业务，不直接调用脚本方法。样例只在 URL 显式包含 mcp-test=1 时启用可见 DOM 证据及按钮中心坐标，供断言与定位；它不代表 MCP 已能读取任意游戏的所有内部状态。回归检查两种窗口宽度、重复点击不重复计数、设置/背包/返回、运行日志和预览关闭边界。

## 恢复与支持边界

- component.patch 在动手前校验所有字段和引用；成功后回读，数值允许小量浮点误差。相同值跳过，不建立空撤销组。
- 原生修改失败时，恢复本次尝试的旧属性并回读；错误里区分恢复成功与 INCOMPLETE。不是资产/场景混合事务，也不覆盖任意自定义 setter 的副作用。
- 更改中若组件 UUID/顺序不一致则停止，避免写错组件。通用脚本仍是完整本机权限出口，高级开关不是沙箱。
- 此版本仍无完整 prefab 生命周期、动画/Spine、自动构建产物验证和跨系统编辑器验收。

## 本地发行

```sh
npm run release:local
```

需要系统 tar。输出 artifacts/releases 的 source.tar.gz、SHA-256 和文件清单；显式包含 package-lock、源码、样例、测试与文档，排除测试项目、依赖目录、本机连接信息及第三方参考代码。解压后进入 package 目录，运行 npm ci，再按 README 安装到目标项目。该命令只生成本地包，不发布 npm/GitHub。
