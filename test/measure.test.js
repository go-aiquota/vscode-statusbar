// Copyright (c) the go-aiquota authors.
// SPDX-License-Identifier: BSD-3-Clause
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { measure, parseItem } = require('../src/measure');
const { createPoller } = require('../src/poller');

const at = new Date('2026-11-09T12:00:00Z');
const good = JSON.stringify({ version: 1, text: 'Claude 30% · 5%', tooltip: 't', level: 'ok', verdict: 'available' });

// fakeExec calls back as execFile would; err may carry code/killed.
const fakeExec = (err, stdout) => (_bin, _args, _opts, cb) => {
  setImmediate(() => cb(err, stdout));
  return { kill() {} };
};
const base = { binary: '/x/aiquota', warn: 75, critical: 90, timeoutMs: 1000, now: () => at };

test('relays the binary item as it is', async () => {
  const it = await measure({ ...base, execFile: fakeExec(null, good) }).promise;
  assert.deepEqual(it, { text: 'Claude 30% · 5%', tooltip: 't', level: 'ok' });
});

test('exit 1 and 3 still carry an item on stdout', async () => {
  const it = await measure({ ...base, execFile: fakeExec(Object.assign(new Error('x'), { code: 1 }), good) }).promise;
  assert.equal(it.text, 'Claude 30% · 5%');
});

test('passes the thresholds as arguments and nothing secret', async () => {
  let seen;
  await measure({
    ...base,
    execFile: (bin, args, opts, cb) => {
      seen = { bin, args, opts };
      setImmediate(() => cb(null, good));
      return { kill() {} };
    },
  }).promise;
  assert.deepEqual(seen.args, ['status', '-o', 'statusbar', '--warn', '75', '--critical', '90']);
  assert.equal(seen.opts.killSignal, 'SIGKILL');
  assert.equal(seen.opts.timeout, 1000);
});

for (const [name, err, stdout, want] of [
  ['missing binary', Object.assign(new Error('x'), { code: 'ENOENT' }), '', 'not found'],
  ['timeout kill', Object.assign(new Error('x'), { killed: true }), '', 'killed'],
  ['old binary (exit 2)', Object.assign(new Error('x'), { code: 2 }), '', 'v0.3.0'],
  ['garbage stdout', null, 'not json', 'unreadable'],
  ['wrong version', null, '{"version":2,"text":"a","tooltip":"b","level":"ok"}', 'unreadable'],
]) {
  test(`${name} is Claude ?, never a number`, async () => {
    const it = await measure({ ...base, execFile: fakeExec(err, stdout) }).promise;
    assert.equal(it.text, 'Claude ?');
    assert.equal(it.level, 'unknown');
    assert.ok(it.tooltip.includes(want), it.tooltip);
    assert.ok(it.tooltip.includes('measured 2026-11-09T12:00:00.000Z'));
  });
}

test('parseItem rejects an unknown level', () => {
  assert.equal(parseItem('{"version":1,"text":"a","tooltip":"b","level":"purple"}'), null);
});

// A manual job: resolve() ends it.
function jobs() {
  const list = [];
  return {
    list,
    start: () => {
      let resolve;
      const j = { killed: false, kill() { j.killed = true; }, promise: new Promise((r) => { resolve = r; }) };
      j.resolve = resolve;
      list.push(j);
      return j;
    },
  };
}

test('one process at a time, cooldown, dispose kills', async () => {
  let t = 1000000;
  const j = jobs();
  const items = [];
  const timers = [];
  const p = createPoller({
    start: j.start,
    onItem: (i) => items.push(i),
    getConfig: () => ({ intervalMs: 60000, cooldownMs: 15000 }),
    now: () => t,
    setTimer: (fn, ms) => { timers.push(ms); return timers.length; },
    clearTimer: () => {},
  });
  assert.equal(p.poll(), true);
  assert.equal(p.poll(), false, 'second poll while running');
  assert.equal(j.list.length, 1);
  j.list[0].resolve('a');
  await j.list[0].promise;
  await new Promise(setImmediate);
  assert.deepEqual(items, ['a']);
  assert.deepEqual(timers, [60000]);
  t += 5000;
  assert.equal(p.poll(), false, 'inside the cooldown');
  t += 15000;
  assert.equal(p.poll(), true);
  p.dispose();
  assert.equal(j.list[1].killed, true);
});
