# vscode-statusbar

A VS Code status bar item that always shows the Claude usage measured by
[`aiquota`](https://github.com/go-aiquota/tray): the same numbers as the Claude
Code extension's "Account & usage" view, but visible permanently instead of
scrolling away.

```
Claude 30% · 5%        session (5 h) · weekly (7 day)
```

Hover for every window (including the per-model weekly one), its reset time,
the plan and the measurement time. Click to open the detail in the "aiquota"
output channel. The item turns to the status bar's warning colour from 75 %
and to its error colour from 90 % (or when a window is exhausted). When the
usage cannot be read it shows `Claude ?` with the reason in the tooltip, never
a stale number.

## Design

The extension is a deliberately thin JavaScript shell, because VS Code
extensions must be JS/TS and the fleet's logic lives in Go. It only runs
`aiquota status -o statusbar` on an interval and shows the one JSON object it
prints (`text`, `tooltip`, `level`). Reading the credential, the endpoint,
verdicts, thresholds and wording are all in the Go binary, tested there. No
secret passes through the extension.

- one process at a time; one that exceeds the timeout is killed (SIGKILL);
- an interval (default 60 s, minimum 30 s) and a cooldown (default 15 s,
  minimum 5 s) that also covers clicks and the refresh command, so the usage
  endpoint is not hammered;
- any failure (binary missing, too old, timeout, garbage) is `Claude ?`.

## Install

Needs `aiquota` v0.3.0 or newer (the release that adds `-o statusbar`):

```
GOBIN=~/.local/bin go install github.com/go-aiquota/tray/cmd/aiquota@latest
```

Download `aiquota-statusbar-<version>.vsix` from the
[releases](https://github.com/go-aiquota/vscode-statusbar/releases) and run

```
code --install-extension aiquota-statusbar-<version>.vsix
```

It is not published on the Marketplace.

## Settings

| Setting | Default | |
| --- | --- | --- |
| `aiquota.binaryPath` | `~/.local/bin/aiquota` | path of the binary |
| `aiquota.intervalSeconds` | 60 | between measurements (min 30) |
| `aiquota.cooldownSeconds` | 15 | minimum between two measurements (min 5) |
| `aiquota.timeoutSeconds` | 30 | a slower measurement is killed |
| `aiquota.warnPercent` / `aiquota.criticalPercent` | 75 / 90 | worst-window thresholds |

Commands: `aiquota: Show Claude usage detail`, `aiquota: Refresh Claude usage now`.

## Develop

```
npm ci && npm run lint && npm test && npm run package
```

Unit tests cover the thin layer with an injected `execFile`; they do not start
VS Code.

BSD-3-Clause.
