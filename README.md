# last-light

## GreenOS — a fake OS for your terminal

`fake_os.py` is a pretend operating system written in Python (standard library only, uses `curses`).
It is **not** a real OS — it just looks like one, full screen and green.

```bash
python3 fake_os.py
```

It boots (BIOS screen, logo, service log) into a shell. Try `help`, `ls`, `cd`, `cat`, `edit`,
`neofetch`, `ps`, `top`, `calc 2^10`, `matrix`, `snake`, `cowsay`, `reboot`, `shutdown`.

The graphical desktop only starts when you type:

```bash
ui run
```

Desktop apps: Files, Notepad, Terminal, Calculator, System Monitor, Clock (with calendar + stopwatch),
Snake, Settings and About. Use arrow keys + Enter (mouse clicks work too), `F1`/`m` for the Start menu,
`Esc` to close an app, `q` to log out back to the shell.

The fake file system and settings are saved to `~/.greenos.json`. Your real files are never touched.
Requires a terminal of at least 60x20. On Windows the `windows-curses` package is installed automatically on first run (or run `py -m pip install windows-curses`). Run it from a terminal window, not IDLE. If it ever crashes, the error stays on screen and is saved to `~/greenos_crash.log`.
