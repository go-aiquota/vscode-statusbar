// Copyright (c) the go-aiquota authors.
// SPDX-License-Identifier: BSD-3-Clause
'use strict';

// The shell is frozen: whatever the binary describes is drawn without a
// single change to the JS. These tests feed render descriptions the code has
// never seen (new ids, new colours, a different count, other labels, a new
// poll interval) through the real parser and reconciler into a fake status
// bar, and read back what is on it.

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRender } = require('../src/render');
const { createReconciler } = require('../src/reconcile');
const { cleanBase, cleanAlignment, DEFAULT_BASE } = require('../src/layout');

// fakeBar records what a status bar would show.
function fakeBar() {
  const shown = new Map(); // id -> { text, tooltip, color, background, command, priority, alignment }
  let created = 0;
  let disposed = 0;
  const r = createReconciler({
    create: (item, priority) => {
      created++;
      const rec = { priority, alignment: item.alignment };
      return {
        update: (x) => { Object.assign(rec, { text: x.text, tooltip: x.tooltip, color: x.color, background: x.background, command: x.command }); shown.set(x.id, rec); },
        dispose: () => { disposed++; shown.delete(item.id); },
      };
    },
    dispose: (h) => h.dispose(),
  });
  return { r, shown, counts: () => ({ created, disposed }) };
}

const doc = (items, extra = {}) => JSON.stringify({ render: 1, items, detail: 'd', poll_seconds: 45, level: 'ok', ...extra });
const mk = (id, extra = {}) => ({
  id, text: id, tooltip: `tip ${id}`, color: '#112233', background: 'none', priority: 0, alignment: 'right', command: 'detail', ...extra,
});

test('a new item, a new colour and a different count show up with no JS change', () => {
  const bar = fakeBar();
  bar.r.apply(parseRender(doc([mk('session'), mk('weekly', { priority: -0.001 })])).items, DEFAULT_BASE);
  assert.deepEqual([...bar.shown.keys()], ['session', 'weekly']);

  // Five items, one never seen before, with colours and a theme colour id nobody coded for.
  const next = parseRender(doc([
    mk('session', { color: '#B9F6CA' }),
    mk('weekly', { color: '#FF00FF', priority: -0.001, background: 'warning' }),
    mk('opus-2027', { text: 'Opus 41%', color: 'charts.purple', priority: -0.002 }),
    mk('burn-rate', { text: '3%/h', priority: -0.003, command: 'refresh' }),
    mk('extra', { priority: -0.004, command: 'none' }),
  ]));
  bar.r.apply(next.items, DEFAULT_BASE);
  assert.equal(bar.shown.size, 5);
  assert.equal(bar.shown.get('session').color, '#B9F6CA');
  assert.equal(bar.shown.get('weekly').color, '#FF00FF');
  assert.equal(bar.shown.get('weekly').background, 'warning');
  assert.equal(bar.shown.get('opus-2027').text, 'Opus 41%');
  assert.equal(bar.shown.get('opus-2027').color, 'charts.purple');
  assert.equal(bar.shown.get('burn-rate').command, 'refresh');

  // Fewer again: the extras are disposed.
  bar.r.apply(parseRender(doc([mk('session')])).items, DEFAULT_BASE);
  assert.deepEqual([...bar.shown.keys()], ['session']);
  assert.equal(bar.counts().disposed, 4);
});

test('the order, the priorities and the alignment come from the description', () => {
  const bar = fakeBar();
  bar.r.apply(parseRender(doc([mk('b', { priority: -0.002 }), mk('a', { priority: -0.001, alignment: 'left' }), mk('c', { priority: 0 })])).items, 50);
  assert.equal(bar.shown.get('c').priority, 50);
  assert.equal(bar.shown.get('a').priority, 50 - 0.001);
  assert.equal(bar.shown.get('a').alignment, 'left');
  const order = [...bar.shown.entries()].sort((x, y) => y[1].priority - x[1].priority).map(([id]) => id);
  assert.deepEqual(order, ['c', 'a', 'b']);
});

test('a changed priority or alignment re-creates the item, a changed text only updates it', () => {
  const bar = fakeBar();
  bar.r.apply(parseRender(doc([mk('a')])).items, 100);
  assert.equal(bar.counts().created, 1);
  bar.r.apply(parseRender(doc([mk('a', { text: 'new text' })])).items, 100);
  assert.equal(bar.counts().created, 1, 'text change must not re-create');
  assert.equal(bar.shown.get('a').text, 'new text');
  bar.r.apply(parseRender(doc([mk('a', { priority: -0.5 })])).items, 100);
  assert.equal(bar.counts().created, 2);
  assert.equal(bar.counts().disposed, 1);
  bar.r.apply(parseRender(doc([mk('a', { priority: -0.5, alignment: 'left' })])).items, 100);
  assert.equal(bar.counts().created, 3);
});

test('the poll interval comes from the description, clamped to 30..3600 s', () => {
  assert.equal(parseRender(doc([mk('a')], { poll_seconds: 45 })).pollSeconds, 45);
  assert.equal(parseRender(doc([mk('a')], { poll_seconds: 1 })).pollSeconds, 30);
  assert.equal(parseRender(doc([mk('a')], { poll_seconds: 1e9 })).pollSeconds, 3600);
  assert.equal(parseRender(doc([mk('a')], { poll_seconds: undefined })).pollSeconds, null);
});

test('unknown fields are ignored; malformed or unsafe items are refused as a whole', () => {
  const r = parseRender(doc([mk('a', { futureField: { x: 1 } })], { another: true }));
  assert.deepEqual(Object.keys(r.items[0]).sort(), ['alignment', 'background', 'color', 'command', 'id', 'priority', 'text', 'tooltip']);
  assert.equal(parseRender(doc([mk('a', { color: 'red; x' })])), null);
  assert.equal(parseRender(doc([mk('a', { background: 'statusBar.background' })])), null);
  assert.equal(parseRender(doc([mk('a', { command: 'rm -rf' })])), null);
  assert.equal(parseRender(doc([mk('a'), mk('a')])), null, 'duplicate id');
  assert.equal(parseRender(doc([mk('a', { priority: 1e9 })])), null);
  assert.equal(parseRender(doc(Array.from({ length: 33 }, (_, i) => mk(`i${i}`)))), null);
  assert.equal(parseRender(JSON.stringify({ render: 2, items: [mk('a')] })), null, 'an unknown render is not guessed at');
});

test('the group stays contiguous: default base is off every integer, offsets inside (-1, 0]', () => {
  assert.equal(DEFAULT_BASE % 1 !== 0, true);
  assert.ok(DEFAULT_BASE > 100, 'left of token-optimizer-statusline (100, 99)');
  assert.equal(cleanBase('x'), DEFAULT_BASE);
  assert.equal(cleanBase(NaN), DEFAULT_BASE);
  assert.equal(cleanBase(7), 7);
  assert.equal(cleanAlignment('left'), 'left');
  assert.equal(cleanAlignment('middle'), 'auto');
});
