import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const at = args.indexOf('--project');
if (at >= 0 && (!args[at + 1] || args[at + 1].startsWith('--'))) throw new Error('--project requires the path to a Creator project.');
const project = path.resolve(at >= 0 ? args[at + 1] : path.join(root, 'test-project'));
const source = path.join(root, 'extension');
const destination = path.join(project, 'extensions', 'cocos-codex-bridge');
const pkg = JSON.parse(await fs.readFile(path.join(project, 'package.json'), 'utf8'));
if (!pkg.creator?.version?.startsWith('3.8.')) throw new Error('Expected a Creator 3.8.x project package.json.');
await fs.mkdir(destination, { recursive: true });
await fs.cp(source, destination, { recursive: true });
await fs.copyFile(path.join(root, 'LICENSE'), path.join(destination, 'LICENSE'));
await fs.mkdir(path.join(destination, 'docs'), { recursive: true });
await fs.copyFile(path.join(root, 'docs', 'LICENSING.md'), path.join(destination, 'docs', 'LICENSING.md'));
await fs.writeFile(path.join(destination, 'installation.json'), JSON.stringify({ node: process.execPath, server: path.join(root, 'src', 'server.mjs') }, null, 2));
// Produce a project-scoped config; never overwrite existing Codex settings.
const configDir = path.join(project, '.codex');
await fs.mkdir(configDir, { recursive: true });
const toml = `[mcp_servers.cocos_creator]\ncommand = ${JSON.stringify(process.execPath)}\nargs = ${JSON.stringify([path.join(root, 'src', 'server.mjs'), '--project', project])}\nstartup_timeout_sec = 15\ntool_timeout_sec = 90\n`;
try {
  await fs.writeFile(path.join(configDir, 'config.toml'), toml, { flag: 'wx' });
  console.log('Created project .codex/config.toml');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  if (await fs.readFile(path.join(configDir, 'config.toml'), 'utf8') === toml) console.log('Project MCP config is already up to date.');
  else {
    await fs.writeFile(path.join(configDir, 'cocos-mcp.example.toml'), toml);
    console.log('Existing config preserved; merge .codex/cocos-mcp.example.toml manually.');
  }
}
console.log(`Installed bridge: ${destination}\nOpen this project in Creator 3.8.8, enable the extension, then open a Codex chat in this project.`);
