#!/usr/bin/env node
import {
  activeComplete,
  activeList,
  activeUpdate,
  checkpoint,
  docCheck,
  doctor,
  getContext,
  promote,
  migrateLegacy,
  rebuildIndex,
  search,
  secretGet,
  secretList,
  secretRemove,
  secretSet,
  secretUpdate,
} from './am-core.mjs';

const tools = {
  'am.get_context': getContext,
  'am.checkpoint': checkpoint,
  'am.promote': promote,
  'am.rebuild_index': rebuildIndex,
  'am.search': search,
  'am.secret_get': secretGet,
  'am.secret_set': secretSet,
  'am.secret_list': secretList,
  'am.secret_update': secretUpdate,
  'am.secret_remove': secretRemove,
  'am.active_list': activeList,
  'am.active_update': activeUpdate,
  'am.active_complete': activeComplete,
  'am.migrate_legacy': migrateLegacy,
  'am.doc_check': docCheck,
  'am.doctor': doctor,
};

let buffer = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', async (chunk) => {
  buffer += chunk;
  let newlineIndex = buffer.indexOf('\n');
  while (newlineIndex >= 0) {
    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);
    newlineIndex = buffer.indexOf('\n');
    if (line) await handleLine(line);
  }
});

async function handleLine(line) {
  let request;
  try {
    request = JSON.parse(line);
    const { id, method, params = {} } = request;
    if (method === 'tools/list') {
      writeJson({ id, result: { tools: Object.keys(tools).map((name) => ({ name })) } });
      return;
    }
    if (method !== 'tools/call') {
      writeJson({ id, error: { code: -32601, message: `Unsupported method: ${method}` } });
      return;
    }
    const toolName = params.name;
    const fn = tools[toolName];
    if (!fn) {
      writeJson({ id, error: { code: -32602, message: `Unknown tool: ${toolName}` } });
      return;
    }
    const result = await fn(params.arguments || {});
    writeJson({
      id,
      result: {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          },
        ],
      },
    });
  } catch (error) {
    writeJson({
      id: request?.id ?? null,
      error: { code: -32000, message: error.message, data: { code: error.code || 'AM_ERROR' } },
    });
  }
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}
