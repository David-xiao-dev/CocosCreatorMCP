# 精简 MCP 使用方式

默认仅暴露 `cocos_status`、`cocos_catalog`、`cocos_execute`、`cocos_observe`。原来的单工具模式使用 `--tools legacy`。

1. `cocos_status` 核对 Creator 版本、目标项目和控制开关。
2. `cocos_catalog` 搜索领域或操作；传 `op` 或 `ops:["asset.graph","animation.inspect","build.start"]` 一次获取最多 12 项准确 JSON Schema。不要同时传 op/ops。
3. `cocos_observe` 调用只读操作；写操作必须走 `cocos_execute`。
4. 编辑后读取状态，布局任务截图，最后显式保存。

例如先查询 `node.create`、`node.inspect` 和 `property.set` 的 schema，然后批量创建并修改节点：

```json
{
  "steps": [
    { "id": "create", "op": "node.create", "params": { "name": "Player" }, "output": "none" },
    { "id": "rename", "op": "property.set", "params": {
      "uuid": { "$ref": "create#" }, "path": "name",
      "dump": { "type": "String", "value": "PlayerReady" }
    } },
    { "id": "check", "op": "node.inspect", "params": { "uuid": { "$ref": "create#" } }, "fields": ["/name/value"] }
  ],
  "dryRun": false
}
```

`{$ref:"stepId#"}` 引用完整结果，`{$ref:"stepId#/path"}` 使用 JSON Pointer 访问结果字段。只能引用前面的步骤；即使该步骤 output=none，内部仍保留其完整结果供后续引用。真实调用时不要把“可能的返回结构”当成已知，先查工具说明或读取结果。

批量是编辑器队列中的一个请求，其他批量不会插入其中。所有步骤的固定参数及引用方向先预检查；引用解析后的类型在各步骤执行前再检查。人工界面操作仍可能改变状态，因此这不是编辑器锁，也不是事务。

失败返回 `failed`、已完成 `steps` 和 `skipped`，前面修改仍保留。`dryRun` 只检查计划参数，不能证明资源存在、场景可修改或未来引用值一定正确。不要用“再跑一次整个批量”修复部分失败。

结果默认 summary；`output=full` 获取原始结果；`fields` 只返回指定 JSON Pointer；`output=none` 不返回数据。错误投影会返回 outputWarning 和摘要，仍明确说明操作已完成，避免误重放。

截图使用 `cocos_observe` 的 `editor.screenshot`，会返回真正的 MCP 图像内容；不允许将截图塞入批量 JSON。检查器 dump 若摘要省略了关键属性，应按需 fields/detail=full 获取，不能猜测属性类型。

`scene.snapshot` 仅在扩展内存保留最多 8 份结构/变换/部分 UI 属性，`scene.diff` 比较差异；这些不是完整序列化或备份。`scene.validate` 当前只检查重复同级名称和零 UI 尺寸。
