#!/usr/bin/env node
import {
  AmError,
  checkpoint,
  doctor,
  getContext,
  initAm,
  installRules,
  parseArgs,
  promote,
  rebuildIndex,
  registerProject,
  search,
  secretGet,
  startSession,
} from './am-core.mjs';

const { positional, options } = parseArgs(process.argv.slice(2));
const command = positional[0] || 'help';

try {
  const result = await run(command, options);
  if (result !== undefined) printResult(result);
} catch (error) {
  if (error instanceof AmError) {
    console.error(`[${error.code}] ${error.message}`);
    process.exit(2);
  }
  console.error(error);
  process.exit(1);
}

async function run(commandName, opts) {
  switch (commandName) {
    case 'init':
      return initAm(opts);
    case 'register-project':
      return registerProject(opts);
    case 'install-rules':
      return installRules(opts);
    case 'start-session':
      return startSession(opts);
    case 'get-context':
      return getContext(opts);
    case 'checkpoint':
      return checkpoint(opts);
    case 'promote':
      return promote(opts);
    case 'rebuild-index':
      return rebuildIndex(opts);
    case 'search':
      return search(opts);
    case 'secret':
      if (positional[1] !== 'get') throw new AmError('secret 只支持子命令 get', 'AM_BAD_COMMAND');
      return secretGet(opts);
    case 'doctor':
      return doctor(opts);
    case 'help':
    default:
      return helpText();
  }
}

function printResult(result) {
  if (typeof result === 'string') {
    console.log(result);
    return;
  }
  if (result.context && !process.env.AM_JSON) {
    console.log(result.context);
    return;
  }
  console.log(JSON.stringify(result, null, 2));
}

function helpText() {
  return `agents-memory CLI

Usage:
  node am-src/am-cli.mjs init --am-data-root E:\\work\\AM-data
  node am-src/am-cli.mjs register-project --id sdcr --root E:\\workspace\\company_jz\\sdcr
  node am-src/am-cli.mjs install-rules --target codex --project sdcr --root E:\\workspace\\company_jz\\sdcr
  node am-src/am-cli.mjs start-session --project sdcr --agent codex
  node am-src/am-cli.mjs get-context --project sdcr --session <id> --query "..."
  node am-src/am-cli.mjs checkpoint --project sdcr --session <id> --reason pre-compact --state "..."
  node am-src/am-cli.mjs promote --project sdcr --session <id>
  node am-src/am-cli.mjs rebuild-index --project sdcr
  node am-src/am-cli.mjs search --project sdcr --scope global,project --query "..."
  node am-src/am-cli.mjs secret get --ref sdcr.mysql.dev
  node am-src/am-cli.mjs doctor --project sdcr

Path priority:
  1. --am-data-root
  2. AM_DATA_ROOT
  3. ~/.agents-memory/am-config.toml
  4. E:\\work\\AM-data
`;
}
