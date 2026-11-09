// Copyright (c) the go-aiquota authors.
// SPDX-License-Identifier: BSD-3-Clause
'use strict';

// Makes the live status bar items match a list of described items: creates the
// missing ones, updates the present ones, disposes the ones no longer listed.
// An item's alignment and priority can only be set when it is created, so a
// change of either re-creates it. `create(item, priority)` returns a handle
// with update(item) and dispose(); the vscode specifics live in the caller.

function createReconciler({ create, dispose }) {
  const live = new Map(); // id -> { key, handle }

  function apply(items, basePriority) {
    const wanted = new Set(items.map((i) => i.id));
    for (const [id, cur] of live) {
      if (!wanted.has(id)) {
        dispose(cur.handle);
        live.delete(id);
      }
    }
    for (const item of items) {
      const priority = basePriority + item.priority;
      const key = `${item.alignment}/${priority}`;
      let cur = live.get(item.id);
      if (cur && cur.key !== key) {
        dispose(cur.handle);
        live.delete(item.id);
        cur = undefined;
      }
      if (!cur) {
        cur = { key, handle: create(item, priority) };
        live.set(item.id, cur);
      }
      cur.handle.update(item);
    }
  }

  function disposeAll() {
    for (const cur of live.values()) {
      dispose(cur.handle);
    }
    live.clear();
  }

  return { apply, disposeAll, size: () => live.size };
}

module.exports = { createReconciler };
