import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createRequire } from 'node:module';
import { BridgeClient } from './client.mjs';
import { operations } from './operations.mjs';
import { catalog } from '../scripts/generate-catalog.mjs';
const { preflight, pointer, compact } = createRequire(import.meta.url)('../extension/workflow.cjs');
const { version } = createRequire(import.meta.url)('../package.json');
const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
const client = new BridgeClient(arg('--project') || process.env.COCOS_PROJECT_PATH);
const profile = arg('--tools') || 'compact';
if (!['compact', 'legacy'].includes(profile)) throw new Error('--tools must be compact or legacy.');
const server = new McpServer({ name: 'cocos-creator', version }, {
  instructions: profile === 'compact'
    ? 'Control the configured Creator 3.8.8 project. Start cocos_status, then cocos_catalog to discover operations and request schemas only for the operations needed. Use cocos_execute for sequential batches with result references {$ref:"stepId#/path"}; never invent op names. cocos_observe is read-only and returns images for editor.screenshot. Prefer native operations; inspect properties before writing. Batches stop on failure and are not atomic. Schema dryRun is not runtime verification. Verify state before saving. After a timeout inspect operation.status with the returned requestId; never replay writes blindly. Scene snapshots are bounded structural comparisons, not backups. UI coordinates are content DIP; OS dialogs/external apps are outside this bridge.'
    : 'Creator 3.8.8 legacy profile. Start editor_status. Inspect before editing and save explicitly. After timeout check editor_operation_status before retry. Generic scripts have full local editor privileges. UI input requires readback verification.',
});
const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };
function result(value) { return { content: [{ type: 'text', text: JSON.stringify(value) }] }; }
function register(name, description, schema, annotations, handler) {
  server.registerTool(name, { description, inputSchema: schema, annotations }, async args => {
    try { return await handler(args); }
    catch (error) { return { isError: true, ...result({ error: error.message, ...(error.requestId ? { requestId: error.requestId } : {}) }) }; }
  });
}
function image(output) {
  const { data, mimeType, ...metadata } = output.result;
  return { content: [{ type: 'text', text: JSON.stringify({ requestId: output.requestId, ...metadata }) }, { type: 'image', mimeType, data }] };
}
if (profile === 'legacy') {
  for (const op of operations.values()) register(op.name, op.description, op.schema, op.readOnly ? read : write, async args => {
    const output = await client.call(op.action, op.convert(args));
    return op.action === 'editor.screenshot' ? image(output) : result(output);
  });
} else {
  register('cocos_status', 'Check the configured project, bridge and Creator version. Also reports enabled controls and recent operation counts.', z.object({}).strict(), read, async () => result(await client.call('status')));
  register('cocos_catalog', 'Discover operations offline. List concise names; request op or up to 12 ops for exact schemas in one call. Tool count is not capability coverage.', z.object({
    query: z.string().max(100).optional(), domain: z.string().optional(), op: z.string().optional(), ops: z.array(z.string().min(1)).min(1).max(12).optional(),
    offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(50).default(30),
  }).strict(), read, async p => {
    if (p.op && p.ops) throw new Error('Supply op or ops, not both.');
    if (p.op || p.ops) {
      const entries = (p.ops || [p.op]).map(action => {
        const entry = catalog.find(op => op.action === action);
        if (!entry) throw new Error(`Unknown operation: ${action}. Search cocos_catalog first.`);
        return entry;
      });
      return result(p.ops ? { operations: entries } : entries[0]);
    }
    const matches = catalog.filter(op => (!p.domain || op.domain === p.domain) && (!p.query || `${op.action} ${op.description}`.toLowerCase().includes(p.query.toLowerCase())));
    return result({ total: matches.length, offset: p.offset, domains: [...new Set(catalog.map(op => op.domain))], operations: matches.slice(p.offset, p.offset + p.limit).map(op => ({ op: op.action, readOnly: op.readOnly, description: op.description.split('. ')[0] })), next: p.offset + p.limit < matches.length ? p.offset + p.limit : null });
  });
  const step = z.object({ id: z.string().regex(/^[A-Za-z][\w-]{0,39}$/), op: z.string().min(1), params: z.record(z.string(), z.unknown()).default({}), fields: z.array(z.string()).max(30).optional(), output: z.enum(['summary', 'full', 'none']).default('summary') }).strict();
  register('cocos_execute', 'Execute 1–100 sequential operations in one call. Result refs: {$ref:"create#"} or {$ref:"inspect#/uuid/value"}. Prechecks constants and backward refs before any edit. Stops at failure; earlier steps remain applied. Summary output by default; fields are JSON pointers into the full result. dryRun validates the plan without editing.', z.object({ steps: z.array(step).min(1).max(100), dryRun: z.boolean().default(false) }).strict(), write, async p => {
    preflight(p.steps, catalog);
    const output = await client.call('workflow.execute', p);
    return { ...(output.result?.ok === false ? { isError: true } : {}), ...result(output) };
  });
  register('cocos_observe', 'Run a read-only catalog operation. params follow its discovered schema. Summary by default; use fields (JSON pointers) or detail=full for precise dumps. editor.screenshot returns image content. Mutating operations are rejected.', z.object({
    op: z.string().min(1), params: z.record(z.string(), z.unknown()).default({}), fields: z.array(z.string()).max(30).optional(), detail: z.enum(['summary', 'full']).default('summary'),
  }).strict(), read, async p => {
    const op = operations.get(p.op);
    if (!op || !op.readOnly) throw new Error('Use a known read-only operation; edits belong in cocos_execute.');
    const output = await client.call(p.op, op.convert(op.schema.parse(p.params)));
    if (p.op === 'editor.screenshot') return image(output);
    const full = output.result;
    output.result = p.fields ? Object.fromEntries(p.fields.map(path => [path, pointer(full, path)])) : p.detail === 'full' ? full : compact(p.op, full);
    return result(output);
  });
}
await server.connect(new StdioServerTransport());
