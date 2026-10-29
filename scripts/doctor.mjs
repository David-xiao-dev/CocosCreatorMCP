import path from 'node:path';
import { BridgeClient } from '../src/client.mjs';
const i = process.argv.indexOf('--project');
const project = i >= 0 ? process.argv[i + 1] : path.resolve('test-project');
const client = new BridgeClient(project, { timeout: 10_000 });
try {
  console.log(JSON.stringify((await client.call('status')).result, null, 2));
  console.log('Scene ready:', (await client.call('editor.request', { package: 'scene', message: 'query-is-ready' })).result);
  console.log('AssetDB ready:', (await client.call('editor.request', { package: 'asset-db', message: 'query-ready' })).result);
} catch (error) { console.error(error.message); process.exitCode = 1; }
