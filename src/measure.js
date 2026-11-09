// Copyright (c) the go-aiquota authors.
// SPDX-License-Identifier: BSD-3-Clause
'use strict';

// Runs `aiquota status -o statusbar --render 1` and returns the render it
// prints. Nothing else is asked or decided here. Exit statuses 1 (exhausted)
// and 3 (unknown) still carry the JSON on stdout. Any failure is an unknown
// render (a grey "Claude ?" and the reason), never a stale number, never empty.

const { execFile } = require('node:child_process');
const { parseRender, unknownRender } = require('./render');

// measure(opts) -> { promise, kill }. opts: binary, extraArgs (flags the user
// set explicitly; none by default, so the binary's own defaults rule),
// timeoutMs, now and execFile (injectable). The promise never rejects.
function measure(opts) {
  const now = opts.now || (() => new Date());
  const run = opts.execFile || execFile;
  let child = null;
  const promise = new Promise((resolve) => {
    child = run(
      opts.binary,
      ['status', '-o', 'statusbar', '--render', '1', ...(opts.extraArgs || [])],
      { timeout: opts.timeoutMs, killSignal: 'SIGKILL', maxBuffer: 1 << 20, windowsHide: true, encoding: 'utf8' },
      (err, stdout) => {
        const r = parseRender(stdout || '');
        if (r) {
          return resolve(r);
        }
        if (err && err.killed) {
          return resolve(unknownRender(`aiquota did not answer within ${Math.round(opts.timeoutMs / 1000)} s and was killed`, now()));
        }
        if (err && err.code === 'ENOENT') {
          return resolve(unknownRender(`aiquota not found at ${opts.binary} (set aiquota.binaryPath)`, now()));
        }
        if (err && typeof err.code === 'number') {
          return resolve(unknownRender(`aiquota exited ${err.code} without a render description (is it v0.6.0 or newer?)`, now()));
        }
        return resolve(unknownRender(err ? String(err.message || err) : 'unreadable answer from aiquota', now()));
      },
    );
  });
  return { promise, kill: () => child && child.kill('SIGKILL') };
}

module.exports = { measure };
