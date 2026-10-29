import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const project = await fs.mkdtemp(path.join(os.tmpdir(), 'cocos-schema-benchmark-'));
const stats = {};
try {
  for (const profile of ['legacy', 'compact']) {
    const client = new Client({ name: 'schema-measure', version: '1' });
    const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'src/server.mjs'), '--project', project, '--tools', profile], stderr: 'pipe' });
    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      stats[profile] = { tools: tools.length, schemaBytes: Buffer.byteLength(JSON.stringify(tools)) };
      if (profile === 'legacy') {
        const cohort = ['editor_status','editor_operation_status','editor_events','editor_logs','editor_api','editor_messages','editor_request','editor_script','scene_tree','scene_open','scene_save','node_inspect','node_create','node_remove','node_duplicate','node_reparent','property_set','component_add','component_remove','editor_selection','asset_query','asset_write','project_read','project_files','editor_panel','editor_windows','editor_window','editor_screenshot','editor_input','editor_menu'];
        const previous = tools.filter(t => cohort.includes(t.name));
        if (previous.length !== 30) throw new Error('Historical benchmark cohort changed; update the explicit cohort before reporting savings.');
        stats.previous30 = { tools: previous.length, schemaBytes: Buffer.byteLength(JSON.stringify(previous)) };
      }
    } finally { await client.close(); }
  }
  stats.reductionAgainstPrevious30 = `${((1 - stats.compact.schemaBytes / stats.previous30.schemaBytes) * 100).toFixed(1)}%`;
  const report = { time: new Date().toISOString(), measurement: 'UTF-8 bytes of SDK tools/list tools array; not model tokens, total task cost, or a Pro benchmark', ...stats };
  await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
  await fs.writeFile(path.join(root, 'artifacts/schema-benchmark.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await fs.rm(project, { recursive: true, force: true }); }
