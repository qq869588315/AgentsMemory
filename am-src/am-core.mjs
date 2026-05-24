import { spawnSync } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const AM_VERSION = '0.1.0';
export const AM_DEFAULT_USER_DATA_ROOT = path.join(os.homedir(), '.agents-memory', 'am-data');

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

export function expandUserPath(value) {
  const text = String(value ?? '');
  if (!text) return text;
  if (text === '~') return os.homedir();
  if (text.startsWith('~/') || text.startsWith('~\\')) {
    return path.join(os.homedir(), text.slice(2));
  }
  return text;
}

export function resolvePathLike(value) {
  return path.resolve(expandUserPath(value));
}

export function displayConfigPath(value) {
  const resolved = resolvePathLike(value);
  if (resolved === AM_DEFAULT_USER_DATA_ROOT) return '~/.agents-memory/am-data';
  return resolved;
}

export function getUserConfigPath() {
  return path.join(os.homedir(), '.agents-memory', 'am-config.toml');
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
  try {
    await fs.rename(tempPath, filePath);
  } catch (error) {
    if (error.code === 'EEXIST' || error.code === 'EPERM') {
      await fs.rm(filePath, { force: true });
      await fs.rename(tempPath, filePath);
      return;
    }
    throw error;
  }
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
  const content = await readText(getUserConfigPath(), '');
  return content ? parseTomlLike(content) : {};
}

export function resolveAmDataRoot(options = {}, userConfig = {}) {
  if (options['am-data-root']) return resolvePathLike(options['am-data-root']);
  if (process.env.AM_DATA_ROOT) return resolvePathLike(process.env.AM_DATA_ROOT);
  if (userConfig.paths?.am_data_root) return resolvePathLike(userConfig.paths.am_data_root);
  return AM_DEFAULT_USER_DATA_ROOT;
}

export function expandTemplate(template, values) {
  return String(template).replace(/\{([A-Za-z0-9_]+)}/g, (_, key) => {
    if (values[key] === undefined) return `{${key}}`;
    return values[key];
  });
}

export function pathsFor(amDataRoot, projectId = undefined, sessionId = undefined, projectRoot = undefined, agentName = undefined, pathConfig = {}) {
  const values = {
    am_data_root: amDataRoot,
    home_dir: os.homedir(),
    project_id: projectId ?? '',
    session_id: sessionId ?? '',
    project_root: projectRoot ?? '',
    agent_name: agentName ?? '',
    date: today(),
  };
  const globalDir = resolvePathLike(expandTemplate(pathConfig.am_global_dir || '{am_data_root}/am-global', values));
  const projectsDir = resolvePathLike(expandTemplate(pathConfig.am_projects_dir || '{am_data_root}/am-projects', values));
  const secretsDir = resolvePathLike(expandTemplate(pathConfig.am_secrets_dir || '{am_data_root}/am-secrets', values));
  const locksDir = resolvePathLike(expandTemplate(pathConfig.am_locks_dir || '{am_data_root}/am-locks', values));
  const projectDir = projectId ? path.join(projectsDir, projectId) : undefined;
  const sessionDir = projectId && sessionId ? path.join(projectDir, 'am-sessions', sessionId) : undefined;
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
    projectActiveFile: projectDir ? path.join(projectDir, 'am-active.json') : undefined,
    projectRulesDir: projectDir ? path.join(projectDir, 'am-rules') : undefined,
    projectContextDir: projectDir ? path.join(projectDir, 'am-context') : undefined,
    projectMemoryDir: projectDir ? path.join(projectDir, 'am-memory') : undefined,
    projectSessionsDir: projectDir ? path.join(projectDir, 'am-sessions') : undefined,
    projectIndex: projectDir ? path.join(projectDir, 'am-index.sqlite') : undefined,
    sessionDir,
    sessionFile: sessionDir ? path.join(sessionDir, 'am-session.md') : undefined,
    checkpointsFile: sessionDir ? path.join(sessionDir, 'am-checkpoints.jsonl') : undefined,
    secretsDir,
    locksDir,
  };
}

export async function acquireLock(lockPath, purpose, options = {}) {
  await ensureDir(path.dirname(lockPath));
  const timeoutMs = Number(options.timeoutMs || 5000);
  const retryMs = Number(options.retryMs || 25);
  const staleMs = Number(options.staleMs || 10 * 60 * 1000);
  const startedAt = Date.now();
  const content = JSON.stringify({ owner: 'agents-memory', purpose, pid: process.pid, createdAt: new Date().toISOString() });
  while (true) {
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
      if (error.code !== 'EEXIST') throw error;
      const lockContent = await readText(lockPath, '');
      if (isStaleLock(lockContent, staleMs)) {
        await fs.rm(lockPath, { force: true });
        continue;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        throw new AmError(`写锁已存在：${lockPath}\n${lockContent}`, 'AM_LOCK_BUSY');
      }
      await sleep(retryMs);
    }
  }
}

export async function initAm(options = {}) {
  const userConfig = await loadUserConfig();
  const amDataRoot = resolveAmDataRoot(options, userConfig);
  const p = pathsFor(amDataRoot, undefined, undefined, undefined, undefined, userConfig.paths);
  await ensureDir(p.amDataRoot);
  await ensureDir(p.globalMemoryDir);
  await ensureDir(p.globalRulesDir);
  await ensureDir(p.projectsDir);
  await ensureDir(p.secretsDir);
  await ensureDir(p.locksDir);
  if (!(await pathExists(p.configFile))) {
    await writeTextAtomic(p.configFile, renderToml({
      paths: {
        am_data_root: displayConfigPath(p.amDataRoot),
        am_global_dir: '{am_data_root}/am-global',
        am_projects_dir: '{am_data_root}/am-projects',
        am_secrets_dir: '{am_data_root}/am-secrets',
        am_locks_dir: '{am_data_root}/am-locks',
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
  const p = pathsFor(amDataRoot, projectId, undefined, undefined, undefined, userConfig.paths);
  const release = await acquireLock(path.join(p.locksDir, `${projectId}.am.lock`), `register project ${projectId}`);
  try {
    await ensureDir(p.projectRulesDir);
    await ensureDir(p.projectContextDir);
    await ensureDir(p.projectMemoryDir);
    await ensureDir(p.projectSessionsDir);
    await ensureActiveIndex(p.projectActiveFile, projectId);
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
  const taskName = options.task || options['task-name'] || '';
  const worktree = options.worktree || options['worktree-root'] || '';
  const sessionId = options.session || `${agentName}-${Date.now()}`;
  const p = pathsFor(amDataRoot, projectId, sessionId, undefined, agentName, userConfig.paths);
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
  await upsertActiveEntry(p, {
    project_id: projectId,
    session_id: sessionId,
    agent: agentName,
    task: taskName,
    worktree,
    status: 'active',
    summary: `session started: ${agentName}`,
    session_file: p.sessionFile,
    checkpoints_file: p.checkpointsFile,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
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
  const p = pathsFor(amDataRoot, projectId, sessionId, undefined, undefined, userConfig.paths);
  const state = await readCheckpointState(options);
  const sessionText = state || await readText(p.sessionFile, '');
  const release = await acquireLock(path.join(p.locksDir, `${projectId}.am.lock`), `checkpoint ${projectId}/${sessionId}`);
  try {
    await ensureDir(p.sessionDir);
    if (state) await writeTextAtomic(p.sessionFile, ensureMarkdownTitle(state, `${projectId} Session`));
    const now = new Date().toISOString();
    const event = {
      type: 'checkpoint',
      project_id: projectId,
      session_id: sessionId,
      reason,
      state: compactText(sessionText, 12000),
      created_at: now,
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
    await upsertActiveEntry(p, {
      project_id: projectId,
      session_id: sessionId,
      status: options.status || 'active',
      summary: summarizeState(sessionText),
      last_reason: reason,
      last_checkpoint_at: now,
      session_file: p.sessionFile,
      checkpoints_file: p.checkpointsFile,
      updated_at: now,
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
  const p = pathsFor(amDataRoot, projectId, sessionId, undefined, undefined, userConfig.paths);
  const release = await acquireLock(path.join(p.locksDir, `${projectId}.am.lock`), `promote ${projectId}/${sessionId}`);
  try {
    const sessionText = await readText(p.sessionFile, '');
    const warmFile = path.join(p.projectMemoryDir, 'am-warm.md');
    const coldFile = path.join(p.projectMemoryDir, 'am-cold.events.jsonl');
    const now = new Date().toISOString();
    const warmEntry = [
      '',
      `## Session ${sessionId} 晋升记录`,
      '',
      `- 时间：${now}`,
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
      created_at: now,
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
    await upsertActiveEntry(p, {
      project_id: projectId,
      session_id: sessionId,
      status: 'completed',
      summary: summarizeState(sessionText),
      completed_at: now,
      promoted_at: now,
      session_file: p.sessionFile,
      checkpoints_file: p.checkpointsFile,
      updated_at: now,
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
  const p = pathsFor(amDataRoot, projectId, sessionId, undefined, undefined, userConfig.paths);
  const projectRules = await readText(path.join(p.projectRulesDir, 'am-rules.md'), '');
  const activeIndex = await readText(p.projectActiveFile, '');
  const warm = await readText(path.join(p.projectMemoryDir, 'am-warm.md'), '');
  const session = sessionId ? await readText(p.sessionFile, '') : '';
  const results = await search({ ...options, scope: 'global,project', query, limit: options.limit || 8 });
  const context = [
    '# agents-memory Context Pack',
    '',
    '## Project Rules',
    compactText(projectRules, 3000) || '- 无项目规则摘要。',
    '',
    '## Project Active Index',
    compactText(activeIndex, 3000) || '- 无 active 索引。',
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
  const debug = Boolean(options.debug);
  const scopes = String(options.scope || 'global,project').split(',').map((scope) => scope.trim());
  const projectId = options.project;
  const p = pathsFor(amDataRoot, projectId, undefined, undefined, undefined, userConfig.paths);
  const indexFiles = [];
  const searchDirs = [];
  if (scopes.includes('global')) {
    indexFiles.push(p.globalIndex);
    searchDirs.push(p.globalDir);
  }
  if (scopes.includes('project') && projectId) {
    indexFiles.push(p.projectIndex);
    searchDirs.push(p.projectDir);
  }
  const items = [];
  const metrics = { ripgrep: 0, sqlite: 0, fallback: 0 };
  for (const searchDir of searchDirs) {
    const rgItems = await searchWithRipgrep(searchDir, query, limit);
    metrics.ripgrep += rgItems.length;
    items.push(...rgItems);
  }
  if (items.length >= limit) {
    return buildSearchResult(query, dedupeSearchItems(items), limit, debug, metrics, 'ripgrep-first');
  }
  for (const indexFile of indexFiles) {
    try {
      const sqliteItems = await searchIndex(indexFile, query, limit);
      metrics.sqlite += sqliteItems.length;
      items.push(...sqliteItems);
    } catch {
      // SQLite is a rebuildable index layer; search must still work from source files.
    }
  }
  if (!items.length) {
    for (const searchDir of searchDirs) {
      const fallbackItems = await fallbackSearchProject(searchDir, query, limit);
      metrics.fallback += fallbackItems.length;
      items.push(...fallbackItems);
    }
  }
  return buildSearchResult(query, dedupeSearchItems(items), limit, debug, metrics, 'hybrid');
}

export async function rebuildIndex(options) {
  requireOption(options, 'project');
  const userConfig = await loadUserConfig();
  const amDataRoot = resolveAmDataRoot(options, userConfig);
  const projectId = options.project;
  const p = pathsFor(amDataRoot, projectId, undefined, undefined, undefined, userConfig.paths);
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
  const { store } = await loadSecretStore(options);
  const value = resolveByRef(store, options.ref);
  if (value === undefined) throw new AmError(`未找到 secret_ref：${options.ref}`, 'AM_SECRET_NOT_FOUND');
  return { ref: options.ref, value };
}

export async function secretSet(options) {
  requireOption(options, 'ref');
  const value = await readRequestedText(options, 'value', 'value-file');
  const { secretFile, store, release } = await lockAndLoadSecretStore(options, 'set secret');
  try {
    setByRef(store, options.ref, value);
    await saveSecretStore(secretFile, store);
    return { ref: options.ref, secretFile };
  } finally {
    await release();
  }
}

export async function secretList(options) {
  const { store, release } = await lockAndLoadSecretStore(options, 'list secrets');
  try {
    const prefix = String(options.prefix || '').trim();
    const refs = flattenRefs(store).filter((ref) => !prefix || ref === prefix || ref.startsWith(`${prefix}.`)).map((ref) => ({ ref }));
    return { items: refs };
  } finally {
    await release();
  }
}

export async function secretUpdate(options) {
  requireOption(options, 'ref');
  const value = await readRequestedText(options, 'value', 'value-file');
  const { secretFile, store, release } = await lockAndLoadSecretStore(options, 'update secret');
  try {
    if (resolveByRef(store, options.ref) === undefined) {
      throw new AmError(`未找到 secret_ref：${options.ref}`, 'AM_SECRET_NOT_FOUND');
    }
    setByRef(store, options.ref, value);
    await saveSecretStore(secretFile, store);
    return { ref: options.ref, secretFile };
  } finally {
    await release();
  }
}

export async function secretRemove(options) {
  requireOption(options, 'ref');
  const { secretFile, store, release } = await lockAndLoadSecretStore(options, 'remove secret');
  try {
    if (!deleteByRef(store, options.ref)) {
      throw new AmError(`未找到 secret_ref：${options.ref}`, 'AM_SECRET_NOT_FOUND');
    }
    await saveSecretStore(secretFile, store);
    return { ref: options.ref, secretFile };
  } finally {
    await release();
  }
}

export async function doctor(options = {}) {
  const userConfig = await loadUserConfig();
  const amDataRoot = resolveAmDataRoot(options, userConfig);
  const p = pathsFor(amDataRoot, options.project, undefined, undefined, undefined, userConfig.paths);
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
  checks.push({ name: 'ripgrep', ok: hasRipgrep(), detail: hasRipgrep() ? 'available; live lexical search enabled' : 'not found; SQLite/file fallback will be used' });
  return { amDataRoot, checks };
}

export async function migrateLegacy(options) {
  requireOption(options, 'project');
  requireOption(options, 'session');
  const userConfig = await loadUserConfig();
  const amDataRoot = resolveAmDataRoot(options, userConfig);
  const projectId = options.project;
  const sessionId = options.session;
  const p = pathsFor(amDataRoot, projectId, sessionId, undefined, undefined, userConfig.paths);
  if (!(await pathExists(p.projectConfig))) {
    throw new AmError(`项目未注册：${projectId}`, 'AM_PROJECT_NOT_FOUND');
  }
  const sources = {
    hot: options.hot ? path.resolve(options.hot) : '',
    warm: options.warm ? path.resolve(options.warm) : '',
    cold: options.cold ? path.resolve(options.cold) : '',
  };
  const dryRun = Boolean(options.dryRun || options['dry-run']);
  const hotText = sources.hot ? await readText(sources.hot, '') : '';
  const warmText = sources.warm ? await readText(sources.warm, '') : '';
  const coldText = sources.cold ? await readText(sources.cold, '') : '';
  const plan = buildLegacyMigrationPlan({ projectId, sessionId, p, sources, hotText, warmText, coldText });
  if (dryRun) {
    return { dryRun: true, projectId, sessionId, plan };
  }
  const release = await acquireLock(path.join(p.locksDir, `${projectId}.am.lock`), `migrate legacy ${projectId}/${sessionId}`);
  try {
    await ensureDir(p.sessionDir);
    await ensureDir(p.projectMemoryDir);
    await ensureDir(path.dirname(p.checkpointsFile));
    const now = new Date().toISOString();
    if (sources.hot) {
      await writeTextAtomic(p.sessionFile, ensureMarkdownTitle(stripSensitiveLines(hotText).text || '', `${projectId} Session`));
      const event = {
        type: 'legacy_hot_import',
        project_id: projectId,
        session_id: sessionId,
        source_path: sources.hot,
        imported_at: now,
        summary: summarizeState(hotText),
      };
      await appendLine(p.checkpointsFile, JSON.stringify(event));
      await indexDocument(p.projectIndex, {
        scope: 'session',
        project_id: projectId,
        session_id: sessionId,
        kind: 'legacy_hot_import',
        title: `Legacy hot import ${sessionId}`,
        body: event.summary,
        source_path: p.sessionFile,
        created_at: now,
      });
    }
    const warmFile = path.join(p.projectMemoryDir, 'am-warm.md');
    if (sources.warm) {
      const cleaned = stripSensitiveLines(warmText);
      const warmEntry = [
        '',
        `## Legacy Warm Import ${sessionId}`,
        '',
        `- 时间：${now}`,
        `- 来源：${sources.warm}`,
        `- 跳过行数：${cleaned.skippedCount}`,
        '- 内容：',
        indentLines(cleaned.text || '- 无可导入内容。', '  '),
        '',
      ].join('\n');
      await fs.appendFile(warmFile, warmEntry, 'utf8');
      await indexDocument(p.projectIndex, {
        scope: 'project',
        project_id: projectId,
        session_id: sessionId,
        kind: 'legacy_warm_import',
        title: `Legacy warm import ${sessionId}`,
        body: summarizeState(cleaned.text),
        source_path: warmFile,
        created_at: now,
      });
    }
    const coldFile = path.join(p.projectMemoryDir, 'am-cold.events.jsonl');
    const coldEvents = parseLegacyColdEvents(coldText, sources.cold, projectId, sessionId);
    for (const event of coldEvents.events) {
      await appendLine(coldFile, JSON.stringify(event));
    }
    for (const item of coldEvents.indexItems) {
      await indexDocument(p.projectIndex, item);
    }
    const report = buildLegacyMigrationReport({ projectId, sessionId, sources, hotText, warmText, coldText, plan, coldEvents });
    const reportPath = path.join(p.projectMemoryDir, 'am-migration-report.md');
    await writeTextAtomic(reportPath, report);
    await rebuildIndex({ project: projectId, 'am-data-root': amDataRoot });
    await upsertActiveEntry(p, {
      project_id: projectId,
      session_id: sessionId,
      status: 'completed',
      summary: `legacy migration completed: ${sessionId}`,
      completed_at: now,
      updated_at: now,
      session_file: p.sessionFile,
      checkpoints_file: p.checkpointsFile,
    });
    return { projectId, sessionId, reportPath, plan };
  } finally {
    await release();
  }
}

export async function docCheck() {
  const files = [
    path.resolve('README.md'),
    path.resolve('am-docs/am-developer-guide.md'),
    path.resolve('am-docs/am-user-manual.md'),
    path.resolve('am-docs/am-architecture.md'),
    path.resolve('am-docs/am-implementation-standard.md'),
    path.resolve('am-docs/am-roadmap.md'),
  ];
  const contents = {};
  for (const file of files) contents[file] = await readText(file, '');
  const requirements = [
    ['am active list', ['README.md', 'am-docs/am-user-manual.md', 'am-docs/am-developer-guide.md']],
    ['secret set', ['README.md', 'am-docs/am-user-manual.md', 'am-docs/am-developer-guide.md']],
    ['migrate legacy', ['README.md', 'am-docs/am-user-manual.md', 'am-docs/am-developer-guide.md', 'am-docs/am-roadmap.md']],
    ['doc-check', ['README.md', 'am-docs/am-developer-guide.md', 'am-docs/am-user-manual.md', 'am-docs/am-roadmap.md']],
    ['state-file', ['am-docs/am-user-manual.md', 'am-docs/am-developer-guide.md', 'am-docs/am-roadmap.md']],
    ['ripgrep', ['am-docs/am-user-manual.md', 'am-docs/am-developer-guide.md', 'am-docs/am-implementation-standard.md']],
  ];
  const missing = [];
  for (const [needle, candidateFiles] of requirements) {
    if (!candidateFiles.some((file) => contents[path.resolve(file)].includes(needle))) {
      missing.push(needle);
    }
  }
  return { ok: missing.length === 0, missing, checkedFiles: files };
}

export async function activeList(options) {
  requireOption(options, 'project');
  const userConfig = await loadUserConfig();
  const amDataRoot = resolveAmDataRoot(options, userConfig);
  const p = pathsFor(amDataRoot, options.project, undefined, undefined, undefined, userConfig.paths);
  const index = await loadActiveIndex(p.projectActiveFile, options.project);
  return { projectId: options.project, updatedAt: index.updated_at || '', entries: index.entries || [] };
}

export async function activeUpdate(options) {
  requireOption(options, 'project');
  requireOption(options, 'session');
  const userConfig = await loadUserConfig();
  const amDataRoot = resolveAmDataRoot(options, userConfig);
  const p = pathsFor(amDataRoot, options.project, options.session, undefined, undefined, userConfig.paths);
  const now = new Date().toISOString();
  const entry = await upsertActiveEntry(p, {
    project_id: options.project,
    session_id: options.session,
    agent: options.agent,
    task: options.task || options['task-name'] || '',
    worktree: options.worktree || '',
    status: options.status || 'active',
    summary: options.summary || options.message || '',
    session_file: p.sessionFile,
    checkpoints_file: p.checkpointsFile,
    updated_at: now,
  });
  return { projectId: options.project, entry };
}

export async function activeComplete(options) {
  requireOption(options, 'project');
  requireOption(options, 'session');
  const userConfig = await loadUserConfig();
  const amDataRoot = resolveAmDataRoot(options, userConfig);
  const p = pathsFor(amDataRoot, options.project, options.session, undefined, undefined, userConfig.paths);
  const now = new Date().toISOString();
  const entry = await upsertActiveEntry(p, {
    project_id: options.project,
    session_id: options.session,
    agent: options.agent,
    task: options.task || options['task-name'] || '',
    worktree: options.worktree || '',
    status: 'completed',
    summary: options.summary || options.message || '',
    completed_at: now,
    session_file: p.sessionFile,
    checkpoints_file: p.checkpointsFile,
    updated_at: now,
  });
  return { projectId: options.project, entry };
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
  const terms = splitSearchTerms(query);
  const matchExpr = terms.map((term) => `"${term.replace(/"/g, '""')}"`).join(' AND ');
  const hasFts = sqliteHasTable(indexFile, 'am_documents_fts');
  const likeWhere = terms.length
    ? terms.map((term) => {
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
    return { kind, title, body, source_path, created_at, backend: 'sqlite' };
  }).filter((item) => item.kind && item.title && item.body !== undefined && item.source_path && path.isAbsolute(item.source_path));
}

export async function searchWithRipgrep(searchDir, query, limit) {
  if (!searchDir || !(await pathExists(searchDir)) || !hasRipgrep()) return [];
  const terms = splitSearchTerms(query);
  if (!terms.length) return [];
  const safeLimit = Number.isFinite(limit) ? Math.max(1, limit) : 10;
  const args = [
    '--json',
    '--ignore-case',
    '--fixed-strings',
    '--line-number',
    '--max-count',
    String(Math.max(20, safeLimit * 3)),
    '--max-filesize',
    '2M',
    '--glob',
    '*.md',
    '--glob',
    '*.jsonl',
    '--glob',
    '*.toml',
    '--glob',
    '!am-index.sqlite',
    '--glob',
    '!*.am-tmp-*',
  ];
  for (const term of terms.slice(0, 8)) {
    args.push('-e', term);
  }
  args.push(searchDir);
  const result = spawnSync('rg', args, { encoding: 'utf8' });
  if (result.status !== 0 || !result.stdout) return [];

  const byFile = new Map();
  for (const line of result.stdout.split(/\r?\n/).filter(Boolean)) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type !== 'match') continue;
    const filePath = event.data?.path?.text;
    if (!filePath) continue;
    const lineNumber = event.data?.line_number;
    const lineText = String(event.data?.lines?.text || '').trimEnd();
    const entry = byFile.get(filePath) || {
      filePath,
      title: path.basename(filePath),
      snippets: [],
      score: 0,
    };
    if (lineText) entry.snippets.push(`${lineNumber}: ${lineText}`);
    entry.score += Math.max(1, event.data?.submatches?.length || 0);
    byFile.set(filePath, entry);
  }

  return [...byFile.values()]
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, safeLimit)
    .map((entry) => ({
      kind: 'rg',
      title: entry.title,
      body: compactText(entry.snippets.slice(0, 12).join('\n'), 2000),
      source_path: entry.filePath,
      created_at: '',
      backend: 'ripgrep',
    }));
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
  const terms = splitSearchTerms(query).map((term) => term.toLowerCase());
  const items = [];
  for (const filePath of files.filter((file) => /\.(md|jsonl|toml)$/i.test(file))) {
    const content = await readText(filePath, '');
    const lowerContent = content.toLowerCase();
    const matches = !terms.length || terms.every((term) => lowerContent.includes(term));
    if (matches) {
      items.push({
        kind: 'file',
        title: path.basename(filePath),
        body: compactText(content, 2000),
        source_path: filePath,
        created_at: '',
        backend: 'file-scan',
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

function hasRipgrep() {
  const result = spawnSync('rg', ['--version'], { encoding: 'utf8' });
  return result.status === 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isStaleLock(lockContent, staleMs) {
  try {
    const parsed = JSON.parse(lockContent || '{}');
    if (!parsed.createdAt) return false;
    const createdAt = Date.parse(parsed.createdAt);
    return Number.isFinite(createdAt) && Date.now() - createdAt > staleMs;
  } catch {
    return false;
  }
}

async function ensureActiveIndex(activeFile, projectId) {
  await ensureDir(path.dirname(activeFile));
  if (await pathExists(activeFile)) return;
  await writeTextAtomic(activeFile, `${JSON.stringify({
    project_id: projectId,
    updated_at: new Date().toISOString(),
    entries: [],
  }, null, 2)}\n`);
}

async function loadActiveIndex(activeFile, projectId) {
  const content = await readText(activeFile, '');
  if (!content.trim()) {
    return { project_id: projectId, updated_at: new Date().toISOString(), entries: [] };
  }
  try {
    const parsed = JSON.parse(content);
    parsed.project_id ||= projectId;
    parsed.updated_at ||= new Date().toISOString();
    parsed.entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    return parsed;
  } catch {
    return { project_id: projectId, updated_at: new Date().toISOString(), entries: [] };
  }
}

async function saveActiveIndex(activeFile, activeIndex) {
  await writeTextAtomic(activeFile, `${JSON.stringify({
    ...activeIndex,
    updated_at: new Date().toISOString(),
    entries: Array.isArray(activeIndex.entries) ? activeIndex.entries : [],
  }, null, 2)}\n`);
}

function activeEntryKey(entry) {
  return [entry.session_id || '', entry.task || '', entry.worktree || ''].join('\u0000');
}

async function upsertActiveEntry(p, entry) {
  if (!p.projectActiveFile) return entry;
  const lockName = `${entry.project_id || 'project'}.am-active.lock`;
  const release = await acquireLock(path.join(p.locksDir, lockName), `active index ${entry.project_id || ''}/${entry.session_id || ''}`);
  try {
    const activeIndex = await loadActiveIndex(p.projectActiveFile, entry.project_id);
    const now = new Date().toISOString();
    const key = activeEntryKey(entry);
    const existingIndex = activeIndex.entries.findIndex((item) => activeEntryKey(item) === key);
    const nextEntry = {
      ...(existingIndex >= 0 ? activeIndex.entries[existingIndex] : {}),
      ...entry,
      created_at: existingIndex >= 0 ? activeIndex.entries[existingIndex].created_at || entry.created_at || now : entry.created_at || now,
      updated_at: entry.updated_at || now,
    };
    if (existingIndex >= 0) activeIndex.entries[existingIndex] = nextEntry;
    else activeIndex.entries.push(nextEntry);
    activeIndex.project_id = entry.project_id || activeIndex.project_id;
    activeIndex.updated_at = now;
    await saveActiveIndex(p.projectActiveFile, activeIndex);
    return nextEntry;
  } finally {
    await release();
  }
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

function splitSearchTerms(query) {
  return [...new Set(String(query || '').split(/\s+/).map((term) => term.trim()).filter(Boolean))];
}

async function readCheckpointState(options) {
  if (Object.prototype.hasOwnProperty.call(options, 'state')) {
    return String(options.state || '');
  }
  if (options['state-file'] || options.stateFile) {
    return await readText(path.resolve(options['state-file'] || options.stateFile), '');
  }
  if (options.stdin) {
    return await fs.readFile(0, 'utf8');
  }
  if (options.message) {
    return String(options.message || '');
  }
  return '';
}

async function readRequestedText(options, textKey, fileKey) {
  if (Object.prototype.hasOwnProperty.call(options, textKey)) {
    return String(options[textKey] || '');
  }
  if (options[fileKey] || options[`${textKey}File`]) {
    return await readText(path.resolve(options[fileKey] || options[`${textKey}File`]), '');
  }
  if (options.stdin) {
    return await fs.readFile(0, 'utf8');
  }
  return '';
}

async function loadJson(filePath, fallback = {}) {
  const content = await readText(filePath, '');
  if (!content.trim()) return fallback;
  try {
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

async function lockAndLoadSecretStore(options, purpose) {
  const userConfig = await loadUserConfig();
  const amDataRoot = resolveAmDataRoot(options, userConfig);
  const p = pathsFor(amDataRoot, undefined, undefined, undefined, undefined, userConfig.paths);
  const secretFile = path.join(p.secretsDir, 'am-secrets.local.json');
  await ensureDir(p.secretsDir);
  const release = await acquireLock(path.join(p.locksDir, 'am-secrets.am.lock'), purpose);
  const store = await loadJson(secretFile, {});
  return { secretFile, store, release };
}

async function loadSecretStore(options) {
  const userConfig = await loadUserConfig();
  const amDataRoot = resolveAmDataRoot(options, userConfig);
  const p = pathsFor(amDataRoot, undefined, undefined, undefined, undefined, userConfig.paths);
  const secretFile = path.join(p.secretsDir, 'am-secrets.local.json');
  const store = await loadJson(secretFile, {});
  return { secretFile, store };
}

async function saveSecretStore(secretFile, store) {
  await writeTextAtomic(secretFile, `${JSON.stringify(store, null, 2)}\n`);
}

function resolveByRef(store, ref) {
  return String(ref || '').split('.').reduce((acc, key) => acc?.[key], store);
}

function setByRef(store, ref, value) {
  const parts = String(ref || '').split('.').filter(Boolean);
  if (!parts.length) throw new AmError('secret_ref 不能为空', 'AM_BAD_SECRET_REF');
  let cursor = store;
  for (const part of parts.slice(0, -1)) {
    if (!cursor[part] || typeof cursor[part] !== 'object' || Array.isArray(cursor[part])) cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[parts.at(-1)] = value;
}

function deleteByRef(store, ref) {
  const parts = String(ref || '').split('.').filter(Boolean);
  if (!parts.length) return false;
  const parents = [];
  let cursor = store;
  for (const part of parts.slice(0, -1)) {
    if (!cursor[part] || typeof cursor[part] !== 'object') return false;
    parents.push([cursor, part]);
    cursor = cursor[part];
  }
  if (!Object.prototype.hasOwnProperty.call(cursor, parts.at(-1))) return false;
  delete cursor[parts.at(-1)];
  for (let i = parents.length - 1; i >= 0; i -= 1) {
    const [parent, key] = parents[i];
    if (parent[key] && typeof parent[key] === 'object' && !Array.isArray(parent[key]) && !Object.keys(parent[key]).length) {
      delete parent[key];
    }
  }
  return true;
}

function flattenRefs(store, prefix = '') {
  const refs = [];
  for (const [key, value] of Object.entries(store || {})) {
    const ref = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) refs.push(...flattenRefs(value, ref));
    else refs.push(ref);
  }
  return refs;
}

function summarizeState(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).filter((line) => !line.startsWith('#'));
  return compactText(lines.slice(0, 8).join(' | '), 280);
}

function buildSearchResult(query, items, limit, debug, metrics, strategy) {
  const limited = items.slice(0, limit);
  const result = { query, items: limited };
  if (debug) {
    result.debug = {
      strategy,
      metrics,
      returned: limited.length,
      truncated: items.length > limit,
    };
  }
  return result;
}

function buildLegacyMigrationPlan({ projectId, sessionId, p, sources, hotText, warmText, coldText }) {
  return {
    projectId,
    sessionId,
    sources: {
      hot: sources.hot ? { source: sources.hot, target: p.sessionFile, lines: countLines(hotText) } : null,
      warm: sources.warm ? { source: sources.warm, target: path.join(p.projectMemoryDir, 'am-warm.md'), lines: countLines(warmText) } : null,
      cold: sources.cold ? { source: sources.cold, target: path.join(p.projectMemoryDir, 'am-cold.events.jsonl'), lines: countLines(coldText) } : null,
    },
  };
}

function buildLegacyMigrationReport({ projectId, sessionId, sources, hotText, warmText, coldText, plan, coldEvents }) {
  const now = new Date().toISOString();
  return [
    '# agents-memory Legacy Migration Report',
    '',
    `- project_id: ${projectId}`,
    `- session_id: ${sessionId}`,
    `- generated_at: ${now}`,
    '',
    '## Sources',
    `- hot: ${sources.hot || 'not provided'}`,
    `- warm: ${sources.warm || 'not provided'}`,
    `- cold: ${sources.cold || 'not provided'}`,
    '',
    '## Plan',
    `- hot lines: ${plan.sources.hot?.lines ?? 0}`,
    `- warm lines: ${plan.sources.warm?.lines ?? 0}`,
    `- cold lines: ${plan.sources.cold?.lines ?? 0}`,
    '',
    '## Import Notes',
    `- hot sensitive lines skipped: ${stripSensitiveLines(hotText).skippedCount}`,
    `- warm sensitive lines skipped: ${stripSensitiveLines(warmText).skippedCount}`,
    `- cold sensitive lines skipped: ${coldEvents.skippedCount}`,
    '',
    '## Summary',
    `- hot imported: ${Boolean(sources.hot)}`,
    `- warm imported: ${Boolean(sources.warm)}`,
    `- cold imported events: ${coldEvents.events.length}`,
    `- cold raw lines: ${countLines(coldText)}`,
    '',
  ].join('\n');
}

function parseLegacyColdEvents(text, sourcePath, projectId, sessionId) {
  const lines = String(text || '').split(/\r?\n/).filter((line) => line.trim().length);
  const events = [];
  const indexItems = [];
  let skippedCount = 0;
  for (const line of lines) {
    if (looksSensitive(line)) {
      skippedCount += 1;
      continue;
    }
    let parsed = null;
    try {
      parsed = JSON.parse(line);
    } catch {
      parsed = null;
    }
    const now = new Date().toISOString();
    const event = parsed && typeof parsed === 'object'
      ? {
          type: 'legacy_cold_import',
          project_id: projectId,
          session_id: sessionId,
          source_path: sourcePath,
          imported_at: now,
          payload: parsed,
        }
      : {
          type: 'legacy_cold_import',
          project_id: projectId,
          session_id: sessionId,
          source_path: sourcePath,
          imported_at: now,
          summary: line,
        };
    events.push(event);
    indexItems.push({
      scope: 'project',
      project_id: projectId,
      session_id: sessionId,
      kind: 'legacy_cold_import',
      title: `Legacy cold import ${sessionId}`,
      body: compactText(event.summary || JSON.stringify(event.payload || {}), 1600),
      source_path: sourcePath,
      created_at: now,
    });
  }
  if (!events.length && text.trim()) {
    const now = new Date().toISOString();
    events.push({
      type: 'legacy_cold_import',
      project_id: projectId,
      session_id: sessionId,
      source_path: sourcePath,
      imported_at: now,
      summary: compactText(text, 1600),
    });
    indexItems.push({
      scope: 'project',
      project_id: projectId,
      session_id: sessionId,
      kind: 'legacy_cold_import',
      title: `Legacy cold import ${sessionId}`,
      body: compactText(text, 1600),
      source_path: sourcePath,
      created_at: now,
    });
  }
  return { events, indexItems, skippedCount };
}

function stripSensitiveLines(text) {
  const lines = String(text || '').split(/\r?\n/);
  const kept = [];
  let skippedCount = 0;
  for (const line of lines) {
    if (looksSensitive(line)) {
      skippedCount += 1;
      continue;
    }
    kept.push(line);
  }
  return { text: kept.join('\n').trim(), skippedCount };
}

function looksSensitive(line) {
  return /(password|passwd|secret|token|cookie|apikey|api_key|access_key|private_key|redis:\/\/|mysql:\/\/|postgres:\/\/|mongodb:\/\/)/i.test(String(line || ''));
}

function countLines(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return 0;
  return trimmed.split(/\r?\n/).length;
}

function dedupeSearchItems(items) {
  const seenExact = new Set();
  const seenRipgrepSources = new Set();
  const result = [];
  for (const item of items) {
    const sourceKey = item.source_path ? path.resolve(item.source_path).toLowerCase() : '';
    if (item.backend === 'ripgrep' && sourceKey) seenRipgrepSources.add(sourceKey);
    if (item.backend !== 'ripgrep' && sourceKey && seenRipgrepSources.has(sourceKey)) continue;
    const key = sourceKey
      ? `${sourceKey}\0${item.kind}\0${item.title}\0${String(item.body || '').slice(0, 500)}`
      : `${item.kind}\0${item.title}\0${item.body}`;
    if (seenExact.has(key)) continue;
    seenExact.add(key);
    result.push(item);
  }
  return result;
}

function ensureMarkdownTitle(content, title) {
  const text = String(content || '').trim();
  if (text.startsWith('#')) return `${text}\n`;
  return `# ${title}\n\n${text}\n`;
}

function indentLines(value, prefix) {
  return String(value || '').split(/\r?\n/).map((line) => `${prefix}${line}`).join('\n');
}
