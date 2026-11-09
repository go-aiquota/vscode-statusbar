// Copyright (c) the go-aiquota authors.
// SPDX-License-Identifier: BSD-3-Clause
'use strict';

// Render contract 1: the one thing this extension understands. `aiquota
// status -o statusbar --render 1` describes the whole status bar (items, their
// text, tooltip, colour, background, priority offset, alignment, click action,
// the detail text and the poll interval); this module only checks the shape.
// Nothing about WHICH items exist, how many, or how they look is in here, so a
// new aiquota changes the look without a new extension and without a reload.
// Unknown fields are ignored, so a later additive change is harmless.

const MAX_ITEMS = 32;
const BACKGROUNDS = new Set(['none', 'warning', 'error']);
const ALIGNMENTS = new Set(['right', 'left']);
const COMMANDS = new Set(['detail', 'refresh', 'none']);
const HEX = /^#[0-9A-Fa-f]{6}$/;
const THEME_ID = /^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/;
const GREY = '#DADADA';
const MIN_POLL = 30;
const MAX_POLL = 3600;

function validItem(i) {
  return Boolean(
    i && typeof i.id === 'string' && i.id.length > 0 && i.id.length <= 64 &&
    typeof i.text === 'string' && i.text.length <= 200 &&
    typeof i.tooltip === 'string' &&
    typeof i.color === 'string' && (HEX.test(i.color) || THEME_ID.test(i.color)) &&
    BACKGROUNDS.has(i.background) &&
    typeof i.priority === 'number' && Number.isFinite(i.priority) && Math.abs(i.priority) < 1000 &&
    ALIGNMENTS.has(i.alignment) && COMMANDS.has(i.command),
  );
}

// parseRender returns { items, detail, pollSeconds, level } or null.
function parseRender(stdout) {
  let v;
  try {
    v = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (!v || v.render !== 1 || !Array.isArray(v.items) || v.items.length === 0 || v.items.length > MAX_ITEMS) {
    return null;
  }
  if (!v.items.every(validItem) || new Set(v.items.map((i) => i.id)).size !== v.items.length) {
    return null;
  }
  const poll = Number.isFinite(v.poll_seconds) ? Math.min(MAX_POLL, Math.max(MIN_POLL, v.poll_seconds)) : null;
  return {
    items: v.items.map((i) => ({
      id: i.id, text: i.text, tooltip: i.tooltip, color: i.color, background: i.background,
      priority: i.priority, alignment: i.alignment, command: i.command,
    })),
    detail: typeof v.detail === 'string' ? v.detail : '',
    pollSeconds: poll,
    level: typeof v.level === 'string' ? v.level : 'unknown',
  };
}

// unknownRender is what the shell shows when it has nothing from the binary
// (missing, killed, unreadable): one grey "Claude ?" and the reason.
function unknownRender(reason, at) {
  const tooltip = `Claude usage unknown\n${reason}\nmeasured ${at.toISOString()}`;
  return {
    reason,
    items: [{ id: 'unknown', text: 'Claude ?', tooltip, color: GREY, background: 'none', priority: 0, alignment: 'right', command: 'detail' }],
    detail: tooltip,
    pollSeconds: null,
    level: 'unknown',
  };
}

module.exports = { parseRender, unknownRender, MIN_POLL, MAX_POLL };
