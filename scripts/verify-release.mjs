import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {catalog} from './generate-catalog.mjs';
import {readZip} from './zip.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),release=path.join(root,'artifacts/releases');
const manifest=JSON.parse(await fs.readFile(path.join(release,'manifest.json'),'utf8'));
assert.equal(path.basename(manifest.filename),manifest.filename);
const archive=path.join(release,manifest.filename),staging=await fs.mkdtemp(path.join(release,'verify-')),checks=[];
let passed=false,testCount;
try{
  assert.equal(createHash('sha256').update(await fs.readFile(archive)).digest('hex'),manifest.sha256);checks.push('archive checksum');
  const listing=execFileSync('tar',['-tzf',archive],{encoding:'utf8'}).split(/\r?\n/).filter(v=>v&&!v.endsWith('/'));
  assert.ok(listing.every(v=>v.startsWith('package/')&&!v.split('/').includes('..')&&!v.includes('\\')));
  assert.deepEqual(listing.map(v=>v.slice(8)).sort(),[...manifest.files].sort());checks.push('exact file allowlist');
  execFileSync('tar',['-xzf',archive,'-C',staging]);const cwd=path.join(staging,'package');
  for(const file of manifest.files)assert.deepEqual(await fs.readFile(path.join(cwd,file)),await fs.readFile(path.join(root,file)),file);
  checks.push('source contents byte-for-byte');
  const forbidden = /(^|\/)(node_modules|test-project|artifacts|\.codex|\.git)(\/|$)|(^|\/)(installation|connection|settings)\.json$/;
  assert.ok(manifest.files.every(file => !forbidden.test(file)), 'Local project/connection data must not enter release');
  assert.equal(manifest.archives.length, 3);
  const sums = await fs.readFile(path.join(release, 'SHA256SUMS.txt'), 'utf8');
  for (const entry of manifest.archives) {
    assert.equal(path.basename(entry.filename), entry.filename);
    const contents = await fs.readFile(path.join(release, entry.filename));
    assert.equal(createHash('sha256').update(contents).digest('hex'), entry.sha256);
    assert.ok(sums.includes(`${entry.sha256}  ${entry.filename}\n`));
    if (!entry.kind.endsWith('zip')) continue;
    const zipped = readZip(contents);
    const names = entry.files.map(file => entry.prefix + (entry.kind === 'extension-zip' && file.startsWith('extension/') ? file.slice(10) : file));
    assert.deepEqual([...zipped.keys()].sort(), names.sort());
    for (const file of entry.files) {
      const name = entry.prefix + (entry.kind === 'extension-zip' && file.startsWith('extension/') ? file.slice(10) : file);
      assert.deepEqual(zipped.get(name), await fs.readFile(path.join(root, file)), `${entry.kind}: ${file}`);
    }
    checks.push(`${entry.kind}: checksum, exact entries and byte-for-byte source`);
  }
  const npm=process.env.npm_execpath||path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
  const install=execFileSync(process.execPath,[npm,'ci','--ignore-scripts','--no-audit','--no-fund'],{cwd,encoding:'utf8',timeout:120000});console.log(install.trim());checks.push('clean npm ci --ignore-scripts');
  const tests=execFileSync(process.execPath,['--test','--test-reporter=tap','tests/*.test.mjs'],{cwd,encoding:'utf8',timeout:60000});
  testCount=Number(tests.match(/# tests (\d+)/)?.[1]);assert.ok(testCount>0);checks.push(`${testCount} automated tests`);
  const benchmark=JSON.parse(execFileSync(process.execPath,['scripts/benchmark.mjs'],{cwd,encoding:'utf8',timeout:60000}));
  assert.equal(benchmark.compact.tools,4);assert.equal(benchmark.legacy.tools,catalog.length);checks.push(`4 compact/${catalog.length} legacy tool schemas`);
  passed=true;
}finally{
  const resolved=await fs.realpath(staging),relative=path.relative(await fs.realpath(release),resolved);
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('Unsafe staging cleanup');
  await fs.rm(resolved,{recursive:true,force:true});
  const report={passed,time:new Date().toISOString(),version:manifest.version,sha256:manifest.sha256,files:manifest.files.length,archives:manifest.archives?.length,testCount,checks};
  await fs.writeFile(path.join(root,'artifacts/release-check.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
