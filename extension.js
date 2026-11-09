// Copyright (c) the go-aiquota authors.
// SPDX-License-Identifier: BSD-3-Clause
'use strict';

// FROZEN, generic renderer. It runs `aiquota status -o statusbar --render 1`
// and draws exactly the items that description lists: how many, in what order,
// with what text, tooltip, colour, background, priority, alignment and click
// action are all the binary's decisions. To change the look, `go install` a
// new aiquota and click the item (or wait one poll): no reload is needed, and
// a reload would restart every extension of the window (VS Code runs them in
// one extension host). No secret passes through here.
//
// The status bar is never empty: whatever fails, a grey "Claude ?" with the
// reason in its tooltip is drawn, and the failure goes to the "aiquota"
// output channel.

const os = require('node:os');
const path = require('node:path');
const vscode = require('vscode');
const { measure } = require('./src/measure');
const { unknownRender, MIN_POLL } = require('./src/render');
const { createPoller } = require('./src/poller');
const { createReconciler } = require('./src/reconcile');
const { cleanBase, cleanAlignment, DEFAULT_BASE } = require('./src/layout');

// A setting counts only when the user set it: otherwise the binary's own
// default rules, so tuning the defaults is a go install.
function userSet(c, key) {
  const i = c.inspect(key);
  const v = i && (i.workspaceFolderValue ?? i.workspaceValue ?? i.globalValue);
  return v === undefined ? undefined : v;
}

function config() {
  const c = vscode.workspace.getConfiguration('aiquota');
  const extraArgs = [];
  for (const [key, flag] of [['warnPercent', '--warn'], ['criticalPercent', '--critical'], ['bands', '--bands']]) {
    const v = userSet(c, key);
    if (typeof v === 'number') {
      extraArgs.push(flag, String(Math.round(v)));
    }
  }
  const interval = userSet(c, 'intervalSeconds');
  return {
    binary: c.get('binaryPath') || path.join(os.homedir(), '.local', 'bin', 'aiquota'),
    extraArgs,
    userIntervalMs: typeof interval === 'number' ? Math.max(MIN_POLL, interval) * 1000 : null,
    cooldownMs: Math.max(5, c.get('cooldownSeconds', 15)) * 1000,
    timeoutMs: Math.max(5, c.get('timeoutSeconds', 30)) * 1000,
    alignment: cleanAlignment(c.get('statusbar.alignment', 'auto')),
    priority: cleanBase(c.get('statusbar.priority', DEFAULT_BASE)),
  };
}

const BACKGROUNDS = {
  warning: 'statusBarItem.warningBackground',
  error: 'statusBarItem.errorBackground',
};
const HEX = /^#[0-9A-Fa-f]{6}$/;

function activate(context) {
  const out = vscode.window.createOutputChannel('aiquota');
  const log = (msg) => out.appendLine(`${new Date().toISOString()} ${msg}`);
  context.subscriptions.push(out);

  let current = unknownRender('not measured yet', new Date());
  let pollSeconds = null;
  const byId = new Map(); // id -> item, for the click

  const reconciler = createReconciler({
    create: (item, priority) => {
      const align = item.alignment === 'left' ? vscode.StatusBarAlignment.Left : vscode.StatusBarAlignment.Right;
      const it = vscode.window.createStatusBarItem(`aiquota.${item.id}`, align, priority);
      it.name = `aiquota: ${item.id}`;
      return {
        update: (x) => {
          it.text = x.text;
          it.tooltip = x.tooltip;
          it.color = HEX.test(x.color) ? x.color : new vscode.ThemeColor(x.color);
          it.backgroundColor = BACKGROUNDS[x.background] ? new vscode.ThemeColor(BACKGROUNDS[x.background]) : undefined;
          it.command = { command: 'aiquota.itemClick', title: 'aiquota', arguments: [x.id] };
          it.show();
        },
        dispose: () => it.dispose(),
        item: it,
      };
    },
    dispose: (h) => h.dispose(),
  });

  function show(res) {
    current = res;
    pollSeconds = res.pollSeconds;
    if (res.level === 'unknown') {
      log(`unknown: ${res.reason || res.detail}`);
    }
    const c = config();
    byId.clear();
    res.items.forEach((i) => byId.set(i.id, i));
    const align = (i) => (c.alignment === 'auto' ? i.alignment : c.alignment);
    reconciler.apply(res.items.map((i) => ({ ...i, alignment: align(i) })), c.priority);
  }

  function showSafely(res) {
    try {
      show(res);
    } catch (err) {
      log(`cannot draw the render: ${err && err.stack ? err.stack : err}`);
      try {
        show(unknownRender(`extension error: ${err && err.message ? err.message : err}`, new Date()));
      } catch (err2) {
        log(`cannot draw even the unknown item: ${err2}`);
      }
    }
  }
  showSafely(current);

  const poller = createPoller({
    start: () => {
      const c = config();
      return measure({ binary: c.binary, extraArgs: c.extraArgs, timeoutMs: c.timeoutMs });
    },
    onItem: showSafely,
    onError: (err) => {
      log(`measurement failed: ${err && err.stack ? err.stack : err}`);
      showSafely(unknownRender(`extension error: ${err && err.message ? err.message : err}`, new Date()));
    },
    getConfig: () => {
      let c;
      try {
        c = config();
      } catch {
        c = { userIntervalMs: null, cooldownMs: 15000 };
      }
      return {
        intervalMs: c.userIntervalMs ?? Math.max(MIN_POLL, pollSeconds || 60) * 1000,
        cooldownMs: c.cooldownMs,
      };
    },
  });

  function detail() {
    out.clear();
    out.appendLine(current.detail || current.items.map((i) => i.text).join('\n'));
    out.show(true);
  }

  // A new version installed under a running window is not loaded until the
  // window reloads. Tuning never needs that (it is a new aiquota); only a new
  // shell does, and this one is meant to be the last.
  const mine = context.extension.packageJSON.version;
  let prompted = false;
  context.subscriptions.push(
    vscode.extensions.onDidChange(() => {
      const now = vscode.extensions.getExtension(context.extension.id);
      if (!prompted && now && now.packageJSON.version !== mine) {
        prompted = true;
        vscode.window.showInformationMessage(
          'aiquota status bar was updated: it takes effect the next time this window reloads (no hurry, the current one keeps working).',
        );
      }
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('aiquota')) {
        showSafely(current);
      }
    }),
    { dispose: () => poller.dispose() },
    { dispose: () => reconciler.disposeAll() },
    vscode.commands.registerCommand('aiquota.refresh', () => poller.poll()),
    vscode.commands.registerCommand('aiquota.showDetail', detail),
    vscode.commands.registerCommand('aiquota.itemClick', (id) => {
      const item = byId.get(id);
      const action = item ? item.command : 'detail';
      if (action === 'detail') {
        detail();
      }
      if (action === 'detail' || action === 'refresh') {
        poller.poll(); // refused inside the cooldown, so a click cannot hammer the endpoint
      }
    }),
  );
  poller.poll();
}

function deactivate() {}

module.exports = { activate, deactivate };
