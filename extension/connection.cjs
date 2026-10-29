'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Resolve paths on this machine after extraction. Never ship installation.json.
function connection({ directory, project, executable = process.execPath, electron = !!process.versions.electron }) {
  const portable = path.join(directory, 'mcp');
  let command, server, env, mode, error;
  if (fs.existsSync(path.join(portable, 'src', 'server.mjs'))) {
    mode = 'complete-extension';
    server = path.join(portable, 'src', 'server.mjs');
    command = executable;
    env = electron ? { ELECTRON_RUN_AS_NODE: '1' } : undefined;
    for (const file of ['package.json', 'extension/workflow.cjs', 'scripts/generate-catalog.mjs', 'node_modules/@modelcontextprotocol/sdk/package.json', 'node_modules/zod/package.json']) {
      if (!fs.existsSync(path.join(portable, file))) { error = '完整扩展文件缺失，请重新解压官方 extension.zip，保留整个 cocos-codex-bridge 文件夹。'; break; }
    }
  } else {
    mode = 'source-install';
    try {
      const installed = JSON.parse(fs.readFileSync(path.join(directory, 'installation.json'), 'utf8'));
      command = installed.node; server = installed.server;
      if (!path.isAbsolute(command || '') || !path.isAbsolute(server || '') || !fs.existsSync(command) || !fs.existsSync(server)) throw new Error('Invalid source installation paths.');
    } catch {
      error = '请下载 Release 中的完整 extension.zip；源码安装用户请运行 install 命令。';
    }
  }
  if (error) return { mode, ready: false, error, config: null, toml: '' };
  const args = [server, '--project', project];
  const entry = { command, args, ...(env ? { env } : {}) };
  const toml = `[mcp_servers.cocos_creator]\ncommand = ${JSON.stringify(command)}\nargs = ${JSON.stringify(args)}\nstartup_timeout_sec = 15\ntool_timeout_sec = 90\n${env ? '\n[mcp_servers.cocos_creator.env]\nELECTRON_RUN_AS_NODE = "1"\n' : ''}`;
  return { mode, ready: true, config: { mcpServers: { cocos_creator: entry } }, toml };
}
module.exports = { connection };
