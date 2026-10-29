import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const require = createRequire(import.meta.url);
const { startBridge } = require('../extension/bridge.cjs');
const { execute } = require('../extension/workflow.cjs');

export async function checkExtension(directory, { executable = process.execPath, electron = false } = {}) {
  const { connection } = require(path.join(directory, 'connection.cjs'));
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'cocos offline project 中文 '));
  const setup = connection({ directory, project, executable, electron });
  assert.equal(setup.ready, true, setup.error);
  assert.equal(setup.mode, 'complete-extension');
  const catalog = JSON.parse(await fs.readFile(path.join(directory, 'operations.json'), 'utf8'));
  let dispatches = 0;
  const dispatch = async (action, params) => {
    if (action === 'workflow.execute') return execute(params.steps, { catalog, dispatch, dryRun: params.dryRun });
    dispatches++;
    if (action === 'node.create') return 'offline-node';
    if (action === 'node.inspect') return { uuid: params.uuid };
    if (action === 'editor.screenshot') return { mimeType: 'image/png', data: 'aGVsbG8=' };
    throw new Error(`Unexpected fixture operation ${action}`);
  };
  let bridge;
  const client = new Client({ name: 'complete-extension-offline-check', version: '1' });
  let stderr = '';
  try {
    bridge = await startBridge({ project, version: '3.8.8', dispatch });
    const entry = setup.config.mcpServers.cocos_creator;
    const transport = new StdioClientTransport({ command: entry.command, args: entry.args, env: { ...process.env, PATH: '', ...entry.env }, cwd: project, stderr: 'pipe' });
    transport.stderr?.on('data', chunk => { stderr += String(chunk); });
    await client.connect(transport);
    assert.equal((await client.listTools()).tools.length, 4);
    const call = (name, args) => client.callTool({ name, arguments: args });
    const status = JSON.parse((await call('cocos_status', {})).content[0].text).result;
    assert.equal(status.project, project); assert.equal(status.editorVersion, '3.8.8');
    const schemas = JSON.parse((await call('cocos_catalog', { ops: ['node.create', 'ui.layout', 'build.start'] })).content[0].text);
    assert.equal(schemas.operations.length, 3);
    assert.equal((await call('cocos_observe', { op: 'node.create', params: { name: 'blocked' } })).isError, true);
    assert.equal(dispatches, 0);
    const batch = JSON.parse((await call('cocos_execute', { steps: [
      { id: 'create', op: 'node.create', params: { name: 'fixture' }, output: 'none' },
      { id: 'inspect', op: 'node.inspect', params: { uuid: { $ref: 'create#' } }, fields: ['/uuid'] },
    ] })).content[0].text).result;
    assert.equal(batch.ok, true); assert.equal(batch.steps[1].result['/uuid'], 'offline-node');
    assert.equal((await call('cocos_observe', { op: 'editor.screenshot', params: { windowId: 1 } })).content[1].type, 'image');
    return { passed: true, runtime: electron ? 'Creator Electron' : 'CI Node', tools: 4, schemas: catalog.length, emptyPath: true, noInstallCommand: true, checks: ['handshake', 'project status', 'schemas', 'readonly rejection', 'batch result references', 'image content'] };
  } catch (error) { throw new Error(`${error.message}${stderr ? `\nMCP stderr: ${stderr}` : ''}`, { cause: error }); }
  finally {
    await client.close(); await bridge?.close();
    const resolved = await fs.realpath(project);
    if (path.dirname(resolved).toLowerCase() !== (await fs.realpath(os.tmpdir())).toLowerCase() || !path.basename(resolved).startsWith('cocos offline project')) throw new Error('Unsafe offline fixture cleanup');
    await fs.rm(resolved, { recursive: true, force: true });
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--creator');
  console.log(JSON.stringify(await checkExtension(path.resolve(process.argv[2]), index >= 0 ? { executable: process.argv[index + 1], electron: true } : {}), null, 2));
}
