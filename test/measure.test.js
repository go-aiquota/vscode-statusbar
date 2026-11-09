// Copyright (c) the go-aiquota authors.
// SPDX-License-Identifier: BSD-3-Clause
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { measure } = require('../src/measure');
const { createPoller } = require('../src/poller');

const at = new Date('2026-11-09T12:00:00Z');
const item = (id, extra = {}) => ({
  id, text: `t-${id}`, tooltip: 'tip', color: '#FFF59D', background: 'none', priority: 0, alignment: 'right', command: 'detail', ...extra,
});
const good = JSON.stringify({ render: 1, items: [item('a'), item('b', { priority: -0.001 })], detail: 'd', poll_seconds: 60, level: 'ok' });

// fakeExec calls back as execFile would; err may carry code/killed.
const fakeExec = (err, stdout) => (_bin, _args, _opts, cb) => {
  setImmediate(() => cb(err, stdout));
  return { kill() {} };
};
const base = { binary: '/x/aiquota', timeoutMs: 1000, now: () => at };

test('relays the render as it is', async () => {
  const r = await measure({ ...base, execFile: fakeExec(null, good) }).promise;
  assert.equal(r.items.length, 2);
  assert.equal(r.detail, 'd');
  assert.equal(r.pollSeconds, 60);
});

test('exit 1 and 3 still carry a render on stdout', async () => {
  const r = await measure({ ...base, execFile: fakeExec(Object.assign(new Error('x'), { code: 1 }), good) }).promise;
  assert.equal(r.items.length, 2);
});

test('asks for render 1 and passes only the flags the user set', async () => {
  let seen;
  const exec = (bin, args, opts, cb) => {
    seen = { bin, args, opts };
    setImmediate(() => cb(null, good));
    return { kill() {} };
  };
  await measure({ ...base, execFile: exec }).promise;
  assert.deepEqual(seen.args, ['status', '-o', 'statusbar', '--render', '1']);
  assert.equal(seen.opts.killSignal, 'SIGKILL');
  assert.equal(seen.opts.timeout, 1000);
  await measure({ ...base, extraArgs: ['--warn', '60'], execFile: exec }).promise;
  assert.deepEqual(seen.args, ['status', '-o', 'statusbar', '--render', '1', '--warn', '60']);
});

for (const [name, err, stdout, want] of [
  ['missing binary', Object.assign(new Error('x'), { code: 'ENOENT' }), '', 'not found'],
  ['timeout kill', Object.assign(new Error('x'), { killed: true }), '', 'killed'],
  ['old binary (exit 2)', Object.assign(new Error('x'), { code: 2 }), '', 'v0.6.0'],
  ['garbage stdout', null, 'not json', 'unreadable'],
  ['a format-version 2 answer', null, '{"version":2,"text":"a","tooltip":"b","level":"ok","items":[]}', 'unreadable'],
  ['an empty item list', null, '{"render":1,"items":[]}', 'unreadable'],
]) {
  test(`${name} is one grey "Claude ?", never a number, never empty`, async () => {
    const r = await measure({ ...base, execFile: fakeExec(err, stdout) }).promise;
    assert.equal(r.items.length, 1);
    assert.equal(r.items[0].text, 'Claude ?');
    assert.equal(r.items[0].color, '#DADADA');
    assert.equal(r.level, 'unknown');
    assert.ok(r.items[0].tooltip.includes(want), r.items[0].tooltip);
    assert.ok(r.items[0].tooltip.includes('measured 2026-11-09T12:00:00.000Z'));
  });
}

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

test('a poller survives a start that throws and a job that rejects', async () => {
  const errors = [];
  const timers = [];
  let n = 0;
  const p = createPoller({
    start: () => {
      n++;
      if (n === 1) {
        throw new Error('config unreadable');
      }
      return { kill() {}, promise: Promise.reject(new Error('boom')) };
    },
    onItem: () => {},
    onError: (e) => errors.push(e.message),
    getConfig: () => ({ intervalMs: 60000, cooldownMs: 0 }),
    now: () => n * 100000,
    setTimer: (fn, ms) => { timers.push(ms); return timers.length; },
    clearTimer: () => {},
  });
  assert.equal(p.poll(), false);
  assert.equal(p.poll(), true);
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(errors, ['config unreadable', 'boom']);
  assert.equal(p.isRunning(), false);
  assert.equal(timers.length, 2, 'the timer is re-armed after each failure');
});
