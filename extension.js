// Copyright (c) the go-aiquota authors.
// SPDX-License-Identifier: BSD-3-Clause
'use strict';

// Thin shell: runs the aiquota binary and paints its answer, one status bar
// item per window. Which band, which colour and which background are the
// binary's decisions. VS Code honours only the warning and error theme
// backgrounds for an extension's item (StatusBarItem.backgroundColor), so any
// other step is a foreground colour. No secret passes through here.

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
    bands: Math.min(8, Math.max(2, Math.round(c.get('bands', 8)))),
    intervalMs: Math.max(30, c.get('intervalSeconds', 60)) * 1000,
    cooldownMs: Math.max(5, c.get('cooldownSeconds', 15)) * 1000,
    timeoutMs: Math.max(5, c.get('timeoutSeconds', 30)) * 1000,
  };
}

const BACKGROUNDS = {
  warning: 'statusBarItem.warningBackground',
  error: 'statusBarItem.errorBackground',
};

function activate(context) {
  const out = vscode.window.createOutputChannel('aiquota');
  const pool = [];
  let current = unknownItem('not measured yet', new Date());

  function slot(i) {
    if (!pool[i]) {
      const it = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100 - i);
      it.command = 'aiquota.showDetail';
      pool[i] = it;
      context.subscriptions.push(it);
    }
    return pool[i];
  }

  function show(res) {
    current = res;
    res.items.forEach((x, i) => {
      const it = slot(i);
      it.text = x.text;
      it.tooltip = res.tooltip;
      it.color = x.color;
      it.backgroundColor = BACKGROUNDS[x.background] ? new vscode.ThemeColor(BACKGROUNDS[x.background]) : undefined;
      it.show();
    });
    for (let i = res.items.length; i < pool.length; i++) {
      pool[i].hide();
    }
  }
  show(current);

  const poller = createPoller({
    start: () => {
      if (pool[0]) {
        pool[0].text = `$(sync~spin) ${current.items[0].text}`;
      }
      const c = config();
      return measure({ binary: c.binary, warn: c.warn, critical: c.critical, bands: c.bands, timeoutMs: c.timeoutMs });
    },
    onItem: show,
    getConfig: config,
  });

  context.subscriptions.push(
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
