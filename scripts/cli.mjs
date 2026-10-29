#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
const { version } = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
const [command = 'help', ...args] = process.argv.slice(2);
if (command === 'help' || command === '--help') {
  console.log(`Cocos MCP ${version}

  cocos-mcp install --project <Creator project>   Install the extension and prepare client config
  cocos-mcp doctor --project <Creator project>    Check bridge, scene and AssetDB
  cocos-mcp serve --project <Creator project>     Run MCP over STDIO (4 tools by default)
  cocos-mcp serve --project <path> --tools legacy Expose individual tools for older workflows

Creator 3.8.8 and Node.js >=22 are required. After installation, open:
Extensions → Cocos MCP → 控制台, then copy the generated client config.
No account, activation code, telemetry or API key is required by this bridge.
License: free personal non-commercial use; commercial/organizational use and
redistribution require prior written permission. See LICENSE and docs/LICENSING.md.
Commercial licensing: 17268680050@163.com`);
} else {
  const module = { install: 'install.mjs', doctor: 'doctor.mjs', serve: '../src/server.mjs' }[command];
  if (!module) throw new Error(`Unknown command ${command}. Run cocos-mcp --help.`);
  process.argv = [process.argv[0], fileURLToPath(new URL(module, import.meta.url)), ...args];
  await import(new URL(module, import.meta.url));
}
