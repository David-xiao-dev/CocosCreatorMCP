# 安装与使用（Windows + Creator 3.8.8）

本教程面向首次使用的用户。维护者发布源码和 Release 的流程见 [GitHub 发布指南](GITHUB-RELEASE.md)。当前是 **0.8.0 开发预览**：可以先公开源码并收集反馈，已验证范围和待完成项见 [COVERAGE](COVERAGE.md) 与 [ROADMAP](ROADMAP.md)。

**使用范围：个人学习和非商业使用免费；商业游戏、公司/组织或客户项目、收费服务，以及再分发须事先书面授权。** 许可正文见 [LICENSE](../LICENSE)，申请方式与边界见 [许可说明](LICENSING.md)，联系 [17268680050@163.com](mailto:17268680050@163.com)。没有激活码不等于允许未经授权的商业使用。

## 1. 需要安装什么

| 环境 | 要求 | 用途 |
| --- | --- | --- |
| Windows | 已验证 Windows 本机 Creator 联调；建议 Windows 10/11 64 位 | 运行编辑器与客户端 |
| Cocos Dashboard + Creator | 优先使用 **Creator 3.8.8**；Dashboard 本身不包含编辑器 | 打开游戏项目、运行桥接扩展 |
| Node.js | **22.x** 为当前测试基线；package 允许 >=22 | 运行 MCP 服务与安装脚本 |
| npm | 使用 Node.js 附带版本 | 安装锁定的 MCP SDK 和 Zod 依赖 |
| Codex Desktop | 已安装、可以正常使用模型服务 | AI 客户端；也可自行连接其他 STDIO MCP 客户端 |
| Git | 只有选择 clone 源码或参与开发时需要 | 获取源码、提交与更新 |

桥接本身不需要 API Key、厂商账号或激活码。Creator 的账号要求与 Codex 的登录/模型访问由相应产品管理。源码没有附带 Creator、引擎、Node.js 或模型服务。

下载入口：[Node.js 官方下载](https://nodejs.org/en/download)、[Git for Windows](https://git-scm.com/downloads/win)、[Cocos Dashboard](https://www.cocos.com/creator-download)、[Codex 官方文档](https://developers.openai.com/codex/app)。请通过官方入口选择与你的系统匹配的安装包。

### 检查 Node 与 npm

安装 Node.js 22 后，重新打开 PowerShell：

```powershell
node --version
npm.cmd --version
where.exe node
```

预期 Node 显示 `v22.x.x`。Windows 教程使用 `npm.cmd`，可避开 PowerShell 将 `npm` 解析为受执行策略限制的 `npm.ps1`，不需要修改系统执行策略。

若使用 Node 便携版，不必配置系统 PATH，直接使用绝对路径：

```powershell
& 'D:\Tools\node-v22.12.0-win-x64\node.exe' --version
& 'D:\Tools\node-v22.12.0-win-x64\node.exe' 'D:\Tools\node-v22.12.0-win-x64\node_modules\npm\bin\npm-cli.js' ci --ignore-scripts
```

第二条命令需要在下面第 2 步得到的 MCP 源码目录执行。后续命令中的 `node` 也可替换为对应的 `& '绝对路径\node.exe'`。

## 2. 获取完整 MCP 源码

推荐普通用户下载 GitHub **Releases** 中的 `cocos-creator-mcp-0.8.0-source.zip`。解压到固定目录，例如 `D:\Tools\CocosCreatorMCP`。包中顶层有 `package/`，真正的工作目录是包含 `package.json`、`src/`、`extension/`、`scripts/` 的这一层：

```text
D:\Tools\CocosCreatorMCP\package\
  package.json
  package-lock.json
  src\server.mjs
  extension\package.json
  scripts\cli.mjs
```

进入该目录安装依赖：

```powershell
Set-Location 'D:\Tools\CocosCreatorMCP\package'
npm.cmd ci --ignore-scripts
node scripts/cli.mjs --help
```

`npm ci` 使用 lockfile，避免每个人安装不同依赖版本。这里不需要 TypeScript 编译、Python、Visual Studio Build Tools 或单独安装 MCP SDK。联网主要用于首次安装依赖；后续本机桥接无需厂商云服务。

也可以使用 Git 克隆。将下面的 `YOUR_ACCOUNT` 和仓库名换成实际地址：

```powershell
git clone https://github.com/YOUR_ACCOUNT/CocosCreatorMCP.git
Set-Location CocosCreatorMCP
npm.cmd ci --ignore-scripts
```

GitHub 自动生成的 Source code ZIP 也是源码快照，但本文的文件名、SHA 校验和安装验证对应维护者上传的 `*-source.zip` / `*-source.tar.gz`。

### 三种下载包的区别

| 文件 | 适合谁 | 是否完整 |
| --- | --- | --- |
| `*-source.zip` | Windows 用户、开发者 | 完整源码；仍需 `npm ci` |
| `*-source.tar.gz` | 使用 tar 的用户、自动化环境 | 与 source ZIP 同一套文件；仍需 `npm ci` |
| `*-extension.zip` | 已有 MCP 服务、需要手动部署桥接的用户 | **只有 Creator 侧扩展**，不是完整 MCP，不包含 Node 依赖 |

不要仅安装 extension ZIP 就认为 Codex 可以连接。MCP 服务运行于 Node，Creator 扩展只是它连接编辑器的桥梁。

### 校验下载文件

把 `SHA256SUMS.txt` 与下载包放在同一目录：

```powershell
Get-FileHash '.\cocos-creator-mcp-0.8.0-source.zip' -Algorithm SHA256
Get-Content '.\SHA256SUMS.txt'
```

对照同名文件的哈希值，大小写不影响比较。版本升级后文件名中的版本号也要同步替换。

## 3. 准备 Creator 项目

在 Dashboard 中安装 **3.8.8 编辑器**，并用该版本创建或打开一个项目。首次建议使用独立测试项目。等待资源导入完成，打开一个已保存的场景，再继续安装。

项目路径应指向包含 `assets/`、`settings/`、`package.json` 的工程根目录，例如：

```text
D:\Games\MyGame\
  assets\
  settings\
  package.json
```

不要填 `assets` 子目录、Creator 安装目录或 Dashboard 目录。安装器会检查项目 `package.json` 的 `creator.version` 是否为 3.8.x；完整联调目前只承诺文档中实际测试的 3.8.8。

## 4. 安装桥接扩展

先保存并关闭目标项目的 Creator 窗口，在 MCP 源码目录执行：

```powershell
node scripts/cli.mjs install --project 'D:\Games\MyGame'
```

安装器会：

1. 将 `extension/` 复制到工程的 `extensions/cocos-codex-bridge/`，并附带 LICENSE 和 docs/LICENSING.md。
2. 写入仅供本机使用的 `installation.json`，记录当前 Node 与 MCP 服务的绝对路径。
3. 创建工程级 `.codex/config.toml`。若已有不同配置，会保留原文件，另写 `.codex/cocos-mcp.example.toml` 供手动合并。

重新用 Creator 3.8.8 打开项目，在扩展管理器中确认 `cocos-codex-bridge` 启用。菜单入口是 **扩展 → Cocos MCP → 控制台**。中文/英文菜单名称会随编辑器语言略有变化。

控制台应显示实际工程路径、Creator 版本和「桥接已就绪」。如果菜单没有出现，检查目录是否是下面这一层，避免双重嵌套：

```text
MyGame/extensions/cocos-codex-bridge/package.json
```

### 手动安装 extension ZIP（可选）

1. 完成第 2 步的完整源码和 `npm ci` 安装。
2. 关闭目标项目的 Creator。
3. 将 extension ZIP 中的整个 `cocos-codex-bridge/` 放到目标项目 `extensions/`。
4. 仍推荐运行上述 `install --project ...`，补齐机器路径与客户端配置。

这是普通文件夹扩展包，不是 Cocos Store 安装器，不承诺扩展管理器能够直接把这个 ZIP 作为商店插件导入。

## 5. 在 Codex 中配置 MCP

优先使用控制台 **连接与设置 → 复制 Codex TOML**。也可读取安装器生成的 `.codex/config.toml`。例如，使用固定 Node 路径的配置如下；请替换成你自己的路径：

```toml
[mcp_servers.cocos_creator]
command = "C:/Program Files/nodejs/node.exe"
args = ["D:/Tools/CocosCreatorMCP/package/src/server.mjs", "--project", "D:/Games/MyGame"]
startup_timeout_sec = 15
tool_timeout_sec = 90
```

Windows TOML 示例使用 `/`，避免反斜杠转义错误。安装器生成的双反斜杠字符串同样有效。`--project` 固定决定所连接的工程；打开其他 Creator 工程不会自动切换它。

选择一种配置范围即可：

- **工程级**：在 Codex 中打开 `D:\Games\MyGame`，使用工程 `.codex/config.toml`。客户端需信任这个工程才能加载其本地配置。
- **用户级**：通过 Codex 设置中的 MCP 入口打开配置，将这段合并到用户配置。默认文件位于 Windows 用户目录的 `.codex/config.toml`；如果设置过 `CODEX_HOME`，以客户端实际配置位置为准。

不要在同一生效配置中重复定义 `[mcp_servers.cocos_creator]`。已有同名服务应修改原条目。重载 MCP 连接，或完全退出并重新打开 Codex，然后在目标工程中开启对话。

配置参考：[OpenAI MCP 文档](https://developers.openai.com/codex/mcp)、[配置基础](https://developers.openai.com/codex/config-basic)。客户端设置界面可能随版本变化，TOML 和本项目安装器输出为本文的主要操作入口。本次编写时官方文档站的网络请求受限；未将客户端界面名称视为已逐版验证。

### 其他 STDIO MCP 客户端

控制台可复制通用 JSON，例如：

```json
{
  "mcpServers": {
    "cocos_creator": {
      "command": "C:/Program Files/nodejs/node.exe",
      "args": ["D:/Tools/CocosCreatorMCP/package/src/server.mjs", "--project", "D:/Games/MyGame"]
    }
  }
}
```

不同客户端的配置外层名称可能不同，请按其文档合并。本项目当前提供 **STDIO MCP**；Creator 的 `127.0.0.1` RPC 地址是内部桥接地址，不能当作 Streamable HTTP MCP URL 填进客户端。无需开放防火墙公网端口，也无需固定桥接端口。

## 6. 检查连接与首次使用

保持 Creator 打开工程，等待场景和 AssetDB 就绪，在源码目录执行：

```powershell
node scripts/cli.mjs doctor --project 'D:\Games\MyGame'
```

成功输出应包含正确 `project`、`editorVersion: "3.8.8"`、`Scene ready: true`、`AssetDB ready: true`。Doctor 的 ready 检查使用高级消息接口；如果你在控制台关闭了高级接口，优先让 AI 调用 `cocos_status` 检查连接，Doctor 的该部分会被拒绝。

给 Codex 的第一条指令：

> 使用 cocos_status 确认项目和 Creator 版本。查询 cocos_catalog 的 scene.tree、ui.build 和 scene.save 参数，先读取当前场景。对 menu 模板执行 dryRun，再创建到真实项目 Canvas。读取层级并截图验证结果，最后保存。若失败或超时，检查 requestId 和已完成步骤，不要重复执行整个批次。

默认应该看到四个 MCP 工具：`cocos_status`、`cocos_catalog`、`cocos_execute`、`cocos_observe`。操作 schema 按需获取，不会一次加载全部 90 项详细参数。首次可先只读取场景，不必立刻修改正式游戏工程。

## 7. 更新、回退与卸载

### 更新

1. 保存并关闭 Creator 工程，断开该项目 MCP 客户端连接。
2. 备份旧版 MCP 源码目录和工程 `extensions/cocos-codex-bridge/`。使用项目版本控制保留工程内容。
3. 新版本解压到独立固定目录，运行 `npm ci --ignore-scripts`。
4. 用新目录的 `install --project ...` 重新安装扩展。
5. 合并新的 TOML 示例或控制台配置。已有配置不会被自动覆盖，尤其要检查新的 `src/server.mjs` 路径。
6. 打开 Creator、重启 MCP 连接，运行 Doctor 并读取状态。

安装器会复制当前扩展文件，没有完整升级迁移器或原子回退机制。跨版本若需要清除旧文件，关闭 Creator 后先备份并手动移走旧扩展目录，再安装；不要将此过程称为无风险一键升级。

### 回退

关闭 Creator 和 MCP 连接，从旧版本完整源码目录重新安装，恢复旧版配置路径，再打开和验证工程。场景/资源内容如果已被新版本修改，需另用 Git 或资源备份恢复；回退插件代码不等于自动回退游戏内容。

### 卸载

关闭 Creator 和 MCP 连接后，移除工程 `extensions/cocos-codex-bridge/`，在客户端配置中只删除本服务的配置段，再按需移除 MCP 源码目录。不要删除包含其他设置的整个 `.codex` 目录。

工程 `local/cocos-mcp/` 可能含设置和恢复备份，`temp/cocos-mcp/` 含临时连接记录。确认不再需要恢复后再自行清理。卸载不会自动改写场景或删除游戏节点。

## 8. 常见问题

| 现象 | 处理 |
| --- | --- |
| `node` 找不到 | 重开 PowerShell；检查 PATH 或用 Node 绝对路径 |
| `npm.ps1` 不能运行 | 使用 `npm.cmd`，无需修改执行策略 |
| `npm ci` 网络失败 | 检查 npm 网络/代理与官方 registry 连通性；保留完整错误，不随意删除 lockfile |
| `ERR_MODULE_NOT_FOUND` | 在包含 package.json 的源码根目录运行 `npm.cmd ci --ignore-scripts` |
| bridge offline | Creator 必须打开**同一个工程**；确认扩展启用和菜单可见 |
| 没有 MCP 工具 | 检查配置是否生效、工程是否被信任、路径是否正确、是否重复定义服务；重启连接 |
| 工具显示但写入拒绝 | 控制台是否暂停编辑；高级脚本/消息接口是否关闭 |
| 面板更新后空白/仍旧版 | 关闭并重开 Creator；确认扩展复制位置，避免残留旧面板实例 |
| UI 创建后看不见 | 检查项目 Canvas、活动 UI 相机、layer、尺寸和位置；定位生成根节点，再保存重开验证 |
| 超时或连接中断 | 按返回 requestId 查询 `operation.status`；已执行内容可能存在，禁止盲目重放写入 |
| MCP 目录移动后失效 | 在新位置重新安装、合并新配置并重启连接；配置是绝对路径 |
| Spine、构建或插件能力不符 | 查看 COVERAGE 和 ROADMAP 的实际版本/平台范围；通用接口存在不等于工作流已验收 |

需要反馈时，先用独立工程复现，记录 MCP/Creator/Node/客户端版本、操作名、脱敏参数、requestId 和最小复现步骤。不要公开连接 token、整个私有游戏工程或包含账号的完整日志。
