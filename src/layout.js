// Copyright (c) the go-aiquota authors.
// SPDX-License-Identifier: BSD-3-Clause
'use strict';

// The user's two layout settings. The base priority is where the whole group
// sits; each item adds the offset the binary gives it. VS Code: "Higher values
// mean the item should be shown more to the left" (vscode.d.ts,
// window.createStatusBarItem). The default base is right of nothing and left
// of the token-optimizer-statusline items (priorities 100 and 99), and off
// every integer, so with offsets inside (-1, 0] no integer priority of another
// extension falls between our items.

const DEFAULT_BASE = 100.5;

function cleanBase(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : DEFAULT_BASE;
}

// 'auto' (the default) lets the binary's own alignment stand.
function cleanAlignment(v) {
  return v === 'left' || v === 'right' ? v : 'auto';
}

module.exports = { cleanBase, cleanAlignment, DEFAULT_BASE };
