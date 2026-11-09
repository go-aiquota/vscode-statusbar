// Copyright (c) the go-aiquota authors.
// SPDX-License-Identifier: BSD-3-Clause
'use strict';

// One measurement at a time, never two closer than cooldownMs, an interval
// timer, and a kill on dispose. `start` runs a measurement and returns
// { promise, kill }; `onItem` receives each result.

function createPoller({ start, onItem, onError, getConfig, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
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
    let job;
    try {
      job = start();
    } catch (err) {
      if (onError) {
        onError(err);
      }
      schedule();
      return false;
    }
    running = job;
    // A failure of the job or of onItem must neither leave `running` set nor
    // stop the timer: the next poll tries again.
    job.promise
      .then((item) => {
        running = null;
        if (!disposed) {
          onItem(item);
        }
      })
      .catch((err) => {
        running = null;
        if (!disposed && onError) {
          onError(err);
        }
      })
      .finally(() => {
        running = null;
        schedule();
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
