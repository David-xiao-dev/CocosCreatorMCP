# 安装与使用（Creator 3.8.8）

当前是 **0.8.1 开发预览**。普通用户推荐完整扩展 ZIP：不需要单独安装 Node.js、npm、MCP SDK 或服务器。源码开发者的安装方式放在第 5 节。已验证范围见 [COVERAGE](COVERAGE.md)，维护者发布流程见 [GitHub 发布指南](GITHUB-RELEASE.md)。

**使用范围：个人学习和非商业使用免费；商业游戏、公司/组织或客户项目、收费服务以及再分发须事先书面授权。** 见 [LICENSE](../LICENSE) 与 [许可说明](LICENSING.md)，联系 [17268680050@163.com](mailto:17268680050@163.com)。没有激活码不等于允许未经授权的商业使用。

## 1. 下载哪个包

先准备 **Cocos Creator 3.8.8**、一个 Creator 项目，以及能够正常使用模型的 AI 客户端。Cocos Dashboard 不包含编辑器，须另外安装 Creator。完整扩展目前真实验证的是 Windows + Creator 3.8.8；其他系统的 Creator 集成待验证。

打开 [GitHub Releases](https://github.com/David-xiao-dev/CocosCreatorMCP/releases)，选择 **`cocos-creator-mcp-0.8.1-extension.zip`**。

| 文件 | 面向谁 | 要求 |
| --- | --- | --- |
| `*-extension.zip`（0.8.1 起推荐） | 普通使用者 | 完整扩展，含 MCP 服务和锁定的 JS 依赖；无需另装 Node/npm |
| `*-source.zip` / `*-source.tar.gz` | 源码开发者 | 需要 Node.js 22+、npm ci 和源码安装命令 |
| GitHub 自动附带的 Source code ZIP/TAR | 源码开发者 | Git 提交快照，不是完整扩展，未附安装好的依赖 |

**0.8.0 及更早版本的 extension.zip 只有 Creator 桥接**，不能照新版本方式直接使用。不要下载旧包、GitHub 的 Code → Download ZIP，或只复制源码仓库的 extension/ 然后期待完整连接。

可选校验：下载附件中的 SHA256SUMS.txt，对照 PowerShell 输出：

```powershell
Get-FileHash '.\cocos-creator-mcp-0.8.1-extension.zip' -Algorithm SHA256
```

## 2. 解压并启用扩展

1. 保存并关闭目标项目的 Creator。
2. 解压下载的 extension.zip。
3. 将整个 **`cocos-codex-bridge` 文件夹**放入游戏工程的 **`extensions`** 目录，没有 extensions 就新建。
4. 用 Creator 3.8.8 打开该工程，在扩展管理器中启用 `cocos-codex-bridge`。
5. 打开 **扩展 → Cocos MCP → 控制台 → 连接与设置**。

目录应是这样，不要双重嵌套，也不要只复制 main.js：

```text
MyGame/
  assets/
  package.json
  extensions/
    cocos-codex-bridge/
      package.json
      main.js
      connection.cjs
      LICENSE
      mcp/
        package.json
        src/server.mjs
        node_modules/
```

`mcp/` 及其中的依赖已打包好，请保留。扩展不需要在线安装依赖，不会首次启动时偷偷运行 npm，也不包含 Creator 或 Node 的二进制副本。它使用本机 Creator 自带的运行环境；客户端会自动启动 MCP 通信进程，用户不必另开终端或购买服务器。

面板显示“完整扩展已就绪”后，下一步配置 AI 客户端。**只启用扩展不会自动把它添加到你的 AI 客户端。** 面板的 UI 模板等本地操作可以直接使用，AI 连接还需第 3 步。

## 3. 添加一次 AI 客户端连接

### Codex

点击面板 **复制 Codex TOML**，合并到客户端的 MCP 配置。完整包自动填入本机 Creator 和游戏工程路径，例如：

```toml
[mcp_servers.cocos_creator]
command = "C:/ProgramData/cocos/editors/Creator/3.8.8/CocosCreator.exe"
args = ["D:/Games/MyGame/extensions/cocos-codex-bridge/mcp/src/server.mjs", "--project", "D:/Games/MyGame"]
startup_timeout_sec = 15
tool_timeout_sec = 90

[mcp_servers.cocos_creator.env]
ELECTRON_RUN_AS_NODE = "1"
```

**以面板生成内容为准，不照抄示例路径，也不要漏掉 env 部分。** macOS/Linux 的可执行路径由对应 Creator 自动给出，但这些系统尚未做完整编辑器验收。Windows 面板生成的双反斜杠字符串与上述正斜杠一样有效。

可以选择工程级 `.codex/config.toml`（客户端须信任该工程），或用户级 Codex 配置。默认用户配置位于用户目录的 `.codex/config.toml`；设置过 CODEX_HOME 时以实际位置为准。只合并本服务的段落，避免重复定义 `[mcp_servers.cocos_creator]`。复制按钮不会修改客户端已有设置。

保存后重新加载 MCP 连接，必要时完全退出并重开客户端。完整包流程不会自动创建 `.codex/config.toml`，请自行粘贴一次。后续不用重复启动服务器。

配置参考：[OpenAI MCP 文档](https://developers.openai.com/codex/mcp)、[配置基础](https://developers.openai.com/codex/config-basic)。客户端界面随版本变化，本文以面板实际生成的配置为入口。

### 其他 STDIO 客户端

点击 **复制通用 STDIO JSON**，按客户端要求合并 mcpServers 配置。完整包的 JSON 同样包含 command、args 和 env，不要漏掉 `ELECTRON_RUN_AS_NODE`。这要求客户端支持 STDIO 子进程的环境变量。

当前提供的是 **STDIO MCP**。Creator 内部 `127.0.0.1` RPC 地址不是可填到客户端的 Streamable HTTP MCP URL；无需固定端口、开放公网防火墙或提供桥接 API Key。模型服务仍由你选择的 AI 客户端提供，其登录与费用按对应产品管理。

## 4. 检查是否连接成功

保持 Creator 打开同一个项目，等待场景和 AssetDB 就绪，让 AI 执行：

> 使用 cocos_status 核对项目和 Creator 版本。先只读取当前场景，不做修改。通过 cocos_catalog 查询所需操作参数，不要猜操作名称。

正常情况下有四个 MCP 工具：`cocos_status`、`cocos_catalog`、`cocos_execute`、`cocos_observe`。目录按需提供 90 项操作 schema。

继续尝试 UI 模板时可以说：

> 查询 ui.build 和 scene.save 参数，读取当前场景。对 menu 模板执行 dryRun，再创建到真实项目 Canvas。读取层级并截图验证结果，最后保存。若失败或超时，检查 requestId 和已完成步骤，不要重复执行整个批次。

完整扩展通过不含系统 Node 路径的 STDIO 测试。Creator 原生功能的支持边界仍见 COVERAGE；完整包不等于已经实现 100% 人工编辑器操作。

## 5. 源码开发者安装（可选）

如果只想使用完整扩展，可以跳过这一节。源码开发需要 Node.js 22.x、npm、可选 Git；无需 TypeScript 编译、Python 或 Visual Studio Build Tools。

官方入口：[Node.js](https://nodejs.org/en/download)、[Git for Windows](https://git-scm.com/downloads/win)、[Cocos Dashboard](https://www.cocos.com/creator-download)。

```powershell
node --version
npm.cmd --version
where.exe node
git clone https://github.com/David-xiao-dev/CocosCreatorMCP.git
Set-Location CocosCreatorMCP
npm.cmd ci --ignore-scripts
node scripts/cli.mjs install --project 'D:\Games\MyGame'
```

Windows 使用 npm.cmd 可避开 npm.ps1 执行策略问题。也可下载 source ZIP，进入解压后的 package/ 目录安装。package.json 仍有 private:true，不能猜测 npx 包名作为安装入口。

安装器复制扩展和许可文件，写入本机 installation.json，并准备工程级 `.codex/config.toml`；已有不同配置会保留，另写 cocos-mcp.example.toml 供合并。源码方式的面板配置使用独立 Node 路径和源码 src/server.mjs，不需要 Electron 环境变量。不要把源码安装与完整包覆盖混用；安装器发现已有完整扩展时会拒绝。

检查源码安装：

```powershell
node scripts/cli.mjs doctor --project 'D:\Games\MyGame'
```

Doctor 的部分检查需要面板启用高级消息接口。关闭高级接口时，可让 AI 用 cocos_status 核对连接。Node 便携版可用绝对路径调用 node.exe 和 npm-cli.js，无须改系统 PATH。

## 6. 更新、移动、回退与卸载

完整包更新：保存并关闭 Creator、断开 MCP 连接，备份并移走旧 `extensions/cocos-codex-bridge/`，解压新版完整文件夹到同一位置。重新打开项目，从面板复制新配置并重连。不要只覆盖几个 JS，也不要混用源码包或旧版依赖。

移动游戏工程、改扩展文件夹位置或更换 Creator 安装位置后，旧配置的绝对路径会失效；从新位置的面板重新复制配置即可，不用运行 npm。多个项目各自有扩展与独立连接；`--project` 决定目标，不随当前前台工程自动切换。多个配置不要使用重复服务名。

回退时同样替换为完整旧版并恢复对应配置。插件回退不会自动回退已经修改的场景或资源，需要另用 Git 或项目备份恢复。0.8.0 旧包仍需其原有源码安装方式。

卸载：关闭 Creator 和 MCP 连接，移除整个 cocos-codex-bridge 文件夹，只删除客户端中本服务配置段（包括 env 子表），不要删除其他设置或整个 .codex 目录。源码方式还可按需移除独立源码目录。

工程 `local/cocos-mcp/` 可能含设置与恢复备份，`temp/cocos-mcp/` 含临时连接信息；确认不再需要恢复后自行清理。卸载不自动删除游戏节点或改写场景。没有原子升级器或一键回滚向导。

## 7. 常见问题

| 现象 | 处理 |
| --- | --- |
| 面板说完整扩展文件缺失 | 重新下载 extension.zip，保留整个 cocos-codex-bridge/mcp/，不要从源仓库只复制 extension/ |
| 面板仍要求源码安装 | 确认下载的是 0.8.1+ extension.zip，避免旧包、Source code ZIP 和双重嵌套 |
| 启动连接时又弹出 Creator 窗口 | 检查客户端 env 是否包含 ELECTRON_RUN_AS_NODE="1"；重新复制面板配置 |
| MCP 启动后 ERR_MODULE_NOT_FOUND | 完整包请重新解压，不用 npm；源码用户在 package.json 所在目录运行 npm.cmd ci |
| bridge offline | Creator 必须打开配置指定的同一个工程，扩展需启用 |
| 没有 MCP 工具 | 检查配置是否生效、工程信任、绝对路径、env、服务重名；重启连接 |
| 工具可见但写入拒绝 | 检查面板暂停编辑和高级脚本/消息开关 |
| 面板更新后仍旧版 | 关闭并重开 Creator，确认完整替换正确文件夹 |
| UI 创建后看不见 | 检查项目 Canvas、活动 UI 相机、layer、尺寸和位置；定位结果并验证 |
| 超时或中断 | 按 requestId 查 operation.status；禁止盲目重放写操作 |
| 源码 npm ci 网络失败 | 检查 npm 代理/网络，保留 lockfile；完整扩展用户不需要此步骤 |

反馈时记录 MCP/Creator/客户端/系统版本、操作名、脱敏参数、requestId 和最小复现步骤。不要公开连接 token、完整私有工程或账号日志。
