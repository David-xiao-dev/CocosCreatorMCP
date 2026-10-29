import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class BridgeClient {
  constructor(project, { timeout = 60_000 } = {}) {
    if (!project) throw new Error('A Creator project is required: --project <absolute path> or COCOS_PROJECT_PATH.');
    this.project = path.resolve(project);
    this.timeout = timeout;
  }

  async call(action, params = {}, { timeout = this.timeout } = {}) {
    const requestId = randomUUID();
    let descriptor;
    try {
      descriptor = JSON.parse(await fs.readFile(path.join(this.project, 'temp', 'cocos-mcp', 'connection.json'), 'utf8'));
    } catch {
      throw new Error(`Creator bridge is offline for ${this.project}. Open that project in Creator 3.8.8 and enable cocos-codex-bridge.`);
    }
    const url = new URL(descriptor.url);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/rpc' || url.username || url.password || url.search || url.hash || descriptor.protocol !== 1) {
      throw new Error('Invalid local bridge descriptor. Restart the Creator extension.');
    }
    const actualProject = await fs.realpath(this.project);
    if (path.relative(actualProject, descriptor.project) !== '') throw new Error('Bridge project mismatch.');
    let response;
    try {
      response = await fetch(url, {
        method: 'POST', redirect: 'error',
        headers: { Authorization: `Bearer ${descriptor.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action, params }), signal: AbortSignal.timeout(timeout),
      });
    } catch (error) {
      const failure = new Error(`Bridge request did not return (${error.message}). Execution may still be queued or running. Inspect editor_operation_status with requestId=${requestId}; do not blindly retry a write.`);
      failure.requestId = requestId;
      throw failure;
    }
    const body = await response.json();
    if (!response.ok || !body.ok) {
      const failure = new Error(body.error || `Bridge HTTP ${response.status}`);
      failure.requestId = requestId;
      throw failure;
    }
    return { requestId, result: body.result };
  }
}
