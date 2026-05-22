import { spawnSync } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const AM_VERSION = '0.1.0';
export const AM_DEFAULT_IMPLEMENTATION_DATA_ROOT = 'E:\\work\\AM-data';
export const AM_USER_CONFIG_PATH = path.join(os.homedir(), '.agents-memory', 'am-config.toml');

const AM_MANAGED_BEGIN = '<!-- AM:BEGIN agents-memory v1 -->';
const AM_MANAGED_END = '<!-- AM:END agents-memory v1 -->';

export class AmError extends Error {
  constructor(message, code = 'AM_ERROR') {
    super(message);
    this.name = 'AmError';
    this.code = code;
  }
}

export function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function normalizeSlashes(value) {
  return String(value).replace(/\\/g, path.sep);
}

export async function pathExists(filePath) {
  try {
    await fs.access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function readText(filePath, fallback = '') {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

export async function writeTextAtomic(filePath, content) {
  await ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.am-tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tempPath, content, 'utf8');
  await fs.rename(tempPath, filePath);
}

export async function appendLine(filePath, line) {
  await ensureDir(path.dirname(filePath));
  await fs.appendFile(filePath, `${line}\n`, 'utf8');
}

export function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        options[key] = true;
      } else {
        options[key] = next;
        i += 1;
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, options };
}

export function parseTomlLike(content) {
  const result = {};
  let section = result;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const sectionMatch = line.match(/^\[([^\]]+)]$/);
    if (sectionMatch) {
      section = result;
      for (const part of sectionMatch[1].split('.')) {
        section[part] ||= {};
        section = section[part];
      }
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (!kv) continue;
    const [, key, rawValue] = kv;
    let value = rawValue.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    } else if (value === 'true' || value === 'false') {
      value = value === 'true';
    }
    section[key] = value;
  }
  return result;
}

export function renderToml(config) {
  const lines = [];
  for (const [key, value] of Object.entries(config)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      lines.push(`[${key}]`);
      for (const [childKey, childValue] of Object.entries(value)) {
        lines.push(`${childKey} = ${JSON.stringify(String(childValue))}`);
      }
      lines.push('');
    } else {
      lines.push(`${key} = ${JSON.stringify(String(value))}`);
    }
  }
  return lines.join('\n').trimEnd() + '\n';
}

export async function loadUserConfig() {
  const content = await readText(AM_USER_CONFIG_PATH, '');
  return content ? parseTomlLike(content) : {};
}

export function resolveAmDataRoot(options = {}, userConfig = {}) {
  if (options['am-data-root']) return path.resolve(options['am-data-root']);
  if (process.env.AM_DATA_ROOT) return path.resolve(process.env.AM_DATA_ROOT);
  if (userConfig.paths?.am_data_root) return path.resolve(userConfig.paths.am_data_root);
  return AM_DEFAULT_IMPLEMENTATION_DATA_ROOT;
}

export function expandTemplate(template, values) {
  return String(template).replace(/\{([A-Za-z0-9_]+)}/g, (_, key) => {
    if (values[key] === undefined) return `{${key}}`;
    return values[key];
  });
}

export function pathsFor(amDataRoot, projectId = undefined, sessionId = undefined, projectRoot = undefined, agentName = undefined) {
  const values = {
    am_data_root: amDataRoot,
    project_id: projectId ?? '',
    session_id: sessionId ?? '',
    project_root: projectRoot ?? '',
    agent_name: agentName ?? '',
    date: today(),
  };
  const globalDir = expandTemplate('{am_data_root}\\am-global', values);
  const projectsDir = expandTemplate('{am_data_root}\\am-projects', values);
  const projectDir = projectId ? expandTemplate('{am_data_root}\\am-projects\\{project_id}', values) : undefined;
  const sessionDir = projectId && sessionId ? expandTemplate('{am_data_root}\\am-projects\\{project_id}\\am-sessions\\{session_id}', values) : undefined;
  return {
    amDataRoot,
    configFile: path.join(amDataRoot, 'am-config.toml'),
    globalDir,
    globalMemoryDir: path.join(globalDir, 'am-memory'),
    globalRulesDir: path.join(globalDir, 'am-rules'),
    globalIndex: path.join(globalDir, 'am-index.sqlite'),
    projectsDir,
    projectDir,
    projectConfig: projectDir ? path.join(projectDir, 'am-project.toml') : undefined,
    projectRulesDir: projectDir ? path.join(projectDir, 'am-rules') : undefined,
    projectContextDir: projectDir ? path.join(projectDir, 'am-context') : undefined,
    projectMemoryDir: projectDir ? path.join(projectDir, 'am-memory') : undefined,
    projectSessionsDir: projectDir ? path.join(projectDir, 'am-sessions') : undefined,
    projectIndex: projectDir ? path.join(projectDir, 'am-index.sqlite') : undefined,
    sessionDir,
    sessionFile: sessionDir ? path.join(sessionDir, 'am-session.md') : undefined,
    checkpointsFile: sessionDir ? path.join(sessionDir, 'am-checkpoints.jsonl') : undefined,
    secretsDir: path.join(amDataRoot, 'am-secrets'),
    locksDir: path.join(amDataRoot, 'am-locks'),
  };
}

export async function acquireLock(lockPath, purpose) {
  await ensureDir(path.dirname(lockPath));
  const content = JSON.stringify({ owner: 'agents-memory', purpose, pid: process.pid, createdAt: new Date().toISOString() });
  try {
    const handle = await fs.open(lockPath, 'wx');
    await handle.writeFile(content, 'utf8');
    await handle.close();
    return async () => {
      try {
        await fs.unlink(lockPath);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    };
  } catch (error) {
    if (error.code === 'EEXIST') {
      const lockContent = await readText(lockPath, '');
      throw new AmError(`写锁已存在：${lockPath}\n${lockContent}`, 'AM_LOCK_BUSY');
    }
    throw error;
  }
}

export async function initAm(options = {}) {
  const userConfig = await loadUserConfig();
  const amDataRoot = resolveAmDataRoot(options, userConfig);
  const p = pathsFor(amDataRoot);
  await ensureDir(p.amDataRoot);
  await ensureDir(p.globalMemoryDir);
  await ensureDir(p.globalRulesDir);
  await ensureDir(p.projectsDir);
  await ensureDir(p.secretsDir);
  await ensureDir(p.locksDir);
  if (!(await pathExists(p.configFile))) {
    await writeTextAtomic(p.configFile, renderToml({
      paths: {
        am_data_root: p.amDataRoot,
        am_global_dir: '{am_data_root}\\am-global',
        am_projects_dir: '{am_data_root}\\am-projects',
        am_secrets_dir: '{am_data_root}\\am-secrets',
        am_locks_dir: '{am_data_root}\\am-locks',
      },
    }));
  }
  await ensureIndex(p.globalIndex);
  return { amDataRoot, created: p };
}

export async function registerProject(options) {
  requireOption(options, 'id');
  requireOption(options, 'root');
  const userConfig = await loadUserConfig();
  const amDataRoot = resolveAmDataRoot(options, userConfig);
  await initAm(options);
  const projectId = options.id;
  const projectRoot = path.resolve(options.root);
  const p = pathsFor(amDataRoot, projectId);
  const release = await acquireLock(path.join(p.locksDir, `${projectId}.am.lock`), `register project ${projectId}`);
  try {
    await ensureDir(p.projectRulesDir);
    await ensureDir(p.projectContextDir);
    await ensureDir(p.projectMemoryDir);
    await ensureDir(p.projectSessionsDir);
    await writeTextAtomic(p.projectConfig, renderToml({
      project: {
        id: projectId,
        root: projectRoot,
        created_at: new Date().toISOString(),
      },
    }));
    await writeTextAtomic(path.join(p.projectMemoryDir, 'am-warm.md'), `# ${projectId} 项目稳定记忆\n\n`);
    await appendLine(path.join(p.projectMemoryDir, 'am-cold.events.jsonl'), JSON.stringify({
      type: 'project_registered',
      project_id: projectId,
      project_root: projectRoot,
      created_at: new Date().toISOString(),
    }));
    await ensureIndex(p.projectIndex);
    await indexDocument(p.projectIndex, {
      scope: 'project',
      project_id: projectId,
      kind: 'project',
      title: `项目 ${projectId}`,
      body: projectRoot,
      source_path: p.projectConfig,
      created_at: new Date().toISOString(),
    });
    return { projectId, projectRoot, projectDir: p.projectDir };
  } finally {
    await release();
  }
}

export async function startSession(options) {
  requireOption(options, 'project');
  const userConfig = await loadUserConfig();
  const amDataRoot = resolveAmDataRoot(options, userConfig);
  const projectId = options.project;
  const agentName = options.agent || 'agent';
  const sessionId = options.session || `${agentName}-${Date.now()}`;
  const p = pathsFor(amDataRoot, projectId, sessionId, undefined, agentName);
  if (!(await pathExists(p.projectConfig))) {
    throw new AmError(`项目未注册：${projectId}`, 'AM_PROJECT_NOT_FOUND');
  }
  await ensureDir(p.sessionDir);
  const sessionContent = [
    `# ${projectId} Session`,
    '',
    `- session_id: ${sessionId}`,
    `- agent: ${agentName}`,
    `- created_at: ${new Date().toISOString()}`,
    '- current_goal: ',
    '- current_status: ',
    '- completed: ',
    '- pending: ',
    '- blockers: ',
    '- next_step: ',
    '',
  ].join('\n');
  if (!(await pathExists(p.sessionFile))) await writeTextAtomic(p.sessionFile, sessionContent);
  await appendLine(p.checkpointsFile, JSON.stringify({
    type: 'session_started',
    project_id: projectId,
    session_id: sessionId,
    agent: agentName,
    created_at: new Date().toISOString(),
  }));
  return { projectId, sessionId, sessionFile: p.sessionFile };
}

export async function checkpoint(options) {
  requireOption(options, 'project');
  requireOption(options, 'session');
  const userConfig = await loadUserConfig();
  const amDataRoot = resolveAmDataRoot(options, userConfig);
  const projectId = options.project;
  const sessionId = options.session;
  const reason = options.reason || 'checkpoint';
  const p = pathsFor(amDataRoot, projectId, sessionId);
  const state = options.state || options.message || '';
  const sessionText = state || await readText(p.sessionFile, '');
  const release = await acquireLock(path.join(p.locksDir, `${projectId}.am.lock`), `checkpoint ${projectId}/${sessionId}`);
  try {
    await ensureDir(p.sessionDir);
    if (state) await writeTextAtomic(p.sessionFile, ensureMarkdownTitle(state, `${projectId} Session`));
    const event = {
      type: 'checkpoint',
      project_id: projectId,
      session_id: sessionId,
      reason,
      state: compactText(sessionText, 12000),
      created_at: new Date().toISOString(),
    };
    await appendLine(p.checkpointsFile, JSON.stringify(event));
    await appendLine(path.join(p.projectMemoryDir, 'am-cold.events.jsonl'), JSON.stringify(event));
    await indexDocument(p.projectIndex, {
      scope: 'session',
      project_id: projectId,
      session_id: sessionId,
      kind: 'checkpoint',
      title: `${projectId}/${sessionId} ${reason}`,
      body: event.state,
      source_path: p.checkpointsFile,
      created_at: event.created_at,
    });
    return { projectId, sessionId, reason, checkpointsFile: p.checkpointsFile };
  } finally {
    await release();
  }
}

export async function promote(options) {
  requireOption(options, 'project');
  requireOption(options, 'session');
  const userConfig = await loadUserConfig();
  const amDataRoot = resolveAmDataRoot(options, userConfig);
  const projectId = options.project;
  const sessionId = options.session;
  const p = pathsFor(amDataRoot, projectId, sessionId);
  const release = await acquireLock(path.join(p.locksDir, `${projectId}.am.lock`), `promote ${projectId}/${sessionId}`);
  try {
    const sessionText = await readText(p.sessionFile, '');
    const warmFile = path.join(p.projectMemoryDir, 'am-warm.md');
    const coldFile = path.join(p.projectMemoryDir, 'am-cold.events.jsonl');
    const warmEntry = [
      '',
      `## Session ${sessionId} 晋升记录`,
      '',
      `- 时间：${new Date().toISOString()}`,
      `- 来源：${p.sessionFile}`,
      '- 摘要：',
      indentLines(compactText(sessionText, 4000), '  '),
      '',
    ].join('\n');
    await fs.appendFile(warmFile, warmEntry, 'utf8');
    const event = {
      type: 'promote',
      project_id: projectId,
      session_id: sessionId,
      summary: compactText(sessionText, 8000),
      created_at: new Date().toISOString(),
    };
    await appendLine(coldFile, JSON.stringify(event));
    await indexDocument(p.projectIndex, {
      scope: 'project',
      project_id: projectId,
      session_id: sessionId,
      kind: 'promote',
      title: `Session ${sessionId} 晋升记录`,
      body: event.summary,
      source_path: warmFile,
      created_at: event.created_at,
    });
    return { projectId, sessionId, warmFile, coldFile };
  } finally {
    await release();
  }
}

export async function getContext(options) {
  requireOption(options, 'project');
  const query = options.query || '';
  const sessionId = options.session;
  const userConfig = await loadUserConfig();
  const amDataRoot = resolveAmDataRoot(options, userConfig);
  const projectId = options.project;
  const p = pathsFor(amDataRoot, projectId, sessionId);
  const projectRules = await readText(path.join(p.projectRulesDir, 'am-rules.md'), '');
  const warm = await readText(path.join(p.projectMemoryDir, 'am-warm.md'), '');
  const session = sessionId ? await readText(p.sessionFile, '') : '';
  const results = await search({ ...options, scope: 'global,project', query, limit: options.limit || 8 });
  const context = [
    '# agents-memory Context Pack',
    '',
    '## Project Rules',
    compactText(projectRules, 3000) || '- 无项目规则摘要。',
    '',
    '## Session State',
    compactText(session, 4000) || '- 无 session 状态。',
    '',
    '## Project Warm Memory',
    compactText(warm, 5000) || '- 无项目稳定记忆。',
    '',
    '## Search Hits',
    results.items.map((item, index) => `${index + 1}. [${item.kind}] ${item.title}\n   source: ${item.source_path}\n   ${compactText(item.body, 600)}`).join('\n') || '- 无命中。',
    '',
  ].join('\n');
  return { projectId, sessionId, query, context: compactText(context, 20000), hits: results.items };
}

export async function search(options) {
  const query = options.query || '';
  const limit = Number(options.limit || 10);
  const userConfig = await loadUserConfig();
  const amDataRoot = resolveAmDataRoot(options, userConfig);
  const scopes = String(options.scope || 'global,project').split(',').map((scope) => scope.trim());
  const projectId = options.project;
  const p = pathsFor(amDataRoot, projectId);
  const indexFiles = [];
  if (scopes.includes('global')) indexFiles.push(p.globalIndex);
  if (scopes.includes('project') && projectId) indexFiles.push(p.projectIndex);
  const items = [];
  for (const indexFile of indexFiles) {
    items.push(...await searchIndex(indexFile, query, limit));
  }
  if (!items.length && projectId) {
    items.push(...await fallbackSearchProject(p.projectDir, query, limit));
  }
  return { query, items: items.slice(0, limit) };
}

export async function rebuildIndex(options) {
  requireOption(options, 'project');
  const userConfig = await loadUserConfig();
  const amDataRoot = resolveAmDataRoot(options, userConfig);
  const projectId = options.project;
  const p = pathsFor(amDataRoot, projectId);
  if (!(await pathExists(p.projectDir))) {
    throw new AmError(`项目未注册：${projectId}`, 'AM_PROJECT_NOT_FOUND');
  }
  if (await pathExists(p.projectIndex)) await fs.unlink(p.projectIndex);
  await ensureIndex(p.projectIndex);
  const files = await listFiles(p.projectDir);
  let indexed = 0;
  for (const filePath of files.filter((file) => /\.(md|jsonl|toml)$/i.test(file))) {
    if (path.basename(filePath) === 'am-index.sqlite') continue;
    const body = await readText(filePath, '');
    await indexDocument(p.projectIndex, {
      scope: 'project',
      project_id: projectId,
      kind: path.extname(filePath).slice(1) || 'file',
      title: path.basename(filePath),
      body: compactText(body, 20000),
      source_path: filePath,
      created_at: new Date().toISOString(),
    });
    indexed += 1;
  }
  return { projectId, index: p.projectIndex, indexed };
}

export async function secretGet(options) {
  requireOption(options, 'ref');
  const userConfig = await loadUserConfig();
  const amDataRoot = resolveAmDataRoot(options, userConfig);
  const p = pathsFor(amDataRoot);
  const secretFile = path.join(p.secretsDir, 'am-secrets.local.json');
  const content = await readText(secretFile, '{}');
  const json = JSON.parse(content || '{}');
  const value = options.ref.split('.').reduce((acc, key) => acc?.[key], json);
  if (value === undefined) throw new AmError(`未找到 secret_ref：${options.ref}`, 'AM_SECRET_NOT_FOUND');
  return { ref: options.ref, value };
}

export async function doctor(options = {}) {
  const userConfig = await loadUserConfig();
  const amDataRoot = resolveAmDataRoot(options, userConfig);
  const p = pathsFor(amDataRoot, options.project);
  const checks = [];
  checks.push(await checkPath('am_data_root', p.amDataRoot));
  checks.push(await checkPath('am_global', p.globalDir));
  checks.push(await checkPath('am_projects', p.projectsDir));
  if (options.project) {
    checks.push(await checkPath('am_project', p.projectDir));
    checks.push(await checkPath('am_project_config', p.projectConfig));
    checks.push(await checkPath('am_project_index', p.projectIndex));
  }
  checks.push({ name: 'sqlite3', ok: hasSqlite(), detail: hasSqlite() ? 'available' : 'not found; fallback search will be used' });
  if (hasSqlite()) {
    const probeIndex = p.projectIndex || p.globalIndex;
    await ensureDir(path.dirname(probeIndex));
    checks.push({ name: 'sqlite_fts5', ok: sqliteSupportsFts5(probeIndex), detail: sqliteSupportsFts5(probeIndex) ? 'available' : 'not available; LIKE/file fallback will be used' });
  }
  return { amDataRoot, checks };
}

export async function installRules(options) {
  requireOption(options, 'target');
  requireOption(options, 'project');
  const target = options.target;
  const projectRoot = path.resolve(options.root || process.cwd());
  const fileName = {
    codex: 'AGENTS.md',
    claude: 'CLAUDE.md',
    cursor: '.cursorrules',
  }[target];
  if (!fileName) throw new AmError(`不支持的 target：${target}`, 'AM_BAD_TARGET');
  const filePath = path.join(projectRoot, fileName);
  const backupDir = path.join(projectRoot, 'am-backups');
  const block = renderRuleBlock(options.project, target);
  await ensureDir(backupDir);
  if (await pathExists(filePath)) {
    const original = await fs.readFile(filePath);
    await fs.writeFile(path.join(backupDir, `${fileName}.${timestamp()}.bak`), original);
    await fs.appendFile(filePath, `${os.EOL}${os.EOL}${block}${os.EOL}`, 'utf8');
  } else {
    await writeTextAtomic(filePath, `${block}${os.EOL}`);
  }
  return { target, filePath, backupDir };
}

function renderRuleBlock(projectId, target) {
  return [
    AM_MANAGED_BEGIN,
    `# agents-memory rules for ${target}`,
    '',
    `- Project ID: \`${projectId}\``,
    '- Start of turn: call `am.get_context` or `am get-context` before answering project-specific requests.',
    '- End of turn: call `am.checkpoint` or `am checkpoint` with concise Chinese task state.',
    '- Before context compaction: call checkpoint with `reason=pre-compact` when the runtime exposes such a hook.',
    '- Do not store chain-of-thought, full chat logs, long terminal logs, or secrets in normal memory.',
    '- Store only `secret_ref` in normal memory; read real values through `am.secret_get`.',
    AM_MANAGED_END,
  ].join('\n');
}

export async function ensureIndex(indexFile) {
  await ensureDir(path.dirname(indexFile));
  if (!hasSqlite()) return false;
  const sql = 'CREATE TABLE IF NOT EXISTS am_documents (id INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT, project_id TEXT, session_id TEXT, kind TEXT, title TEXT, body TEXT, source_path TEXT, created_at TEXT);';
  runSqlite(indexFile, sql);
  if (sqliteSupportsFts5(indexFile)) {
    const ftsSql = [
      'CREATE VIRTUAL TABLE IF NOT EXISTS am_documents_fts USING fts5(title, body, content="am_documents", content_rowid="id");',
      'CREATE TRIGGER IF NOT EXISTS am_documents_ai AFTER INSERT ON am_documents BEGIN INSERT INTO am_documents_fts(rowid,title,body) VALUES (new.id,new.title,new.body); END;',
    ].join('\n');
    runSqlite(indexFile, ftsSql);
  }
  return true;
}

export async function indexDocument(indexFile, doc) {
  if (!await ensureIndex(indexFile)) return false;
  const sql = `INSERT INTO am_documents(scope, project_id, session_id, kind, title, body, source_path, created_at) VALUES (${sqlValue(doc.scope)}, ${sqlValue(doc.project_id)}, ${sqlValue(doc.session_id || '')}, ${sqlValue(doc.kind)}, ${sqlValue(doc.title)}, ${sqlValue(doc.body)}, ${sqlValue(doc.source_path)}, ${sqlValue(doc.created_at || new Date().toISOString())});`;
  runSqlite(indexFile, sql);
  return true;
}

export async function searchIndex(indexFile, query, limit) {
  if (!hasSqlite() || !(await pathExists(indexFile))) return [];
  const safeLimit = Number.isFinite(limit) ? limit : 10;
  const matchExpr = query ? query.replace(/"/g, ' ') : '';
  const hasFts = sqliteHasTable(indexFile, 'am_documents_fts');
  const likeTerms = String(query || '').split(/\s+/).map((term) => term.trim()).filter(Boolean);
  const likeWhere = likeTerms.length
    ? likeTerms.map((term) => {
      const likeExpr = `%${term.replace(/[%_]/g, ' ')}%`;
      return `(title LIKE ${sqlValue(likeExpr)} OR body LIKE ${sqlValue(likeExpr)})`;
    }).join(' AND ')
    : '1=1';
  const sql = matchExpr && hasFts
    ? `SELECT kind, title, body, source_path, created_at FROM am_documents JOIN am_documents_fts ON am_documents.id = am_documents_fts.rowid WHERE am_documents_fts MATCH ${sqlValue(matchExpr)} ORDER BY rank LIMIT ${safeLimit};`
    : matchExpr
      ? `SELECT kind, title, body, source_path, created_at FROM am_documents WHERE ${likeWhere} ORDER BY id DESC LIMIT ${safeLimit};`
      : `SELECT kind, title, body, source_path, created_at FROM am_documents ORDER BY id DESC LIMIT ${safeLimit};`;
  const output = runSqlite(indexFile, sql, true);
  return output.split(/\r?\n/).filter(Boolean).map((line) => {
    const [kind, title, body, source_path, created_at] = line.split('\t');
    return { kind, title, body, source_path, created_at };
  });
}

function sqliteSupportsFts5(indexFile) {
  try {
    runSqlite(indexFile, 'CREATE VIRTUAL TABLE IF NOT EXISTS am_fts5_probe USING fts5(value); DROP TABLE IF EXISTS am_fts5_probe;');
    return true;
  } catch {
    return false;
  }
}

function sqliteHasTable(indexFile, tableName) {
  try {
    const output = runSqlite(indexFile, `SELECT name FROM sqlite_master WHERE type='table' AND name=${sqlValue(tableName)};`, true);
    return output.trim() === tableName;
  } catch {
    return false;
  }
}

export async function fallbackSearchProject(projectDir, query, limit) {
  if (!projectDir || !(await pathExists(projectDir))) return [];
  const files = await listFiles(projectDir);
  const needle = String(query || '').toLowerCase();
  const items = [];
  for (const filePath of files.filter((file) => /\.(md|jsonl|toml)$/i.test(file))) {
    const content = await readText(filePath, '');
    if (!needle || content.toLowerCase().includes(needle)) {
      items.push({
        kind: 'file',
        title: path.basename(filePath),
        body: compactText(content, 2000),
        source_path: filePath,
        created_at: '',
      });
    }
    if (items.length >= limit) break;
  }
  return items;
}

async function listFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(entryPath));
    else files.push(entryPath);
  }
  return files;
}

async function checkPath(name, targetPath) {
  if (!targetPath) return { name, ok: false, detail: 'not configured' };
  return {
    name,
    ok: await pathExists(targetPath),
    detail: targetPath,
  };
}

function hasSqlite() {
  const result = spawnSync('sqlite3', ['--version'], { encoding: 'utf8' });
  return result.status === 0;
}

function runSqlite(indexFile, sql, capture = false) {
  const args = capture
    ? ['-separator', '\t', indexFile, sql]
    : [indexFile, sql];
  const result = spawnSync('sqlite3', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new AmError(`sqlite3 执行失败：${result.stderr || result.stdout}`, 'AM_SQLITE_ERROR');
  }
  return result.stdout || '';
}

function sqlValue(value) {
  if (value === undefined || value === null) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function requireOption(options, key) {
  if (!options[key]) throw new AmError(`缺少参数 --${key}`, 'AM_MISSING_OPTION');
}

function compactText(value, maxLength) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n... [truncated by agents-memory]`;
}

function ensureMarkdownTitle(content, title) {
  const text = String(content || '').trim();
  if (text.startsWith('#')) return `${text}\n`;
  return `# ${title}\n\n${text}\n`;
}

function indentLines(value, prefix) {
  return String(value || '').split(/\r?\n/).map((line) => `${prefix}${line}`).join('\n');
}
