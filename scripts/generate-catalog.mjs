import fs from 'node:fs/promises';
import { z } from 'zod';
import { operations } from '../src/operations.mjs';
export const catalog = [...operations.values()].map(op => ({
  action: op.action, name: op.name, domain: op.action === 'selection' ? 'editor' : op.action.split('.')[0],
  description: op.description, readOnly: op.readOnly,
  inputSchema: z.toJSONSchema(op.schema, { io: 'input' }),
}));
if (process.argv[1]?.endsWith('generate-catalog.mjs')) {
  await fs.writeFile(new URL('../extension/operations.json', import.meta.url), `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`Generated ${catalog.length} operation schemas.`);
}
