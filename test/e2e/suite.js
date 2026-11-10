// Copyright (c) the go-aiquota authors.
// SPDX-License-Identifier: BSD-3-Clause
'use strict';

// Runs INSIDE VS Code (loaded by @vscode/test-electron). The extension under
// test is the one installed from the .vsix; its activate() returns `shown()`,
// what it has drawn, because no API lets one extension read another's status
// bar items.

const assert = require('node:assert/strict');
const vscode = require('vscode');

const ID = 'go-aiquota.aiquota-statusbar';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(what, ok, ms = 30000) {
  const end = Date.now() + ms;
  let last;
  for (;;) {
    last = ok();
    if (last) {
      return last;
    }
    if (Date.now() > end) {
      throw new Error(`timed out waiting for ${what}`);
    }
    await sleep(200);
  }
}

async function run() {
  const scenario = process.env.AIQUOTA_SCENARIO;
  const ext = vscode.extensions.getExtension(ID);
  assert.ok(ext, `${ID} is not installed in this VS Code`);
  await ext.activate();
  assert.equal(ext.extensionPath.includes('dummy'), false, 'the extension under test must be the installed one');
  const api = ext.exports;
  assert.equal(typeof api.shown, 'function', 'activate() returned no shown()');

  // The first draw is the "not measured yet" placeholder; wait for a measurement.
  const s = await waitFor('the first measurement to be drawn', () => (api.shown().measurements >= 1 ? api.shown() : null));

  if (scenario === 'good') {
    assert.deepEqual(s.items.map((i) => i.id), ['w0', 'w1', 'w2']);
    assert.deepEqual(s.items.map((i) => i.text), ['Claude 5h 30%', '7d 5%', 'Fable 0%']);
    assert.equal(s.level, 'ok');
    assert.equal(s.items[0].color, '#B9F6CA');
  } else if (scenario === 'broken') {
    assert.equal(s.items.length, 1, JSON.stringify(s));
    assert.equal(s.items[0].text, 'Claude ?');
    assert.equal(s.level, 'unknown');
  } else {
    throw new Error(`unknown scenario ${scenario}`);
  }
  console.log(`e2e ${scenario}: ok, drew ${JSON.stringify(s.items.map((i) => i.text))} at level ${s.level}`);
}

module.exports = { run };
