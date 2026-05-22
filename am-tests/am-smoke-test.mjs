import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  checkpoint,
  doctor,
  getContext,
  initAm,
  installRules,
  promote,
  rebuildIndex,
  registerProject,
  search,
  startSession,
} from '../am-src/am-core.mjs';

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'am-test-'));
const dataRoot = path.join(tempRoot, 'am-data');
const projectRoot = path.join(tempRoot, 'project');
await fs.mkdir(projectRoot, { recursive: true });
await fs.writeFile(path.join(projectRoot, 'AGENTS.md'), '# User Rules\n\nKeep this line.\n', 'utf8');

await initAm({ 'am-data-root': dataRoot });
await registerProject({ 'am-data-root': dataRoot, id: 'demo', root: projectRoot });
const session = await startSession({ 'am-data-root': dataRoot, project: 'demo', agent: 'codex' });

await checkpoint({
  'am-data-root': dataRoot,
  project: 'demo',
  session: session.sessionId,
  reason: 'pre-compact',
  state: '- 当前目标：测试 checkpoint\n- 当前状态：通过\n',
});

await promote({ 'am-data-root': dataRoot, project: 'demo', session: session.sessionId });
await installRules({ 'am-data-root': dataRoot, target: 'codex', project: 'demo', root: projectRoot });

const rulesContent = await fs.readFile(path.join(projectRoot, 'AGENTS.md'), 'utf8');
assert.match(rulesContent, /Keep this line\./);
assert.match(rulesContent, /AM:BEGIN agents-memory v1/);

const backups = await fs.readdir(path.join(projectRoot, 'am-backups'));
assert.equal(backups.length, 1);

const context = await getContext({
  'am-data-root': dataRoot,
  project: 'demo',
  session: session.sessionId,
  query: 'checkpoint',
});
assert.match(context.context, /agents-memory Context Pack/);

const searchResult = await search({ 'am-data-root': dataRoot, project: 'demo', scope: 'project', query: 'checkpoint' });
assert.ok(Array.isArray(searchResult.items));

const rebuilt = await rebuildIndex({ 'am-data-root': dataRoot, project: 'demo' });
assert.ok(rebuilt.indexed >= 1);

const doctorResult = await doctor({ 'am-data-root': dataRoot, project: 'demo' });
assert.ok(doctorResult.checks.some((check) => check.name === 'am_project'));

const coldPath = path.join(dataRoot, 'am-projects', 'demo', 'am-memory', 'am-cold.events.jsonl');
const coldContent = await fs.readFile(coldPath, 'utf8');
assert.match(coldContent, /checkpoint/);
assert.match(coldContent, /promote/);

console.log(JSON.stringify({ ok: true, tempRoot, sessionId: session.sessionId }, null, 2));
