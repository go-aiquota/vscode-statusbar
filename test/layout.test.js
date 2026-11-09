// Copyright (c) the go-aiquota authors.
// SPDX-License-Identifier: BSD-3-Clause
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { priorities, cleanBase, cleanAlignment, DEFAULT_BASE, MAX_ITEMS } = require('../src/layout');

test('priorities are strictly decreasing and inside (base-1, base]', () => {
  for (const base of [DEFAULT_BASE, 100, 0, -5.25, 1e6]) {
    const ps = priorities(base, 8);
    assert.equal(ps.length, 8);
    assert.equal(ps[0], base);
    for (let i = 0; i < ps.length; i++) {
      assert.ok(ps[i] > base - 1 && ps[i] <= base, `${ps[i]} outside (${base - 1}, ${base}]`);
      if (i > 0) {
        assert.ok(ps[i] < ps[i - 1], 'not strictly decreasing');
      }
    }
  }
});

test('no integer priority another extension may use falls between ours', () => {
  const ps = priorities(DEFAULT_BASE, 8);
  for (let k = 90; k <= 110; k++) {
    const between = k < ps[0] && k > ps[ps.length - 1];
    assert.equal(between, false, `integer ${k} sits inside the range`);
  }
  // token-optimizer-statusline uses 100 and 99: both lie outside, to our right.
  assert.ok(100 < ps[ps.length - 1] || 100 < ps[0]);
  assert.ok(ps.every((p) => p > 100), 'default base stays left of priorities 100 and 99');
});

test('the count is bounded and the settings are sanitised', () => {
  assert.equal(priorities(100.5, 1000).length, MAX_ITEMS);
  assert.equal(priorities(100.5, -3).length, 0);
  assert.equal(cleanBase('x'), DEFAULT_BASE);
  assert.equal(cleanBase(NaN), DEFAULT_BASE);
  assert.equal(cleanBase(42), 42);
  assert.equal(cleanAlignment('left'), 'left');
  assert.equal(cleanAlignment('middle'), 'right');
});
