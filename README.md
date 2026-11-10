# The Last Light — Download

**[TheLastLight.exe](TheLastLight.exe)** — the full game for Windows 10 / 11 (64-bit), one 7.5 MB file. No installer.

1. Download `TheLastLight.exe` (on GitHub: click the file, then **Download raw file**).
2. Double-click it. The game opens in its own window.
3. Windows may show **"Windows protected your PC"** because the file isn't code-signed: click **More info → Run anyway**.

Saves are kept in `%APPDATA%\TheLastLight` and survive updates. Delete that folder to start completely fresh.

## Requirements

- Windows 10 or 11, 64-bit, with Microsoft Edge WebView2 (built into Windows 11 and up-to-date Windows 10).
  Without WebView2, the game opens in your default web browser instead.
- Any GPU from the last ~10 years. Weak machines start on the Low graphics preset automatically.

## Controls

Click the game to capture the mouse (Esc releases it).

| | |
|---|---|
| Move / sprint | W A S D / Shift |
| Look · zoom | Mouse · wheel |
| Jump | Space |
| Interact · gather · read | E |
| Use held item · attack | Left click or F |
| Backpack · craft · build · map · journal | Tab · C · B · M · J |
| Pause | Esc |

Built from branch `claude/last-light-3d` with `scripts/build-exe.sh`.
