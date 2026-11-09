// Copyright (c) the go-aiquota authors.
// SPDX-License-Identifier: BSD-3-Clause
'use strict';

// One measurement at a time, never two closer than cooldownMs, an interval
// timer, and a kill on dispose. `start` runs a measurement and returns
// { promise, kill }; `onItem` receives each result.

function createPoller({ start, onItem, getConfig, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let running = null;
  let last = -Infinity;
  let timer = null;
  let disposed = false;

  function schedule() {
    if (disposed) {
      return;
    }
    clearTimer(timer);
    timer = setTimer(() => poll(), getConfig().intervalMs);
  }

  // poll returns true when a measurement was started.
  function poll() {
    if (disposed || running) {
      return false;
    }
    const cfg = getConfig();
    if (now() - last < cfg.cooldownMs) {
      schedule();
      return false;
    }
    last = now();
    const job = start();
    running = job;
    job.promise.then((item) => {
      running = null;
      if (!disposed) {
        onItem(item);
        schedule();
      }
    });
    return true;
  }

  function dispose() {
    disposed = true;
    clearTimer(timer);
    if (running) {
      running.kill();
      running = null;
    }
  }

  return { poll, dispose, isRunning: () => running !== null };
}

module.exports = { createPoller };
