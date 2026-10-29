# GitHub 首次建仓、打包与发布

本文面向仓库维护者；终端用户请看 [环境安装与客户端连接](INSTALLATION.md)。当前建议以 **v0.8.0 开发预览（Pre-release）** 发布，列出已验证能力和已知问题，方便社区试用。发布 GitHub 源码、上传 Release 和发布 npm 是三件不同的事，本项目目前仍设置 `private:true`，不发布 npm。

## 1. 仓库内容和发布边界

仓库名使用 **`CocosCreatorMCP`**。下面命令中的 `YOUR_ACCOUNT` 请替换为真实 GitHub 用户名或组织；npm 包标识 `cocos-creator-mcp` 和已有发行文件名无需改成仓库名。

在 GitHub 的 **Create a new repository → Configuration** 中这样设置：

| 页面选项 | 选择 | 原因 |
| --- | --- | --- |
| Repository name | `CocosCreatorMCP` | 与本文示例一致 |
| Description | `Cocos Creator 3.8.8 automation via MCP. Free for personal non-commercial use; commercial use requires permission.` | 简要说明能力与许可 |
| Choose visibility | **Public** | 允许用户查看和获取源码 |
| Add README | **Off** | 本地已经有 README.md，推送后自动展示 |
| Add .gitignore | **No .gitignore** | 使用本地已有的忽略规则 |
| Add license | **No license** | 不用 GitHub 标准模板；推送本地自定义 LICENSE |

这里的 No license 仅表示不要由 GitHub 生成新文件，**不表示最终仓库没有许可**。本地 README、LICENSE、文档与源码一起上传。若已经在网页生成了 README，不要直接 force push 覆盖已有内容，应先合并远端历史。

| 路径 | 是否提交 | 内容 |
| --- | --- | --- |
| `src/` | 是 | Node MCP 服务、参数 schema 和客户端 |
| `extension/` | 是 | Creator 桥接与控制面板；排除 installation.json |
| `scripts/`、`tests/` | 是 | 安装、诊断、回归、打包和校验 |
| `docs/`、`examples/` | 是 | 安装、能力、限制、工作流与原创示例 |
| `.github/` | 是 | CI、Release 工作流、Issue 和 PR 模板 |
| `package.json`、`package-lock.json` | 是 | 固定依赖与版本 |
| README、CHANGELOG、CONTRIBUTING、LICENSE、SECURITY | 是 | 使用、贡献、许可、安全说明 |
| `node_modules/` | 否 | 用户通过 npm ci 安装 |
| `test-project/` | 否 | 独立本机工程、Creator 导入缓存和游戏内容 |
| `artifacts/` | 否 | 本机日志、截图、第三方参考代码、连接信息、发行产物 |
| `.codex/`、`.env`、日志、installation.json | 否 | 本机配置、秘密或绝对路径 |

Release 产物从 `artifacts/releases/` **作为附件上传**，不提交到 Git 历史。打包器采用源码目录白名单，禁止打入本地测试工程、node_modules、artifacts、连接描述和机器安装路径。第三方参考源码、Creator 安装目录/引擎和用户游戏资产也不进入发行包。

项目自己的实现采用 [CocosCreatorMCP Personal Non-Commercial License 1.0](../LICENSE)：个人非商业使用免费；商用、组织/客户用途、收费服务和再分发须事先取得维护者书面授权。联系邮箱：[17268680050@163.com](mailto:17268680050@163.com)。具体边界见 [许可说明](LICENSING.md)。这是源码可见发行，不是 OSI 定义的开源；不要改选允许商业使用的 MIT、Apache 或 GPL 模板。

Creator、Node、依赖及第三方资源按各自条款使用。公开产品能力作为需求参考不代表有权复制对方受限实现、Pro 二进制或品牌。当前发行包不内置第三方 MCP 服务源码或付费功能代码。

## 2. 发布前准备环境

需要 Git、Node.js 22.x、其附带的 npm，以及系统 `tar`。Windows 10/11 通常自带 `tar.exe`；在 PowerShell 检查：

```powershell
git --version
node --version
npm.cmd --version
tar --version
```

ZIP 由 Node 脚本生成，不需要 7-Zip、PowerShell Compress-Archive 或其他 npm 打包依赖。真实 Creator 检查另外需要 Creator 3.8.8 和独立测试工程；GitHub 托管 CI 不运行 Creator。

## 3. 版本和文档准备

版本变更时同步维护：

1. `package.json` 的 version。
2. `package-lock.json` 的顶层 version 和 `packages[""].version`。
3. `extension/package.json` 的 version。
4. README、CHANGELOG、覆盖记录与新增功能说明。

CLI 帮助读取 package.json；控制台版本文本也应跟随版本更新。打包器会拒绝 package/lockfile/extension 的版本不一致。Tag 使用 `v0.8.0`，不能把 `v0.9.0` 指向 package version 0.8.0 的提交。

发布说明应包含：问题/新增行为、测试方式、实际 Creator/OS、下载包区别、安装文档入口和已知限制。不要把通用脚本入口、工具数、JSON 字节减少宣传成 100% 编辑器覆盖或真实 Pro Token 领先。

## 4. 本地生成并验证发行包

从源码根目录运行：

```powershell
npm.cmd ci --ignore-scripts
npm.cmd test
npm.cmd run benchmark
npm.cmd run release:check-version -- v0.8.0
npm.cmd run release:local
npm.cmd run release:verify
```

最后一步会验证源码 TAR、源码 ZIP、扩展 ZIP 的哈希/文件清单/文件内容，在独立临时目录执行一次干净 `npm ci --ignore-scripts`，再运行自动测试和紧凑工具 benchmark。临时目录清理有路径边界检查。成功报告保存在 `artifacts/release-check.json`。

默认输出：

```text
artifacts/releases/
  cocos-creator-mcp-0.8.0-source.tar.gz
  cocos-creator-mcp-0.8.0-source.tar.gz.sha256
  cocos-creator-mcp-0.8.0-source.zip
  cocos-creator-mcp-0.8.0-source.zip.sha256
  cocos-creator-mcp-0.8.0-extension.zip
  cocos-creator-mcp-0.8.0-extension.zip.sha256
  SHA256SUMS.txt
  manifest.json
```

| 产物 | 结构与用途 |
| --- | --- |
| source.tar.gz / source.zip | 顶层 `package/`，完整源码；使用者解压后运行 npm ci |
| extension.zip | 顶层 `cocos-codex-bridge/`，手动放入游戏工程 extensions；附 LICENSE、README 和 docs/LICENSING.md |
| `.sha256` / SHA256SUMS.txt | 校验二进制归档的 SHA-256 |
| manifest.json | 当前版本、每个归档文件名/哈希/大小与源码文件清单 |
| release-check.json | 本次验证结果；位于 artifacts/，单独上传 |

扩展 ZIP 是项目文件夹扩展，**不是完整 Node MCP 服务，也不是 Cocos Store 商店安装包**。首次用户应选 source ZIP。不要创建一个只有 extension.zip 的 Release，然后让用户寻找缺失的 src/server.mjs。

重新执行打包会更新本地同版本产物；一旦公开发布，同一 Tag 不要静默替换成不同代码。需要改动时发布新版本。打包后再次编辑源码，必须重新打包并校验，否则发布的是过时文件。

### Creator 真实回归

托管 CI 的 Node 测试不证明编辑器界面可用。已有 `test-project` 时保存现场、打开 Creator，按各模块文档准备对应样例再运行 live 检查。没有测试工程时：

```powershell
node scripts/create-test-project.mjs --creator 'C:\ProgramData\cocos\editors\Creator\3.8.8'
node scripts/install.mjs
```

这个命令读取本机已安装的 Creator 模板创建新 `test-project`，已有目录时拒绝覆盖。接着用 Creator 打开它，等待导入和场景就绪，再按 README 的测试流程执行。

部分脚本依赖前置样例和当前场景，不能任意排序：交互样例对应 `demo:interactive`，资源/动画/Spine 对应 `demo:workflow`，文字/UI 对应 `demo:typography`。场景视图检查当前依赖 TypographyDemo 和它的参考截图。`test:live:ui-layout:panel` 仍有未通过的真实输入回归，发布预览时应在已知问题中保留，不应当作全绿项目对外宣传。

## 5. 首次把源码提交到 GitHub

如果源码目录尚未初始化 Git，按本节首次发布。在 GitHub 网页按第 1 节配置创建 **Public 空仓库 `CocosCreatorMCP`**，关闭自动生成 README、gitignore、LICENSE。已有远端仓库时跳过初始化，使用其正常提交/PR 流程。

在本地源码根目录依次执行：

```powershell
git init -b main
git status --short --untracked-files=all
git add .
git diff --cached --stat
git diff --cached --name-only
git diff --cached
```

检查暂存文件确实只有准备公开的源码和文档，且包括新的 LICENSE 与 docs/LICENSING.md。`.gitignore` 只保护未跟踪内容；如果你以前已提交过敏感文件，后加忽略规则不会清除 Git 历史。这里是首次初始化仓库；不要把初始化命令用于已有正式仓库来重置历史。

初次安装 Git 若提示缺少作者身份，请填写你准备公开的署名和邮箱。也可以使用 GitHub 账号设置页提供的 noreply 邮箱；不要照抄别人的身份：

```powershell
git config user.name 'YOUR_PUBLIC_NAME'
git config user.email 'YOUR_PUBLIC_OR_GITHUB_NOREPLY_EMAIL'
```

完成暂存审阅后提交并关联远端：

```powershell
git commit -m 'Initial source-available preview v0.8.0'
git remote add origin https://github.com/YOUR_ACCOUNT/CocosCreatorMCP.git
git remote -v
git push -u origin main
```

推送会公开已提交内容。GitHub 认证通过 Git Credential Manager、SSH 或 GitHub CLI 完成；不要把 token 写进 remote URL、README、命令示例或提交文件。若本地已有 `origin`，先核对它，避免再次 remote add 或把源码推错仓库。

本教程和自动化均不需要把 Node 包发布到 npm。`package.json` 保留 `private:true`，用户使用源码或 Release 安装。

## 6. GitHub CI 与预览 Release

### CI 自动做什么

`.github/workflows/ci.yml` 在 push/PR 后检查 Node.js 22 的 Windows、macOS 和 Ubuntu 测试/benchmark；Ubuntu 还打包并验证干净安装。矩阵代表 Node/MCP 层检查环境，**不是 Creator 的跨平台兼容认证**。

首次提交后在 GitHub **Actions → CI** 检查结果。本文提供了工作流配置，但本机无法替代 GitHub 托管 runner 的实际执行；以该仓库运行结果为准。

### 方式 A：推 Tag 后生成草稿（推荐）

确认 main 的目标提交和 CI：

```powershell
git status --short
git log -1 --oneline
git tag -a v0.8.0 -m 'Cocos Creator MCP 0.8.0 development preview'
git push origin v0.8.0
```

Tag 推送触发 `Build draft release`：

1. 检查 Tag 与 package version 一致。
2. 安装依赖、运行测试。
3. 生成三个归档，使用 unzip 做 ZIP 互操作检查，并执行完整发行校验。
4. 保存 Actions Artifact。
5. 使用仓库自带 `GITHUB_TOKEN` 创建一个 **Draft + Pre-release**，附归档、校验文件、manifest 和 release-check.json。

默认停在草稿，不会自动成为公开 Release。工作流需要仓库允许 Actions 和 `contents:write`；不需要额外创建 PAT。失败时先看 Actions 日志。若只是 runner 网络故障，在 Tag 尚未创建 Release 的情况下重跑；如果同名草稿已存在，请编辑并维护该草稿，`gh release create` 不会自动覆盖它。

草稿生成后：GitHub **Releases → 编辑对应 Draft**，检查说明/附件、保留 **This is a pre-release**，再点击 Publish release。推荐标题 `CocosCreatorMCP v0.8.0 (Preview)`。首次公开发布不建议标为稳定版或承诺全编辑器自动化。

也可以在 Actions 中手动运行 `Build draft release`，输入已经推送存在的 Tag。手动运行会检出该 Tag，而不是随意给另一个版本打标签。

### 方式 B：网页手动上传

若不使用 Actions：先完成本地测试、打包、校验、源码推送和 Tag 推送；然后在 GitHub **Releases → Draft a new release** 选择 `v0.8.0`，粘贴 CHANGELOG 和安装说明，上传本节列出的附件及 `artifacts/release-check.json`。草稿审阅完成后发布。

发布说明可用以下命令生成预览内容：

```powershell
node scripts/release-notes.mjs | Set-Content -Encoding utf8 .\artifacts\release-notes.md
```

不要同时使用网页流程和自动流程创建两个同 Tag 的 Release。

## 7. GitHub 仓库主页建议

- About：`Cocos Creator 3.8.8 automation via MCP. Free for personal non-commercial use; commercial use requires permission.`
- Topics：`cocos-creator`、`mcp`、`model-context-protocol`、`game-development`、`codex`、`editor-extension`。
- README 顶部提供安装文档、发布指南、能力范围和路线图入口。徽章须替换真实仓库地址后再添加，不能放无效 CI 图标。
- 开启 Issues；按需开启 Discussions；在 Security 中启用 private vulnerability reporting 后按 SECURITY.md 接收私密漏洞报告。
- 给预览版提供已知问题、复现模板与精确版本范围。仅上传你拥有发布权的示例和截图。
- GitHub 可能把自定义许可显示为 Other 或无法自动识别；不应为获得 MIT 等标签而替换条款。Public 仓库保留平台条款要求的查看/Fork 权利，公开源码也无法技术阻止复制，详见许可说明。
- README、Release 说明、源码 ZIP/TAR、扩展 ZIP 应带一致的新许可。不要上传以前按 MIT 打包的本地旧产物；修改许可后必须重新打包和校验。已有效授予的旧版本许可不能仅靠换文件追溯撤回。

后续每次发布沿用“修改版本与文档 → 自动测试/对应 Creator 回归 → 打包干净安装验证 → 提交并检查 CI → 推 Tag → 审阅草稿 → 发布”的顺序。
