// Copyright (c) the go-aiquota authors.
// SPDX-License-Identifier: BSD-3-Clause
'use strict';

// Thin shell: runs the aiquota binary and shows its answer. No secret passes
// through here; the binary reads Claude Code's own credential itself.

const os = require('node:os');
const path = require('node:path');
const vscode = require('vscode');
const { measure, unknownItem } = require('./src/measure');
const { createPoller } = require('./src/poller');

function config() {
  const c = vscode.workspace.getConfiguration('aiquota');
  const binary = c.get('binaryPath') || path.join(os.homedir(), '.local', 'bin', 'aiquota');
  const warn = Math.min(100, Math.max(0, c.get('warnPercent', 75)));
  const critical = Math.min(100, Math.max(warn, c.get('criticalPercent', 90)));
  return {
    binary,
    warn,
    critical,
    intervalMs: Math.max(30, c.get('intervalSeconds', 60)) * 1000,
    cooldownMs: Math.max(5, c.get('cooldownSeconds', 15)) * 1000,
    timeoutMs: Math.max(5, c.get('timeoutSeconds', 30)) * 1000,
  };
}

function activate(context) {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  const out = vscode.window.createOutputChannel('aiquota');
  let current = unknownItem('not measured yet', new Date());
  item.command = 'aiquota.showDetail';

  function show(it) {
    current = it;
    item.text = it.text;
    item.tooltip = it.tooltip;
    item.color = undefined;
    item.backgroundColor =
      it.level === 'error'
        ? new vscode.ThemeColor('statusBarItem.errorBackground')
        : it.level === 'warn' || it.level === 'unknown'
          ? new vscode.ThemeColor('statusBarItem.warningBackground')
          : undefined;
    item.show();
  }
  show(current);

  const poller = createPoller({
    start: () => {
      item.text = `$(sync~spin) ${current.text}`;
      const c = config();
      return measure({ binary: c.binary, warn: c.warn, critical: c.critical, timeoutMs: c.timeoutMs });
    },
    onItem: show,
    getConfig: config,
  });

  context.subscriptions.push(
    item,
    out,
    { dispose: () => poller.dispose() },
    vscode.commands.registerCommand('aiquota.refresh', () => poller.poll()),
    vscode.commands.registerCommand('aiquota.showDetail', () => {
      out.clear();
      out.appendLine(current.tooltip);
      out.show(true);
      poller.poll(); // refused inside the cooldown, so a click cannot hammer the endpoint
    }),
  );
  poller.poll();
}

function deactivate() {}

module.exports = { activate, deactivate };
