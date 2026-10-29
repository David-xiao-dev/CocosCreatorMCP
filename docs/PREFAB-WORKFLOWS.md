# 预制体工作流（0.4.0 开发预览）

目标：Windows + Creator 3.8.8。通过安装版本的原生 Scene/AssetDB 接口独立实现；部分原生接口为私有消息，其他 Creator 版本尚未验收。

## 常用操作

默认仍用 `cocos_catalog` 按需查询参数，通过 `cocos_execute` 执行；只读操作也可用 `cocos_observe`。共新增 11 项操作，服务默认仍为 4 个工具。

| 操作 | 用途与保存行为 |
| --- | --- |
| `prefab.inspect` | 节点/实例根、双向外部节点引用、脚本/资源依赖、资源 revision |
| `prefab.validate` | 检查资源序列化对象索引、AssetDB 依赖、注册类型；返回 revision |
| `prefab.create` | 原生创建并链接；拒绝覆盖、已有预制体成员及外部双向引用；支持 dryRun |
| `prefab.instantiate` | 原生实例化并链接；验证真实实例根，失败移除本次新增节点 |
| `prefab.apply` | 实例根修改应用到共享资源；版本核对、备份、持久化回读，支持 dryRun |
| `prefab.revert` | 从资源还原实例覆盖；不修改共享资源 |
| `prefab.unlink` | 解除实例链接，recursive=false 保留嵌套预制体链接，true 同时解除 |
| `prefab.open` | 进入原生预制体编辑；返回真实内容 root、revision、returnAsset |
| `prefab.save` | 保存当前预制体编辑；版本核对、备份及序列化回读 |
| `prefab.close` | 返回显式 returnAsset；拒绝未保存编辑 |
| `prefab.restore` | 通过 AssetDB 恢复指定备份；核对内容/资源身份，保存恢复前备份 |

create、instantiate、apply、revert、unlink 不自动保存场景；明确检查之后调用 `scene.save`。进入预制体编辑后使用 `prefab.save`，以获得版本检查和备份。通用 `scene.save`/`editor.request` 仍能调用原生接口，但不附带这些专用保障。

## 创建并复用

1. `prefab.inspect {node:"Canvas/InventoryPanel"}`，确认 outgoing `external` 与 `incoming` 双向引用。
2. `prefab.create {node:"Canvas/InventoryPanel",url:"db://assets/InventoryPanel.prefab",dryRun:true}`。
3. 显式清理跨子树引用后执行创建。**Creator 会将源子树替换成新实例并重命名为资源文件名**：之后使用结果 `node`，重新解析子节点；不要继续使用旧 UUID。
4. `prefab.instantiate {asset:"db://assets/InventoryPanel.prefab",parent:"Canvas",name:"InventoryCopy"}`。
5. 检查脚本、事件、贴图、布局及实际运行，最后保存、切换场景并重开确认。

原生 create-node 在 3.8.8 中返回未链接内容，本模块额外调用原生 link-prefab 后再核对实例根。不能以“出现了相同节点”作为正确链接的证据。创建前拒绝外部双向 Node/Component 引用，以免替换 UUID 时丢失场景引用；这是保守策略，需要开发者明确重新绑定。

## 应用与编辑

修改实例属性后，先 inspect/validate 获得当前资源的 64 位 SHA256 `revision`；将它作为 `expectedRevision` 传给 apply。其他客户端、人工编辑或 Creator 自己的序列化可能改变资源，旧版本会被拒绝。检查冲突后再读取最新版本，不要无条件吞掉冲突重试。

进入编辑用 `prefab.open`，保存返回的 root、revision、returnAsset。Creator 的隐藏 Canvas 包装层不是预制体内容；使用返回的 root UUID 配合普通 `component.patch`、`button.events`、节点工具。修改完成后 `prefab.save {expectedRevision:...}`，然后 `prefab.close {returnAsset:...}`。专用接口拒绝把隐藏包装层当作内容根，进入/离开会拒绝未保存内容。

3.8.8 的 apply-prefab 可能返回 false，但资源实际上已写入。因此工具结合持久化 revision 与序列化回读判断，并返回 nativeResult；这不等于逐字段完全相等证明。若未确认资源变化，会保留备份并报告不确定状态（也可能是没有覆盖），不自动重试写操作。请读取修改字段或创建新实例确认。

## 备份与恢复

apply/save/restore 写共享资源前，将原内容和资源 UUID/URL/哈希记录保存在项目 `local/cocos-mcp/prefab-backups/`，结果返回 backupId/backupPath。备份不进入源码发行包，也不会自动清理。

恢复先保存当前编辑，再 validate 获得最新 revision，调用 `prefab.restore {asset,backupId,expectedRevision}`。支持 dryRun。恢复会核对备份内容哈希及原资源身份，通过 AssetDB 写回以保留 `.meta`，同时为当前内容另留备份；之后重新打开场景/预制体确认实例同步。资源移动、重新生成 UUID 或备份损坏会拒绝恢复。

备份只覆盖该预制体源文件，**不是整个场景/项目事务**，不恢复场景里的临时覆盖或其他关联资源。失败不会擅自丢弃当前场景。连续人工编辑与文件写入无法形成跨进程原子锁；版本检查属于尽力冲突检测。

## 已验证与限制

`npm run test:live:prefab` 在独立临时场景创建唯一资源，只清理本次资源并返回原场景。要求先保存当前内容。脚本、Node/Component 引用、Node[]、SpriteFrame、Button clickEvents、嵌套预制体在创建/实例化/保存重开/应用/还原/编辑后检查；解除链接、原生撤销和备份恢复也有验收。自动测试另覆盖坏索引、路径、版本冲突、备份篡改及不确定原生返回。

验证器只验证直接序列化索引、可查询资源身份和当前注册类，不递归导入依赖闭包、不证明最新脚本编译、不验证每个属性或运行画面。引用扫描限 5000 节点、100000 字段；深度超界会拒绝。资源检查限 8 MiB/50000 对象。变体/复杂多层嵌套覆盖、资源移动/删除恢复、丢失脚本修复及跨平台仍需额外验收。没有宣称完整覆盖 Pro 或 100% 编辑器能力。

控制面板新增「预制体」：选中节点检查、预检查创建、创建并选择新实例、验证资源、进入编辑、备份保存和返回。应用/还原/解除链接及备份恢复目前通过 AI 工具操作，避免界面隐藏共享资源影响。
