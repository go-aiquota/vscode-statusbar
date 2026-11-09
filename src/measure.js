// Copyright (c) the go-aiquota authors.
// SPDX-License-Identifier: BSD-3-Clause
'use strict';

// Runs `aiquota status -o statusbar` and returns the item to show. All the
// logic (reading, verdicts, the text, the tooltip, the level) is the Go
// binary's; this only runs it and relays its answer. Exit statuses 1
// (exhausted) and 3 (unknown) still carry a JSON object on stdout.

const { execFile } = require('node:child_process');

const LEVELS = new Set(['ok', 'warn', 'error', 'unknown']);

function unknownItem(reason, at) {
  return {
    text: 'Claude ?',
    level: 'unknown',
    tooltip: `Claude usage unknown\n${reason}\nmeasured ${at.toISOString()}`,
  };
}

// parseItem turns the binary's stdout into an item, or null when it is not one.
function parseItem(stdout) {
  let v;
  try {
    v = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (!v || v.version !== 1 || typeof v.text !== 'string' || typeof v.tooltip !== 'string' || !LEVELS.has(v.level)) {
    return null;
  }
  return { text: v.text, tooltip: v.tooltip, level: v.level };
}

// measure(opts) -> { promise, kill }. opts: binary, warn, critical, timeoutMs,
// now (injectable), execFile (injectable). Never rejects: a failure is an
// unknown item, never a stale number.
function measure(opts) {
  const now = opts.now || (() => new Date());
  const run = opts.execFile || execFile;
  let child = null;
  const promise = new Promise((resolve) => {
    child = run(
      opts.binary,
      ['status', '-o', 'statusbar', '--warn', String(opts.warn), '--critical', String(opts.critical)],
      { timeout: opts.timeoutMs, killSignal: 'SIGKILL', maxBuffer: 1 << 20, windowsHide: true, encoding: 'utf8' },
      (err, stdout) => {
        const item = parseItem(stdout || '');
        if (item) {
          return resolve(item);
        }
        if (err && err.killed) {
          return resolve(unknownItem(`aiquota did not answer within ${Math.round(opts.timeoutMs / 1000)} s and was killed`, now()));
        }
        if (err && err.code === 'ENOENT') {
          return resolve(unknownItem(`aiquota not found at ${opts.binary} (set aiquota.binaryPath)`, now()));
        }
        if (err && typeof err.code === 'number') {
          return resolve(unknownItem(`aiquota exited ${err.code} without a status bar answer (is it v0.3.0 or newer?)`, now()));
        }
        return resolve(unknownItem(err ? String(err.message || err) : 'unreadable answer from aiquota', now()));
      },
    );
  });
  return { promise, kill: () => child && child.kill('SIGKILL') };
}

module.exports = { measure, parseItem, unknownItem };
