#!/usr/bin/env node
import {
  AmError,
  activeComplete,
  activeList,
  activeUpdate,
  checkpoint,
  docCheck,
  doctor,
  getContext,
  initAm,
  installRules,
  parseArgs,
  promote,
  migrateLegacy,
  rebuildIndex,
  registerProject,
  search,
  secretGet,
  secretList,
  secretRemove,
  secretSet,
  secretUpdate,
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
    case 'active':
      switch (positional[1]) {
        case 'list':
          return activeList(opts);
        case 'update':
          return activeUpdate(opts);
        case 'complete':
          return activeComplete(opts);
        default:
          throw new AmError('active 只支持子命令 list/update/complete', 'AM_BAD_COMMAND');
      }
    case 'secret':
      switch (positional[1]) {
        case 'get':
          return secretGet(opts);
        case 'set':
          return secretSet(opts);
        case 'list':
          return secretList(opts);
        case 'update':
          return secretUpdate(opts);
        case 'remove':
          return secretRemove(opts);
        default:
          throw new AmError('secret 只支持子命令 get/set/list/update/remove', 'AM_BAD_COMMAND');
      }
    case 'migrate':
      if (positional[1] !== 'legacy') throw new AmError('migrate 只支持子命令 legacy', 'AM_BAD_COMMAND');
      return migrateLegacy(opts);
    case 'doc-check':
      return docCheck();
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
  am init
  am register-project --id <project-id> --root <project-root>
  am install-rules --target codex --project <project-id> --root <project-root>
  node am-src/am-cli.mjs start-session --project sdcr --agent codex
  node am-src/am-cli.mjs get-context --project sdcr --session <id> --query "..." --profile lean
  node am-src/am-cli.mjs checkpoint --project sdcr --session <id> --reason pre-compact --state "..."
  node am-src/am-cli.mjs promote --project sdcr --session <id>
  node am-src/am-cli.mjs rebuild-index --project sdcr
  node am-src/am-cli.mjs search --project sdcr --scope global,project --query "..."
  node am-src/am-cli.mjs active list --project sdcr
  node am-src/am-cli.mjs secret get --ref sdcr.mysql.dev
  node am-src/am-cli.mjs secret set --ref sdcr.mysql.dev --value "..."
  node am-src/am-cli.mjs secret list --prefix sdcr
  node am-src/am-cli.mjs secret update --ref sdcr.mysql.dev --value "..."
  node am-src/am-cli.mjs secret remove --ref sdcr.mysql.dev
  node am-src/am-cli.mjs migrate legacy --project sdcr --session imported-legacy --hot <hot.md> --warm <warm.md> --cold <cold.md>
  node am-src/am-cli.mjs doc-check
  node am-src/am-cli.mjs doctor --project sdcr

Path priority:
  1. --am-data-root
  2. AM_DATA_ROOT
  3. ~/.agents-memory/am-config.toml
  4. ~/.agents-memory/am-data
`;
}
