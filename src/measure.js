// Copyright (c) the go-aiquota authors.
// SPDX-License-Identifier: BSD-3-Clause
'use strict';

// Runs `aiquota status -o statusbar` and returns the item to show. All the
// logic (reading, verdicts, the text, the tooltip, the level) is the Go
// binary's; this only runs it and relays its answer. Exit statuses 1
// (exhausted) and 3 (unknown) still carry a JSON object on stdout.

const { execFile } = require('node:child_process');

const LEVELS = new Set(['ok', 'warn', 'error', 'unknown']);
const BACKGROUNDS = new Set(['none', 'warning', 'error']);
const HEX = /^#[0-9A-Fa-f]{6}$/;

// Grey of an unreadable usage; the binary's own unknown item has the same.
const UNKNOWN_COLOR = '#DADADA';

// The oldest contract this extension reads. It asks the binary for exactly
// this version (--format-version), and reads the fields it knows of any
// newer one, so a newer binary never breaks it within the major.
const MIN_VERSION = 2;

function unknownItem(reason, at) {
  return {
    reason,
    text: 'Claude ?',
    level: 'unknown',
    tooltip: `Claude usage unknown\n${reason}\nmeasured ${at.toISOString()}`,
    items: [{ id: 'unknown', text: 'Claude ?', percent: 0, band: -1, color: UNKNOWN_COLOR, background: 'none' }],
  };
}

function validItem(i) {
  return (
    i && typeof i.id === 'string' && typeof i.text === 'string' && Number.isInteger(i.band) &&
    typeof i.color === 'string' && HEX.test(i.color) && BACKGROUNDS.has(i.background)
  );
}

// parseItem turns the binary's stdout into an item, or null when it is not one.
function parseItem(stdout) {
  let v;
  try {
    v = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (
    !v || !Number.isInteger(v.version) || v.version < MIN_VERSION || typeof v.text !== 'string' || typeof v.tooltip !== 'string' || !LEVELS.has(v.level) ||
    !Array.isArray(v.items) || v.items.length === 0 || !v.items.every(validItem)
  ) {
    return null;
  }
  return { text: v.text, tooltip: v.tooltip, level: v.level, items: v.items };
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
      ['status', '-o', 'statusbar', '--warn', String(opts.warn), '--critical', String(opts.critical), '--bands', String(opts.bands), '--format-version', String(MIN_VERSION)],
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
          return resolve(unknownItem(`aiquota exited ${err.code} without a status bar answer (is it v0.5.0 or newer?)`, now()));
        }
        return resolve(unknownItem(err ? String(err.message || err) : 'unreadable answer from aiquota', now()));
      },
    );
  });
  return { promise, kill: () => child && child.kill('SIGKILL') };
}

module.exports = { measure, parseItem, unknownItem, MIN_VERSION };
