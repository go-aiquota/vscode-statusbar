// Copyright (c) the go-aiquota authors.
// SPDX-License-Identifier: BSD-3-Clause
'use strict';

// Priorities of the aiquota items. VS Code: "Higher values mean the item
// should be shown more to the left" (vscode.d.ts, window.createStatusBarItem),
// and items of one alignment are ordered by priority alone. Another
// extension's item with the same priority would interleave with ours, so every
// item takes the base minus a tiny step: all of them lie inside
// (base - 1, base], where no other extension's integer priority can fall.

const STEP = 0.001;
const MAX_ITEMS = 16;
// Right of the token-optimizer-statusline items (priorities 100 and 99), at
// the left end of the right-hand group, and off every integer.
const DEFAULT_BASE = 100.5;

function priorities(base, n) {
  const count = Math.min(Math.max(0, n), MAX_ITEMS);
  return Array.from({ length: count }, (_, i) => base - i * STEP);
}

function cleanBase(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : DEFAULT_BASE;
}

function cleanAlignment(v) {
  return v === 'left' ? 'left' : 'right';
}

module.exports = { priorities, cleanBase, cleanAlignment, STEP, MAX_ITEMS, DEFAULT_BASE };
