# vscode-statusbar

A VS Code status bar item that always shows the Claude usage measured by
[`aiquota`](https://github.com/go-aiquota/tray): the same numbers as the Claude
Code extension's "Account & usage" view, but visible permanently instead of
scrolling away.

```
Claude 5h 30%   7d 5%        session (5 h), weekly (7 day), each its own item
```

One item per window, coloured by its own band, so the colour tells which window
is hot; a per-model weekly window (e.g. Fable) appears as a third item once it
is above zero. Hover for every window, its reset time, the plan and the
measurement time. Click to open the detail in the "aiquota" output channel.

The scale has 8 equal steps of 12.5 % (`aiquota.bands` for fewer): light green,
dark green, light yellow, dark yellow, light orange, dark orange, then the
theme's warning background (75 to 87.5 %) and error background (from 87.5 %).
VS Code lets an extension use only those two backgrounds
(`StatusBarItem.backgroundColor`), so every other step is a text colour, each
measured at WCAG contrast of at least 3:1 against the default status bar
(#007ACC in Dark+ and Light+, #68217A with no folder) by a test in the Go
repository. On that mid-blue bar a text colour cannot be dark, so a "dark" step
is the more saturated one rather than the less bright one. When the usage
cannot be read it shows a grey `Claude ?` with the reason in the tooltip, never
a stale number.

## Changing the look: edit Go, `go install`, click

The extension is a frozen, generic renderer. `aiquota status -o statusbar
--render 1` describes the whole status bar and the extension draws exactly
that: per item an `id`, `text`, `tooltip`, `color` (hex or a theme colour id),
`background` (`none`, `warning`, `error`: the only two VS Code allows an
extension), a `priority` offset, an `alignment` and a click `command`
(`detail`, `refresh`, `none`); plus a `detail` text and `poll_seconds`. How many
items, their order, labels, colours, bands, thresholds and the poll interval
are all decided in Go. To change any of it, edit `aiquota` (go-aiquota/tray),
`go install` it, and click the item or wait one poll: **no window reload**,
which matters because a reload restarts the extension host that every
extension of the window (Claude Code included) shares. The extension keeps
reading render 1 even when the binary learns a render 2. Settings
(`aiquota.warnPercent`, `criticalPercent`, `bands`, `intervalSeconds`) are
passed to the binary only when you set them; otherwise the binary's defaults
rule. The command "aiquota: Refresh now" re-runs the binary immediately.

## Design

The extension is a deliberately thin JavaScript shell, because VS Code
extensions must be JS/TS and the fleet's logic lives in Go. It only runs
`aiquota status -o statusbar` on an interval and shows the one JSON object it
prints (`items` with `text`, `tooltip`, `color`, `background`, `priority`, `alignment`, `command`). Reading the credential, the endpoint,
verdicts, thresholds and wording are all in the Go binary, tested there. No
secret passes through the extension.

- one process at a time; one that exceeds the timeout is killed (SIGKILL);
- an interval (default 60 s, minimum 30 s) and a cooldown (default 15 s,
  minimum 5 s) that also covers clicks and the refresh command, so the usage
  endpoint is not hammered;
- any failure (binary missing, too old, timeout, garbage) is `Claude ?`.

## Install

Needs `aiquota` v0.6.0 or newer (`-o statusbar --render 1`; the extension asks for the render it reads, so a newer binary keeps working):

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
| `aiquota.bands` | 8 | colour bands per window, 2 to 8 |
| `aiquota.statusbar.alignment` | `auto` | side of the status bar (auto: as aiquota describes) |
| `aiquota.statusbar.priority` | 100.5 | base priority; higher is further left. Items take base, base - 0.001, ... so they stay contiguous |
| `aiquota.warnPercent` / `aiquota.criticalPercent` | 75 / 90 | worst-window level thresholds (tooltip and `level`) |

Commands: `aiquota: Show Claude usage detail`, `aiquota: Refresh Claude usage now`.

## Develop

```
npm ci && npm run lint && npm test && npm run package
```

Unit tests cover the thin layer with an injected `execFile`; they do not start
VS Code.

BSD-3-Clause.
