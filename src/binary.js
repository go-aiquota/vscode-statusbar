// Copyright (c) the go-aiquota authors.
// SPDX-License-Identifier: BSD-3-Clause
'use strict';

// Where the aiquota binary is, and the environment it is started in.
//
// aiquota starts the provider plugin `go-aiquota-plugin-claude` by looking it
// up on PATH. An editor started from a desktop launcher (macOS Dock, Windows
// Start menu, Linux menu) has a minimal PATH, so a plugin installed next to
// aiquota would not be found: the directory of the binary is put first on the
// PATH of the child process (and of that child only).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// searchDirs lists, in order, where an installed aiquota is looked for when
// aiquota.binaryPath is empty: ~/.local/bin (the documented place), then
// Go's install directory ($GOBIN, $GOPATH/bin, ~/go/bin), then, on Windows,
// %LOCALAPPDATA%\aiquota.
function searchDirs({ platform, home, env, pathMod }) {
  const dirs = [pathMod.join(home, '.local', 'bin')];
  if (env.GOBIN) {
    dirs.push(env.GOBIN);
  }
  for (const gp of (env.GOPATH || '').split(pathMod.delimiter)) {
    if (gp) {
      dirs.push(pathMod.join(gp, 'bin'));
    }
  }
  dirs.push(pathMod.join(home, 'go', 'bin'));
  if (platform === 'win32' && env.LOCALAPPDATA) {
    dirs.push(pathMod.join(env.LOCALAPPDATA, 'aiquota'));
  }
  return dirs;
}

// resolveBinary returns the configured path as it is, or else the first
// existing aiquota (aiquota.exe on Windows) of searchDirs, or else the first
// candidate, so that "not found at <path>" names the documented place.
function resolveBinary(configured, deps = {}) {
  if (configured) {
    return configured;
  }
  const platform = deps.platform || process.platform;
  const pathMod = platform === 'win32' ? path.win32 : path.posix;
  const exists = deps.exists || ((p) => fs.existsSync(p));
  const exe = platform === 'win32' ? 'aiquota.exe' : 'aiquota';
  const dirs = searchDirs({ platform, home: deps.home || os.homedir(), env: deps.env || process.env, pathMod });
  const files = dirs.map((d) => pathMod.join(d, exe));
  return files.find((f) => exists(f)) || files[0];
}

// childEnv is env with the directory of binary first on PATH. A bare name
// (found on PATH already) changes nothing.
function childEnv(binary, env = process.env, platform = process.platform) {
  const pathMod = platform === 'win32' ? path.win32 : path.posix;
  if (!pathMod.isAbsolute(binary)) {
    return env;
  }
  const key = Object.keys(env).find((k) => (platform === 'win32' ? k.toUpperCase() === 'PATH' : k === 'PATH')) || 'PATH';
  const dir = pathMod.dirname(binary);
  const rest = env[key] ? pathMod.delimiter + env[key] : '';
  return { ...env, [key]: dir + rest };
}

module.exports = { resolveBinary, childEnv, searchDirs };
