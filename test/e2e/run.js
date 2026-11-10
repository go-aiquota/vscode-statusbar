// Copyright (c) the go-aiquota authors.
// SPDX-License-Identifier: BSD-3-Clause
'use strict';

// End to end, in a real VS Code: the BUILT .vsix is installed with the `code`
// CLI (the same path a user takes), VS Code is started with a user setting that
// points aiquota.binaryPath at a fake `aiquota`, and test/e2e/suite.js asserts
// what the extension drew. One VS Code start per scenario:
//   good    the fake prints a fixed render-1 JSON: its items must appear;
//   broken  the fake prints garbage: the one grey "Claude ?" item must appear
//           (the positive control: the assertions can fail).
//
//   npm run package && npm run test:e2e        (Linux CI: under xvfb-run)

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath, runTests } = require('@vscode/test-electron');

// Run from inside another Electron app's terminal (VS Code's own, for one),
// this variable would make the VS Code under test start as plain Node and
// refuse every option as "bad option".
delete process.env.ELECTRON_RUN_AS_NODE;

// Pinned, so a new VS Code release cannot redden a pull request by itself.
const VSCODE_VERSION = '1.96.4';
const ROOT = path.resolve(__dirname, '..', '..');
const ID = 'go-aiquota.aiquota-statusbar';

function findVsix() {
  const { version } = require(path.join(ROOT, 'package.json'));
  const file = path.join(ROOT, `aiquota-statusbar-${version}.vsix`);
  if (!fs.existsSync(file)) {
    throw new Error(`${file} does not exist (run npm run package)`);
  }
  return file;
}

async function scenario(name, vscodeExecutablePath, vsix) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), `aiquota-e2e-${name}-`));
  const extDir = path.join(work, 'extensions');
  const userDir = path.join(work, 'user');
  fs.mkdirSync(path.join(userDir, 'User'), { recursive: true });
  const fake = path.join(__dirname, 'fixtures', name, 'aiquota');
  fs.chmodSync(fake, 0o755);
  fs.writeFileSync(
    path.join(userDir, 'User', 'settings.json'),
    JSON.stringify({ 'aiquota.binaryPath': fake, 'aiquota.cooldownSeconds': 5 }),
  );

  const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);
  const dirs = ['--extensions-dir', extDir, '--user-data-dir', userDir];
  const run = (args) => spawnSync(cli, [...cliArgs, ...dirs, ...args], { encoding: 'utf8', shell: process.platform === 'win32' });
  const inst = run(['--install-extension', vsix]);
  if (inst.status !== 0) {
    throw new Error(`install ${vsix}: ${inst.stdout}${inst.stderr}`);
  }
  const listed = run(['--list-extensions']);
  if (!listed.stdout.includes(ID)) {
    throw new Error(`${ID} is not installed after --install-extension: ${listed.stdout}${listed.stderr}`);
  }

  await runTests({
    vscodeExecutablePath,
    // The installed extension is what is tested; this directory only gives
    // VS Code something to develop (an empty extension).
    extensionDevelopmentPath: path.join(__dirname, 'dummy'),
    extensionTestsPath: path.join(__dirname, 'suite.js'),
    extensionTestsEnv: { AIQUOTA_SCENARIO: name },
    launchArgs: [`--extensions-dir=${extDir}`, `--user-data-dir=${userDir}`, '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes'],
  });
}

async function main() {
  const vsix = findVsix();
  const vscodeExecutablePath = await downloadAndUnzipVSCode(VSCODE_VERSION);
  for (const name of ['good', 'broken']) {
    console.log(`--- scenario ${name}`);
    await scenario(name, vscodeExecutablePath, vsix);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
