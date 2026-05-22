param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $Args
)

$Root = Split-Path -Parent $PSScriptRoot
node (Join-Path $Root 'am-src\am-cli.mjs') @Args
