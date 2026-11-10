# vscode-statusbar

A VS Code status bar item that always shows the Claude usage measured by
[`aiquota`](https://github.com/go-aiquota/tray): the same numbers as the Claude
Code extension's "Account & usage" view, but visible permanently instead of
scrolling away.

```
Claude 5h 57%   7d 10%   Fable 0%      session (5 h), weekly (7 day), then each other window
```

One item per window, coloured by its own band, so the colour tells which window
is hot; every other window the provider returns (a per-model weekly window such
as Sonnet or Fable) is an item too, a 0 % one included. Hover for every window, its reset time, the plan and the
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

Written for someone who uses VS Code and nothing else: no Go, Node or `git`
needed. Four steps, about ten minutes.

### 1. Prerequisites

- **The Claude Code extension, signed in** in VS Code (or the `claude` CLI,
  signed in with `/login`). aiquota does not log in to anything: it reads the
  login Claude Code already keeps, so you see the same account, plan and
  percentages as Claude Code's "Account & usage" view.
- **The same operating-system user.** aiquota must run as the user that signed
  in to Claude Code (the login is in that user's macOS Keychain, or in
  `~/.claude/.credentials.json` on Linux and Windows, or under
  `$CLAUDE_CONFIG_DIR`).
- With **Remote - SSH, WSL or Dev Containers**, install aiquota on the remote
  machine and sign in to Claude Code there: that is where the extension runs
  its command.
- VS Code 1.85 or newer.

### 2. Install aiquota (the command that measures)

The extension only draws what the `aiquota` program prints, and `aiquota`
starts a second program, `go-aiquota-plugin-claude`, which talks to Claude. Both
must be installed. Keep the plugin in the same directory as `aiquota`: the
extension puts that directory first on the PATH of the command it starts, so
it is found even when VS Code was launched from the Dock or a menu (which have
a minimal PATH). aiquota v0.8.0 is the first release with prebuilt programs,
and the extension needs v0.6.0 or newer.

**Prebuilt (no Go).** Open the
[aiquota releases](https://github.com/go-aiquota/tray/releases/latest) and
download the archive for your system, plus `SHA256SUMS`:

| System | Archive |
| --- | --- |
| macOS, Apple silicon (M1 and later) | `aiquota_<tag>_darwin_arm64.tar.gz` |
| macOS, Intel | `aiquota_<tag>_darwin_amd64.tar.gz` |
| Windows (64-bit Intel/AMD, most PCs) | `aiquota_<tag>_windows_amd64.zip` |
| Windows on ARM | `aiquota_<tag>_windows_arm64.zip` |
| Linux, Intel/AMD | `aiquota_<tag>_linux_amd64.tar.gz` |
| Linux, ARM | `aiquota_<tag>_linux_arm64.tar.gz` |
| FreeBSD, OpenBSD, NetBSD | the same names with `freebsd`, `openbsd` or `netbsd`, `amd64` or `arm64` |

Check the download against `SHA256SUMS` before you run anything from it:

- macOS, in the folder holding both files:
  `shasum -a 256 -c --ignore-missing SHA256SUMS` (Linux:
  `sha256sum -c --ignore-missing SHA256SUMS`); it must print `OK` for your
  archive.
- Windows (PowerShell): `(Get-FileHash .\aiquota_<tag>_windows_amd64.zip).Hash`
  and compare it, ignoring case, with the line for that file in `SHA256SUMS`.

Unpack it. It holds `aiquota`, `quotaclaim` (an optional Claude Code hook, not
needed here), `go-aiquota-plugin-claude` (each `.exe` on Windows) and the
licence. Put **`aiquota` and `go-aiquota-plugin-claude`** in one folder. With
`aiquota.binaryPath` empty the extension uses the first `aiquota` it finds in:

| System | Folders searched, in order |
| --- | --- |
| macOS, Linux, BSD | `~/.local/bin` (create it: `mkdir -p ~/.local/bin`), `$GOBIN`, `$GOPATH/bin`, `~/go/bin` |
| Windows | `%USERPROFILE%\.local\bin`, `%GOBIN%`, `%GOPATH%\bin`, `%USERPROFILE%\go\bin`, `%LOCALAPPDATA%\aiquota` |

Example, macOS Apple silicon:

```sh
mkdir -p ~/.local/bin
tar -xzf aiquota_<tag>_darwin_arm64.tar.gz
cp aiquota_<tag>_darwin_arm64/aiquota aiquota_<tag>_darwin_arm64/go-aiquota-plugin-claude ~/.local/bin/
```

Any other folder works: set **`aiquota.binaryPath`** to the full path of the
`aiquota` file (Settings, `Ctrl+,` or `Cmd+,`, search `aiquota`, "Binary
Path"), for example `/opt/tools/aiquota` or `C:\Tools\aiquota\aiquota.exe`, and
keep the plugin beside it.

**macOS Gatekeeper.** A file downloaded with a browser carries a quarantine
flag, and macOS then refuses to run it ("cannot be opened because the developer
cannot be verified"). The programs are not notarised by Apple. After checking
the checksum, clear the flag on the two files you installed:

```sh
xattr -d com.apple.quarantine ~/.local/bin/aiquota ~/.local/bin/go-aiquota-plugin-claude
```

(A download made with `curl -LO` sets no flag, and then the error does not
appear.)

**With Go instead** (Go 1.27.3 or newer): the same two programs, into
`~/go/bin` or wherever `GOBIN` points, both searched by the extension:

```sh
go install github.com/go-aiquota/tray/cmd/aiquota@latest
go install github.com/go-aiquota/plugin-claude@latest
```

`go install` names the second program `plugin-claude`: rename it to
`go-aiquota-plugin-claude` (`.exe` on Windows) in that folder.

**Which systems are tested.** Linux, macOS and Windows are tested by CI on a
runner of their own. The FreeBSD, OpenBSD and NetBSD binaries are built on every
change (so a build break shows) but never run by CI: they are untested.

### 3. Install the extension (the .vsix)

It is not on the Marketplace or Open VSX, so you install the file:

1. Download `aiquota-statusbar-<version>.vsix` from the
   [releases of this repository](https://github.com/go-aiquota/vscode-statusbar/releases/latest).
2. In VS Code open the **Extensions** view (`Ctrl+Shift+X`, `Cmd+Shift+X` on
   macOS), click the **`...`** menu at the top right of that view, choose
   **Install from VSIX...** and pick the downloaded file.
3. If VS Code offers it, reload the window once.

Or from a terminal, with the `code` command (on macOS first run the Command
Palette entry "Shell Command: Install 'code' command in PATH"):

```sh
code --install-extension aiquota-statusbar-<version>.vsix
```

### 4. Check that it works

1. In a terminal run `aiquota status` (outside the editor use the full path,
   e.g. `~/.local/bin/aiquota status`, if the shell does not find it). It must
   print your account, plan and one line per window with a percentage. Exit
   status 0 is "available", 1 "exhausted", 3 "could not read" (the reason is
   printed).
2. In the status bar (bottom right) you see one item per window the account
   has, for example `Claude 5h 57%`, `7d 10%`, `Fable 0%`. Every window the
   provider returns is drawn, a 0 % one included, and a window with no value is
   `Sonnet -`. Hover for every window and its reset time; click for the full
   text in the "aiquota" output channel (View, Output).
3. A grey `Claude ?` means "not measured", with the reason in its tooltip:
   `aiquota not found at <path>` (set `aiquota.binaryPath`),
   `no go-aiquota-plugin-claude on PATH` (the plugin is not beside `aiquota`),
   `token expired, open Claude Code` (open Claude Code once: it renews its own
   login).

### Update, uninstall

- **Update the extension:** install the newer `.vsix` the same way; it replaces
  the old one. **Update aiquota:** replace the two programs with those of the
  newer release (or `go install ...@latest` again). A newer `aiquota` changes
  what the extension draws without a reload: click the item, or wait one poll.
- **Uninstall:** Extensions view, "aiquota status bar", gear icon,
  **Uninstall**; then delete the two programs. aiquota also keeps a small
  reading cache (no credential) under `aiquota` in your user config folder,
  which you can delete.

### Privacy

The plugin reads Claude Code's login on your machine (macOS Keychain item
`Claude Code-credentials`, or `~/.claude/.credentials.json` /
`$CLAUDE_CONFIG_DIR` elsewhere) and sends it only to `api.anthropic.com`
(`/api/oauth/usage`). It never refreshes, copies or stores the token. The
extension never sees the credential: it runs `aiquota`, reads the text it
prints and draws it. It makes no network request of its own and has no
telemetry.

## Settings

| Setting | Default | |
| --- | --- | --- |
| `aiquota.binaryPath` | empty: first `aiquota` in `~/.local/bin`, `$GOBIN`, `$GOPATH/bin`, `~/go/bin` (Windows: `aiquota.exe`, plus `%LOCALAPPDATA%\aiquota`) | full path of the binary; `go-aiquota-plugin-claude` beside it |
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
