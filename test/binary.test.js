// Copyright (c) the go-aiquota authors.
// SPDX-License-Identifier: BSD-3-Clause
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveBinary, childEnv } = require('../src/binary');
const { measure } = require('../src/measure');

test('a configured path is used as it is', () => {
  assert.equal(resolveBinary('/opt/x/aiquota', { exists: () => false }), '/opt/x/aiquota');
});

test('empty setting: ~/.local/bin first, then Go install directories', () => {
  const deps = { platform: 'linux', home: '/home/u', env: { GOBIN: '/gobin', GOPATH: '/gp1:/gp2' } };
  assert.equal(resolveBinary('', { ...deps, exists: () => true }), '/home/u/.local/bin/aiquota');
  const only = (want) => resolveBinary('', { ...deps, exists: (p) => p === want });
  assert.equal(only('/gobin/aiquota'), '/gobin/aiquota');
  assert.equal(only('/gp2/bin/aiquota'), '/gp2/bin/aiquota');
  assert.equal(only('/home/u/go/bin/aiquota'), '/home/u/go/bin/aiquota');
});

test('nothing found: the documented place is named', () => {
  assert.equal(resolveBinary('', { platform: 'darwin', home: '/Users/u', env: {}, exists: () => false }), '/Users/u/.local/bin/aiquota');
});

test('Windows looks for aiquota.exe, including %LOCALAPPDATA%\\aiquota', () => {
  const deps = { platform: 'win32', home: 'C:\\Users\\u', env: { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' } };
  assert.equal(resolveBinary('', { ...deps, exists: () => false }), 'C:\\Users\\u\\.local\\bin\\aiquota.exe');
  const want = 'C:\\Users\\u\\AppData\\Local\\aiquota\\aiquota.exe';
  assert.equal(resolveBinary('', { ...deps, exists: (p) => p === want }), want);
  const goBin = 'C:\\Users\\u\\go\\bin\\aiquota.exe';
  assert.equal(resolveBinary('', { ...deps, exists: (p) => p === goBin }), goBin);
});

test('the binary directory leads the PATH of the child, so the plugin beside it is found', () => {
  const env = childEnv('/opt/q/aiquota', { PATH: '/usr/bin:/bin', HOME: '/h' }, 'linux');
  assert.equal(env.PATH, '/opt/q:/usr/bin:/bin');
  assert.equal(env.HOME, '/h');
  const win = childEnv('C:\\q\\aiquota.exe', { Path: 'C:\\Windows' }, 'win32');
  assert.equal(win.Path, 'C:\\q;C:\\Windows');
  const bare = { PATH: '/usr/bin' };
  assert.equal(childEnv('aiquota', bare, 'linux'), bare);
});

test('measure starts the binary with that environment', async () => {
  let seen;
  const exec = (_b, _a, opts, cb) => {
    seen = opts.env;
    setImmediate(() => cb(new Error('x'), ''));
    return { kill() {} };
  };
  await measure({ binary: '/opt/q/aiquota', timeoutMs: 1000, execFile: exec }).promise;
  assert.ok(seen.PATH.startsWith('/opt/q'), seen.PATH);
});
