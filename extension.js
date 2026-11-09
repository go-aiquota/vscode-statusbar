// Copyright (c) the go-aiquota authors.
// SPDX-License-Identifier: BSD-3-Clause
'use strict';

// Thin shell: runs the aiquota binary and paints its answer, one status bar
// item per window. Which band, which colour and which background are the
// binary's decisions. VS Code honours only the warning and error theme
// backgrounds for an extension's item (StatusBarItem.backgroundColor), so any
// other step is a foreground colour. No secret passes through here.
//
// The item is never empty: whatever fails (binary, version, JSON, an
// exception here) it reads "Claude ?", the reason is its tooltip, and every
// failure is written to the "aiquota" output channel.

const os = require('node:os');
const path = require('node:path');
const vscode = require('vscode');
const { measure, unknownItem } = require('./src/measure');
const { createPoller } = require('./src/poller');
const { priorities, cleanBase, cleanAlignment, DEFAULT_BASE } = require('./src/layout');

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
    alignment: cleanAlignment(c.get('statusbar.alignment', 'right')),
    priority: cleanBase(c.get('statusbar.priority', DEFAULT_BASE)),
  };
}

const BACKGROUNDS = {
  warning: 'statusBarItem.warningBackground',
  error: 'statusBarItem.errorBackground',
};

function activate(context) {
  const out = vscode.window.createOutputChannel('aiquota');
  const log = (msg) => out.appendLine(`${new Date().toISOString()} ${msg}`);
  const pool = [];
  let layoutKey = '';
  let current = unknownItem('not measured yet', new Date());
  context.subscriptions.push(out);

  // Items are (re)created when the alignment or the priority changes, so one
  // base priority and its fractional steps keep them contiguous.
  function layout() {
    let c;
    try {
      c = config();
    } catch (err) {
      log(`settings unreadable, using defaults: ${err}`);
      c = { alignment: 'right', priority: DEFAULT_BASE };
    }
    const key = `${c.alignment}/${c.priority}`;
    if (key === layoutKey) {
      return;
    }
    layoutKey = key;
    while (pool.length) {
      pool.pop().dispose();
    }
    const align = c.alignment === 'left' ? vscode.StatusBarAlignment.Left : vscode.StatusBarAlignment.Right;
    priorities(c.priority, 8).forEach((p, i) => {
      const it = vscode.window.createStatusBarItem(`aiquota.item${i}`, align, p);
      it.name = i === 0 ? 'aiquota: Claude usage' : `aiquota: Claude usage ${i + 1}`;
      it.command = 'aiquota.showDetail';
      pool.push(it);
    });
  }

  function show(res) {
    current = res;
    if (res.level === 'unknown') {
      log(`unknown: ${res.reason || res.tooltip}`);
    }
    layout();
    res.items.forEach((x, i) => {
      const it = pool[i];
      if (!it) {
        return;
      }
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

  function showSafely(res) {
    try {
      show(res);
    } catch (err) {
      log(`cannot paint the status bar: ${err && err.stack ? err.stack : err}`);
      try {
        show(unknownItem(`extension error: ${err && err.message ? err.message : err}`, new Date()));
      } catch (err2) {
        log(`cannot paint even the unknown item: ${err2}`);
      }
    }
  }
  showSafely(current);

  const poller = createPoller({
    start: () => {
      if (pool[0]) {
        pool[0].text = `$(sync~spin) ${current.items[0].text}`;
      }
      const c = config();
      return measure({ binary: c.binary, warn: c.warn, critical: c.critical, bands: c.bands, timeoutMs: c.timeoutMs });
    },
    onItem: showSafely,
    onError: (err) => {
      log(`measurement failed: ${err && err.stack ? err.stack : err}`);
      showSafely(unknownItem(`extension error: ${err && err.message ? err.message : err}`, new Date()));
    },
    getConfig: config,
  });

  // A new version installed under a running window is not loaded until a
  // reload: say so once.
  const mine = context.extension.packageJSON.version;
  let prompted = false;
  context.subscriptions.push(
    vscode.extensions.onDidChange(() => {
      const now = vscode.extensions.getExtension(context.extension.id);
      if (!prompted && now && now.packageJSON.version !== mine) {
        prompted = true;
        vscode.window
          .showInformationMessage('Reload window to update aiquota status bar', 'Reload Window')
          .then((choice) => (choice ? vscode.commands.executeCommand('workbench.action.reloadWindow') : undefined));
      }
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('aiquota.statusbar')) {
        showSafely(current);
      }
    }),
    { dispose: () => poller.dispose() },
    { dispose: () => pool.forEach((it) => it.dispose()) },
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
