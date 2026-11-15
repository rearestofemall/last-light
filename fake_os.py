#!/usr/bin/env python3
"""
GreenOS - a *fake* operating system that runs inside your terminal.

This is NOT a real OS. It is a single Python script (standard library only,
using curses) that looks and feels like one: it boots, gives you a shell with
a pretend file system, and - only when you type `ui run` - starts a full-screen
green desktop with apps.

Run it:
    python3 fake_os.py

Then at the prompt try:  help, ls, neofetch, ui run
"""
import os

os.environ.setdefault("ESCDELAY", "25")  # make the Esc key respond quickly

import sys


def _pause(msg="Press Enter to close this window..."):
    try:
        input(msg)
    except (EOFError, KeyboardInterrupt):
        pass


try:
    import curses
except ImportError:  # Windows Python ships without curses - install it for the user
    if os.name == "nt":
        import subprocess
        print("GreenOS needs the 'windows-curses' package. Installing it now...\n")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "windows-curses"])
            import curses
        except Exception as e:
            print(f"\nCould not install windows-curses automatically ({e}).")
            print("Please run this yourself, then start GreenOS again:\n")
            print("    py -m pip install windows-curses\n")
            _pause()
            sys.exit(1)
    else:
        print("Your Python has no 'curses' module. Install a Python build with curses support.")
        _pause()
        sys.exit(1)

import ast
import calendar
import datetime
import json
import locale
import math
import operator
import platform
import random
import shlex
import time

try:
    locale.setlocale(locale.LC_ALL, "")
except locale.Error:
    pass

OS_NAME = "GreenOS"
VERSION = "1.0"
SAVE_FILE = os.path.expanduser("~/.greenos.json")
HOME = ["home", "user"]
MIN_W, MIN_H = 60, 20

LOGO = [
    r"  ____                       ___  ____  ",
    r" / ___|_ __ ___  ___ _ __   / _ \/ ___| ",
    r"| |  _| '__/ _ \/ _ \ '_ \ | | | \___ \ ",
    r"| |_| | | |  __/  __/ | | || |_| |___) |",
    r" \____|_|  \___|\___|_| |_| \___/|____/ ",
]

DEFAULT_SETTINGS = {
    "user": "user",
    "host": "greenbox",
    "bright": False,
    "pattern": True,
    "fastboot": False,
    "snake_high": 0,
}

# Colour attributes - filled in by apply_theme()
G = GB = INV = DIM = 0


# --------------------------------------------------------------------------
# Small helpers
# --------------------------------------------------------------------------
class FSError(Exception):
    pass


def apply_theme(scr, sysm):
    global G, GB, INV, DIM
    bright = sysm.settings.get("bright")
    if curses.has_colors():
        base, inv = curses.color_pair(1), curses.color_pair(2)
    else:
        base, inv = 0, curses.A_REVERSE
    G = base | (curses.A_BOLD if bright else 0)
    GB = base | curses.A_BOLD
    INV = inv | curses.A_BOLD if bright else inv
    DIM = base if bright else base | curses.A_DIM
    scr.bkgd(" ", G)


def put(scr, y, x, s, attr=None):
    """addstr that never crashes and clips to the screen."""
    if attr is None:
        attr = G
    H, W = scr.getmaxyx()
    if y < 0 or y >= H or x >= W:
        return
    if x < 0:
        s, x = s[-x:], 0
    s = s[: W - x]
    if not s:
        return
    try:
        scr.addstr(y, x, s, attr)
    except curses.error:
        pass
    except UnicodeEncodeError:
        try:
            scr.addstr(y, x, s.encode("ascii", "replace").decode(), attr)
        except curses.error:
            pass


def cursor(v):
    try:
        curses.curs_set(v)
    except curses.error:
        pass


def getkey(scr):
    try:
        k = scr.get_wch()
        if k == curses.KEY_RESIZE and hasattr(curses, "resize_term") and os.name == "nt":
            try:
                curses.resize_term(0, 0)  # Windows needs this after a window resize
            except curses.error:
                pass
        return k
    except curses.error:
        return None
    except KeyboardInterrupt:
        return "\x03"


def is_enter(k):
    return k in ("\n", "\r", curses.KEY_ENTER)


def is_esc(k):
    return k == "\x1b"


def is_back(k):
    return k in (curses.KEY_BACKSPACE, "\x7f", "\b", 127, 8)


def chunks(s, w):
    s = s.replace("\t", "    ")
    w = max(1, w)
    return [s[i:i + w] for i in range(0, len(s), w)] or [""]


def line_edit(k, text, cur):
    """Generic single-line editing. Returns (text, cur, handled)."""
    if isinstance(k, str) and len(k) == 1 and k.isprintable():
        return text[:cur] + k + text[cur:], cur + 1, True
    if is_back(k):
        if cur > 0:
            return text[:cur - 1] + text[cur:], cur - 1, True
        return text, cur, True
    if k == curses.KEY_DC:
        return text[:cur] + text[cur + 1:], cur, True
    if k == curses.KEY_LEFT:
        return text, max(0, cur - 1), True
    if k == curses.KEY_RIGHT:
        return text, min(len(text), cur + 1), True
    if k in (curses.KEY_HOME, "\x01"):
        return text, 0, True
    if k in (curses.KEY_END, "\x05"):
        return text, len(text), True
    if k == "\x15":  # Ctrl+U
        return "", 0, True
    return text, cur, False


def fmt_uptime(sec):
    sec = int(sec)
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    return f"{h}h {m:02d}m {s:02d}s"


# --- safe calculator ------------------------------------------------------
_OPS = {
    ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
    ast.Div: operator.truediv, ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod, ast.Pow: operator.pow,
    ast.USub: operator.neg, ast.UAdd: operator.pos,
}
_CONSTS = {"pi": math.pi, "e": math.e, "tau": math.tau}


def _fact(n):
    if n != int(n) or n < 0 or n > 500:
        raise ValueError("fact() needs a whole number 0..500")
    return math.factorial(int(n))


_FUNCS = {
    "sqrt": math.sqrt, "sin": math.sin, "cos": math.cos, "tan": math.tan,
    "asin": math.asin, "acos": math.acos, "atan": math.atan,
    "log": math.log, "log10": math.log10, "log2": math.log2, "exp": math.exp,
    "abs": abs, "round": round, "floor": math.floor, "ceil": math.ceil,
    "fact": _fact, "deg": math.degrees, "rad": math.radians,
    "min": min, "max": max,
}


def safe_eval(expr, extra=None):
    names = dict(_CONSTS)
    names.update(extra or {})
    expr = expr.replace("^", "**").replace("×", "*").replace("÷", "/")
    tree = ast.parse(expr, mode="eval")

    def ev(n):
        if isinstance(n, ast.Expression):
            return ev(n.body)
        if isinstance(n, ast.Constant) and isinstance(n.value, (int, float)) \
                and not isinstance(n.value, bool):
            return n.value
        if isinstance(n, ast.BinOp) and type(n.op) in _OPS:
            a, b = ev(n.left), ev(n.right)
            if isinstance(n.op, ast.Pow) and abs(b) > 1000:
                raise ValueError("exponent too large")
            return _OPS[type(n.op)](a, b)
        if isinstance(n, ast.UnaryOp) and type(n.op) in _OPS:
            return _OPS[type(n.op)](ev(n.operand))
        if isinstance(n, ast.Name):
            if n.id in names and names[n.id] is not None:
                return names[n.id]
            raise ValueError(f"unknown name '{n.id}'")
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) \
                and n.func.id in _FUNCS and not n.keywords:
            return _FUNCS[n.func.id](*[ev(a) for a in n.args])
        raise ValueError("unsupported expression")

    return ev(tree)


def fmt_num(v):
    if isinstance(v, float):
        if v.is_integer() and abs(v) < 1e15:
            return str(int(v))
        return f"{v:.10g}"
    return str(v)


# --------------------------------------------------------------------------
# The "system": virtual file system, settings, processes
# --------------------------------------------------------------------------
def default_fs():
    return {
        "bin": {c: "#!/bin/greensh\n[binary data]\n" for c in
                ("ls", "cat", "echo", "calc", "snake", "neofetch")},
        "etc": {
            "motd": "Have a green day!\n",
            "hostname": "greenbox\n",
            "os-release": f'NAME="{OS_NAME}"\nVERSION="{VERSION}"\nID=greenos\n',
        },
        "home": {"user": {
            "readme.txt": (
                f"Welcome to {OS_NAME}!\n\n"
                "This is a fake operating system running inside your terminal.\n"
                "Nothing here touches your real files - everything lives in a\n"
                "pretend file system saved to ~/.greenos.json.\n\n"
                "Things to try:\n"
                "  ls, cd docs, cat readme.txt, edit notes.txt\n"
                "  neofetch, top, matrix, snake, calc 2^10\n"
                "  ui run   <- starts the desktop\n"
            ),
            "notes.txt": "- buy milk\n- learn curses\n- take over the world (in green)\n",
            "docs": {"todo.txt": "1. Explore the desktop (type 'ui run')\n"
                                 "2. Beat the snake high score\n3. Have fun\n"},
            "pictures": {"tree.txt": "      *\n     /_\\\n    /_ _\\\n   /_ _ _\\\n     |_|\n"},
            "music": {},
        }},
        "tmp": {},
        "var": {"log": {"boot.log": "[ OK ] System booted\n"}},
    }


PROC_NAMES = ["init", "kernel_task", "greend", "sessiond", "netd", "audiod",
              "cron", "logd", "windowd", "greensh", "updated", "indexd",
              "bluetoothd", "printd", "powerd"]


class System:
    def __init__(self):
        data = {}
        try:
            with open(SAVE_FILE) as f:
                data = json.load(f)
        except Exception:
            pass
        fs = data.get("fs")
        self.fs = fs if isinstance(fs, dict) else default_fs()
        self.settings = dict(DEFAULT_SETTINGS)
        if isinstance(data.get("settings"), dict):
            self.settings.update(data["settings"])
        self.cwd = list(HOME)
        self.boot_time = time.time()
        self.size = (80, 24)
        self.next_pid = 100
        self.procs = []
        for name in PROC_NAMES:
            self.spawn(name)

    def spawn(self, name):
        pid = 1 if name == "init" else self.next_pid
        self.next_pid += random.randint(1, 40)
        self.procs.append({"pid": pid, "name": name,
                           "cpu": random.uniform(0, 4), "mem": random.uniform(0.2, 5)})

    def save(self):
        try:
            with open(SAVE_FILE, "w") as f:
                json.dump({"fs": self.fs, "settings": self.settings}, f)
        except Exception:
            pass

    # --- paths -----------------------------------------------------------
    def split(self, path=None):
        if not path:
            return list(self.cwd)
        if path.startswith("~"):
            path = "/home/user" + path[1:]
        parts = [] if path.startswith("/") else list(self.cwd)
        for p in path.split("/"):
            if p in ("", "."):
                continue
            if p == "..":
                if parts:
                    parts.pop()
            else:
                parts.append(p)
        return parts

    @staticmethod
    def path_str(parts):
        return "/" + "/".join(parts)

    def node(self, parts):
        n = self.fs
        for p in parts:
            if not isinstance(n, dict) or p not in n:
                return None
            n = n[p]
        return n

    def need(self, parts, raw=None):
        n = self.node(parts)
        if n is None:
            raise FSError(f"{raw or self.path_str(parts)}: no such file or directory")
        return n

    def parent_dir(self, parts):
        if not parts:
            raise FSError("operation not permitted on /")
        p = self.node(parts[:-1])
        if not isinstance(p, dict):
            raise FSError(f"{self.path_str(parts[:-1])}: no such directory")
        return p

    def write_file(self, parts, text, append=False):
        parent = self.parent_dir(parts)
        name = parts[-1]
        if isinstance(parent.get(name), dict):
            raise FSError(f"{name}: is a directory")
        parent[name] = (parent.get(name, "") + text) if append else text
        self.save()

    def mkdir(self, parts):
        parent = self.parent_dir(parts)
        if parts[-1] in parent:
            raise FSError(f"{parts[-1]}: already exists")
        parent[parts[-1]] = {}
        self.save()

    def remove(self, parts, recursive=False):
        parent = self.parent_dir(parts)
        name = parts[-1]
        if name not in parent:
            raise FSError(f"{name}: no such file or directory")
        if isinstance(parent[name], dict) and parent[name] and not recursive:
            raise FSError(f"{name}: is a directory (use rm -r)")
        del parent[name]
        if not isinstance(self.node(self.cwd), dict):
            self.cwd = list(HOME) if isinstance(self.node(HOME), dict) else []
        self.save()

    def rename(self, parts, new):
        parent = self.parent_dir(parts)
        if not new or "/" in new:
            raise FSError("invalid name")
        if new in parent:
            raise FSError(f"{new}: already exists")
        parent[new] = parent.pop(parts[-1])
        self.save()

    def uptime(self):
        return time.time() - self.boot_time


# --------------------------------------------------------------------------
# The shell (greensh)
# --------------------------------------------------------------------------
FORTUNES = [
    "There is no place like 127.0.0.1",
    "It works on my machine.",
    "Green is not a colour, it's a lifestyle.",
    "Have you tried turning it off and on again? (type 'reboot')",
    "A clean desk is a sign of a full trash can.",
    "To understand recursion, you must first understand recursion.",
    "The cake is a lie, but the snake is real. (type 'snake')",
    "Real programmers count from 0.",
]


class Shell:
    def __init__(self, sysm):
        self.s = sysm
        self.history = []
        c = self
        self.cmds = {
            "help": (c.c_help, "show this help"),
            "ls": (c.c_ls, "list files  (ls -l for details)"),
            "cd": (c.c_cd, "change directory"),
            "pwd": (c.c_pwd, "print working directory"),
            "tree": (c.c_tree, "show a directory tree"),
            "cat": (c.c_cat, "print a file"),
            "echo": (c.c_echo, "print text  (echo hi > file.txt)"),
            "touch": (c.c_touch, "create an empty file"),
            "mkdir": (c.c_mkdir, "create a directory"),
            "rm": (c.c_rm, "remove a file  (rm -r for folders)"),
            "mv": (c.c_mv, "move / rename"),
            "cp": (c.c_cp, "copy"),
            "edit": (c.c_edit, "open a file in Notepad"),
            "nano": (c.c_edit, "same as edit"),
            "clear": (c.c_clear, "clear the screen"),
            "date": (c.c_date, "show date and time"),
            "whoami": (c.c_whoami, "show current user"),
            "hostname": (c.c_hostname, "show/set hostname"),
            "uname": (c.c_uname, "system info  (uname -a)"),
            "neofetch": (c.c_neofetch, "fancy system info"),
            "uptime": (c.c_uptime, "how long the system has been up"),
            "ps": (c.c_ps, "list processes"),
            "kill": (c.c_kill, "kill a process by PID"),
            "top": (c.c_top, "open the system monitor"),
            "calc": (c.c_calc, "calculator  (calc sqrt(2)*10)"),
            "history": (c.c_history, "command history"),
            "fortune": (c.c_fortune, "a random fortune"),
            "cowsay": (c.c_cowsay, "a cow says something"),
            "matrix": (c.c_matrix, "enter the matrix"),
            "snake": (c.c_snake, "play snake"),
            "sudo": (c.c_sudo, "become root (good luck)"),
            "reboot": (c.c_reboot, "restart GreenOS"),
            "shutdown": (c.c_shutdown, "power off GreenOS"),
            "exit": (c.c_exit, "leave the shell"),
            "ui": (c.c_ui, "'ui run' starts the desktop"),
        }

    def prompt(self):
        p = self.s.path_str(self.s.cwd)
        if p == "/home/user" or p.startswith("/home/user/"):
            p = "~" + p[len("/home/user"):]
        return f"{self.s.settings['user']}@{self.s.settings['host']}:{p}$ "

    def execute(self, line):
        line = line.strip()
        if not line:
            return [], None
        self.history.append(line)
        try:
            toks = shlex.split(line)
        except ValueError as e:
            return [f"greensh: syntax error: {e}"], None
        redirect = None
        for op in (">>", ">"):
            if op in toks:
                i = toks.index(op)
                if i + 1 >= len(toks):
                    return ["greensh: missing file name after redirect"], None
                redirect = (op, toks[i + 1])
                toks = toks[:i] + toks[i + 2:]
                break
        if not toks:
            return [], None
        name, args = toks[0], toks[1:]
        if name not in self.cmds:
            return [f"greensh: command not found: {name}  (try 'help')"], None
        try:
            res = self.cmds[name][0](args)
        except FSError as e:
            return [f"{name}: {e}"], None
        except Exception as e:  # never let a command crash the OS
            return [f"{name}: error: {e}"], None
        out, action = res if isinstance(res, tuple) else (res, None)
        if redirect:
            try:
                self.s.write_file(self.s.split(redirect[1]), "\n".join(out) + "\n",
                                  append=redirect[0] == ">>")
            except FSError as e:
                return [f"greensh: {e}"], None
            return [], action
        return out, action

    def complete(self, inp):
        toks = inp.split(" ")
        last = toks[-1]
        if len(toks) == 1:
            return sorted(c for c in self.cmds if c.startswith(last))
        d, sep, pre = last.rpartition("/")
        dirpath = (d + "/") if sep else None
        node = self.s.node(self.s.split(dirpath))
        if not isinstance(node, dict):
            return []
        prefix = (d + "/") if sep else ""
        return sorted(prefix + n + ("/" if isinstance(node[n], dict) else "")
                      for n in node if n.startswith(pre))

    # --- commands --------------------------------------------------------
    def c_help(self, a):
        out = [f"{OS_NAME} shell commands:", ""]
        for k, (_, d) in self.cmds.items():
            if k != "nano":
                out.append(f"  {k:<10} {d}")
        out += ["", "Keys: Up/Down = history, Tab = complete, PgUp/PgDn = scroll, Ctrl+L = clear",
                ">> Type 'ui run' to launch the graphical desktop. <<"]
        return out

    def c_ls(self, a):
        long = "-l" in a or "-la" in a or "-al" in a
        paths = [x for x in a if not x.startswith("-")] or [""]
        out = []
        for p in paths:
            parts = self.s.split(p)
            n = self.s.need(parts, p)
            if isinstance(n, str):
                out.append(parts[-1])
                continue
            if len(paths) > 1:
                out.append(f"{p}:")
            names = sorted(n, key=lambda k: (not isinstance(n[k], dict), k.lower()))
            if long:
                out.append(f"total {len(names)}")
                for k in names:
                    if isinstance(n[k], dict):
                        out.append(f"drwxr-xr-x  {self.s.settings['user']:<8} {4096:>6}  {k}/")
                    else:
                        out.append(f"-rw-r--r--  {self.s.settings['user']:<8} {len(n[k]):>6}  {k}")
            else:
                items = [k + "/" if isinstance(n[k], dict) else k for k in names]
                width = max(60, self.s.size[0] - 2)
                colw = max((len(i) for i in items), default=0) + 2
                per = max(1, width // max(1, colw))
                for i in range(0, len(items), per):
                    out.append("".join(x.ljust(colw) for x in items[i:i + per]).rstrip())
        return out

    def c_cd(self, a):
        parts = self.s.split(a[0] if a else "~")
        n = self.s.need(parts, a[0] if a else "~")
        if not isinstance(n, dict):
            raise FSError(f"{a[0]}: not a directory")
        self.s.cwd = parts
        return []

    def c_pwd(self, a):
        return [self.s.path_str(self.s.cwd)]

    def c_tree(self, a):
        parts = self.s.split(a[0] if a else "")
        n = self.s.need(parts, a[0] if a else None)
        out = [self.s.path_str(parts)]

        def walk(d, pre):
            keys = sorted(d)
            for i, k in enumerate(keys):
                last = i == len(keys) - 1
                isdir = isinstance(d[k], dict)
                out.append(pre + ("└── " if last else "├── ") + k + ("/" if isdir else ""))
                if isdir:
                    walk(d[k], pre + ("    " if last else "│   "))
        if isinstance(n, dict):
            walk(n, "")
        return out

    def c_cat(self, a):
        if not a:
            return ["usage: cat FILE..."]
        out = []
        for p in a:
            n = self.s.need(self.s.split(p), p)
            if isinstance(n, dict):
                raise FSError(f"{p}: is a directory")
            out += n.split("\n")
            if n.endswith("\n"):
                out.pop()
        return out

    def c_echo(self, a):
        return [" ".join(a)]

    def c_touch(self, a):
        for p in a:
            parts = self.s.split(p)
            if self.s.node(parts) is None:
                self.s.write_file(parts, "")
        return [] if a else ["usage: touch FILE..."]

    def c_mkdir(self, a):
        for p in a:
            self.s.mkdir(self.s.split(p))
        return [] if a else ["usage: mkdir DIR..."]

    def c_rm(self, a):
        rec = any(x in ("-r", "-rf", "-fr") for x in a)
        paths = [x for x in a if not x.startswith("-")]
        if not paths:
            return ["usage: rm [-r] PATH..."]
        for p in paths:
            parts = self.s.split(p)
            if not parts:
                return ["rm: nice try. Refusing to delete /"]
            self.s.remove(parts, rec)
        return []

    def _move(self, a, copy):
        if len(a) != 2:
            return [f"usage: {'cp' if copy else 'mv'} SRC DEST"]
        src, dst = self.s.split(a[0]), self.s.split(a[1])
        node = self.s.need(src, a[0])
        if not src:
            raise FSError("cannot move /")
        if isinstance(self.s.node(dst), dict):
            dst = dst + [src[-1]]
        if dst[:len(src)] == src:
            raise FSError("cannot move something into itself")
        parent = self.s.parent_dir(dst)
        parent[dst[-1]] = json.loads(json.dumps(node)) if copy else node
        if not copy:
            del self.s.node(src[:-1])[src[-1]]
        self.s.save()
        return []

    def c_mv(self, a):
        return self._move(a, False)

    def c_cp(self, a):
        return self._move(a, True)

    def c_edit(self, a):
        if not a:
            return [], ("edit", None)
        parts = self.s.split(a[0])
        if isinstance(self.s.node(parts), dict):
            raise FSError(f"{a[0]}: is a directory")
        return [], ("edit", parts)

    def c_clear(self, a):
        return [], "clear"

    def c_date(self, a):
        return [datetime.datetime.now().strftime("%a %b %d %H:%M:%S %Y")]

    def c_whoami(self, a):
        return [self.s.settings["user"]]

    def c_hostname(self, a):
        if a:
            self.s.settings["host"] = a[0][:20]
            self.s.save()
        return [self.s.settings["host"]]

    def c_uname(self, a):
        if "-a" in a:
            return [f"{OS_NAME} {self.s.settings['host']} green-{VERSION}.0-lts "
                    f"#1 SMP x86_64 GreenOS (fake)"]
        return [OS_NAME]

    def c_neofetch(self, a):
        st = self.s.settings
        mem = int(4096 + sum(p["mem"] for p in self.s.procs) * 40)
        info = [
            f"{st['user']}@{st['host']}",
            "-" * len(f"{st['user']}@{st['host']}"),
            f"OS: {OS_NAME} {VERSION} x86_64 (fake)",
            f"Kernel: green-{VERSION}.0-lts",
            f"Uptime: {fmt_uptime(self.s.uptime())}",
            f"Processes: {len(self.s.procs)}",
            "Shell: greensh 1.0",
            f"Resolution: {self.s.size[0]}x{self.s.size[1]} chars",
            "Theme: Matrix Green",
            "CPU: Virtual Green Core x4 @ 4.20GHz",
            f"Memory: {mem}MiB / 16384MiB",
            f"Host Python: {platform.python_version()}",
        ]
        out = []
        for i in range(max(len(LOGO), len(info))):
            left = LOGO[i] if i < len(LOGO) else ""
            out.append(f"{left:<42}  {info[i] if i < len(info) else ''}")
        return out

    def c_uptime(self, a):
        return [f"up {fmt_uptime(self.s.uptime())},  1 user,  "
                f"load average: {random.random():.2f}, {random.random():.2f}, {random.random():.2f}"]

    def c_ps(self, a):
        out = ["  PID  NAME            CPU%  MEM%"]
        for p in self.s.procs:
            out.append(f"{p['pid']:>5}  {p['name']:<14} {p['cpu']:5.1f} {p['mem']:5.1f}")
        return out

    def c_kill(self, a):
        if not a or not a[0].isdigit():
            return ["usage: kill PID"]
        pid = int(a[0])
        for p in self.s.procs:
            if p["pid"] == pid:
                if p["name"] in ("init", "kernel_task"):
                    return [f"kill: ({pid}) - Operation not permitted"]
                self.s.procs.remove(p)
                return [f"Killed process {pid} ({p['name']})"]
        return [f"kill: ({pid}) - No such process"]

    def c_top(self, a):
        return [], "top"

    def c_calc(self, a):
        if not a:
            return ["usage: calc EXPRESSION   e.g. calc (2+3)*4^2, calc sqrt(144)"]
        try:
            return [fmt_num(safe_eval(" ".join(a)))]
        except Exception as e:
            return [f"calc: {e}"]

    def c_history(self, a):
        return [f"{i + 1:>4}  {h}" for i, h in enumerate(self.history)]

    def c_fortune(self, a):
        return [random.choice(FORTUNES)]

    def c_cowsay(self, a):
        msg = " ".join(a) or "Moo! Welcome to GreenOS."
        return [" " + "_" * (len(msg) + 2), f"< {msg} >", " " + "-" * (len(msg) + 2),
                r"        \   ^__^",
                r"         \  (oo)\_______",
                r"            (__)\       )\/\ ",
                r"                ||----w |",
                r"                ||     ||"]

    def c_matrix(self, a):
        return [], "matrix"

    def c_snake(self, a):
        return [], "snake"

    def c_sudo(self, a):
        return [f"{self.s.settings['user']} is not in the sudoers file. "
                "This incident will be reported."]

    def c_reboot(self, a):
        return ["Rebooting..."], "reboot"

    def c_shutdown(self, a):
        return ["Shutting down..."], "shutdown"

    def c_exit(self, a):
        return [], "exit"

    def c_ui(self, a):
        if a == ["run"]:
            return [], "ui"
        return ["usage: ui run     (starts the graphical desktop)"]


# --------------------------------------------------------------------------
# Screen chrome: bars, boxes, dialogs
# --------------------------------------------------------------------------
def too_small(scr):
    H, W = scr.getmaxyx()
    if W < MIN_W or H < MIN_H:
        scr.erase()
        put(scr, H // 2 - 1, max(0, (W - 26) // 2), f"Terminal too small ({W}x{H})", GB)
        put(scr, H // 2 + 1, max(0, (W - 30) // 2), f"Please resize to at least {MIN_W}x{MIN_H}", G)
        put(scr, H // 2 + 2, max(0, (W - 16) // 2), "(Esc to go back)", DIM)
        scr.refresh()
        return True
    return False


def topbar(scr, title):
    H, W = scr.getmaxyx()
    put(scr, 0, 0, " " * W, INV)
    put(scr, 0, 1, f"◆ {OS_NAME}", INV | curses.A_BOLD)
    t = f" {title} "
    put(scr, 0, max(12, (W - len(t)) // 2), t, INV | curses.A_BOLD)
    clock = datetime.datetime.now().strftime("%a %d %b  %H:%M:%S ")
    put(scr, 0, W - len(clock), clock, INV)


def bottombar(scr, text, right=""):
    H, W = scr.getmaxyx()
    put(scr, H - 1, 0, " " * W, INV)
    put(scr, H - 1, 1, text[: W - len(right) - 3], INV)
    if right:
        put(scr, H - 1, W - len(right) - 1, right, INV | curses.A_BOLD)


def box(scr, y, x, h, w, title="", attr=None, fill=False):
    attr = G if attr is None else attr
    if fill:
        for i in range(1, h - 1):
            put(scr, y + i, x + 1, " " * (w - 2), G)
    put(scr, y, x, "┌" + "─" * (w - 2) + "┐", attr)
    for i in range(1, h - 1):
        put(scr, y + i, x, "│", attr)
        put(scr, y + i, x + w - 1, "│", attr)
    put(scr, y + h - 1, x, "└" + "─" * (w - 2) + "┘", attr)
    if title:
        put(scr, y, x + 2, f" {title} "[: w - 4], GB)


def frame(scr, title, hint):
    """Draws a full-screen app window. Returns content rect (y, x, h, w) or None."""
    if too_small(scr):
        return None
    H, W = scr.getmaxyx()
    scr.erase()
    topbar(scr, title)
    bottombar(scr, hint, "Esc: close")
    box(scr, 1, 0, H - 2, W, title)
    put(scr, 1, W - 5, "[x]", GB)
    return 2, 2, H - 4, W - 4


def dialog_box(scr, title, lines, width=0):
    H, W = scr.getmaxyx()
    w = min(W - 2, max(width, max(len(l) for l in lines) + 4, len(title) + 8))
    h = len(lines) + 4
    y0, x0 = max(0, (H - h) // 2), max(0, (W - w) // 2)
    box(scr, y0, x0, h, w, title, GB, fill=True)
    for i, l in enumerate(lines):
        put(scr, y0 + 2 + i, x0 + 2, l[: w - 4], G)
    return y0, x0, h, w


def message(scr, text, title="GreenOS"):
    lines = []
    for para in text.split("\n"):
        lines += chunks(para, 56)
    cursor(0)
    dialog_box(scr, title, lines + ["", "[ Press any key ]"], 30)
    scr.refresh()
    scr.timeout(-1)
    while getkey(scr) == curses.KEY_RESIZE:
        pass
    scr.timeout(1000)


def ask(scr, prompt, default=""):
    text, cur = default, len(default)
    scr.timeout(-1)
    try:
        while True:
            y0, x0, h, w = dialog_box(scr, "Input", [prompt, "", "", "Enter = accept    Esc = cancel"], 54)
            fw = w - 4
            start = max(0, cur - fw + 1)
            put(scr, y0 + 3, x0 + 2, text[start:start + fw].ljust(fw), INV)
            cursor(1)
            try:
                scr.move(y0 + 3, x0 + 2 + cur - start)
            except curses.error:
                pass
            scr.refresh()
            k = getkey(scr)
            if is_enter(k):
                return text.strip()
            if is_esc(k):
                return None
            text, cur, _ = line_edit(k, text, cur)
    finally:
        cursor(0)
        scr.timeout(1000)


def choose(scr, prompt, options, title="Confirm"):
    sel = 0
    cursor(0)
    scr.timeout(-1)
    try:
        while True:
            labels = "  ".join(f"[ {o} ]" for o in options)
            y0, x0, h, w = dialog_box(scr, title, [prompt, "", ""], len(labels) + 6)
            x = x0 + (w - len(labels)) // 2
            for i, o in enumerate(options):
                lab = f"[ {o} ]"
                put(scr, y0 + 4, x, lab, INV if i == sel else GB)
                x += len(lab) + 2
            scr.refresh()
            k = getkey(scr)
            if k in (curses.KEY_LEFT, curses.KEY_BTAB):
                sel = (sel - 1) % len(options)
            elif k in (curses.KEY_RIGHT, "\t"):
                sel = (sel + 1) % len(options)
            elif is_enter(k):
                return sel
            elif is_esc(k):
                return None
            elif isinstance(k, str):
                for i, o in enumerate(options):
                    if o[0].lower() == k.lower():
                        return i
    finally:
        scr.timeout(1000)


def confirm(scr, prompt):
    return choose(scr, prompt, ["Yes", "No"]) == 0


# --------------------------------------------------------------------------
# Boot / shutdown
# --------------------------------------------------------------------------
def boot(scr, sysm):
    cursor(0)
    sysm.boot_time = time.time()
    f = 0.3 if sysm.settings.get("fastboot") else 1.0
    skip = [False]

    def pause(t):
        scr.refresh()
        if skip[0]:
            return
        scr.timeout(max(1, int(t * f * 1000)))
        k = getkey(scr)
        if k is not None and k != curses.KEY_RESIZE:
            skip[0] = True

    # stage 1: "BIOS"
    scr.erase()
    put(scr, 0, 0, "GreenBIOS v2.6  (C) 2026 Green Systems Inc.", GB)
    put(scr, 1, 0, "CPU: Virtual Green Core x4 @ 4.20GHz")
    for m in range(0, 16385, 1024):
        put(scr, 3, 0, f"Memory Test: {m:>6}K")
        pause(0.03)
    put(scr, 3, 0, "Memory Test:  16384K OK", GB)
    put(scr, 5, 0, "Detecting drives... /dev/gda1  512 GB  (totally real)")
    pause(0.35)
    put(scr, 6, 0, "Booting from /dev/gda1 ...")
    put(scr, 8, 0, "(press any key to skip)", DIM)
    pause(0.4)

    # stage 2: logo + progress bar
    for pct in range(0, 101, 3):
        scr.erase()
        H, W = scr.getmaxyx()
        y = max(0, H // 2 - 5)
        for i, l in enumerate(LOGO):
            put(scr, y + i, max(0, (W - len(l)) // 2), l, GB)
        put(scr, y + 6, max(0, (W - 22) // 2), f"version {VERSION}  (fake OS)", DIM)
        bw = min(40, W - 10)
        n = int(bw * pct / 100)
        put(scr, y + 8, max(0, (W - bw - 2) // 2), "[" + "█" * n + "░" * (bw - n) + "]")
        put(scr, y + 9, max(0, (W - 4) // 2), f"{pct:>3}%")
        pause(0.035)

    # stage 3: service start-up log
    scr.erase()
    services = [
        "Mounting virtual file system", f"Loading kernel green-{VERSION}.0-lts",
        "Loading green colour palette", "Starting network daemon (netd)",
        "Starting audio daemon (audiod)", "Starting window manager (windowd)",
        "Reticulating splines", "Starting login service",
        f"Reached target {OS_NAME} Shell",
    ]
    for i, s in enumerate(services):
        put(scr, i, 0, "[  ", G)
        put(scr, i, 3, "OK", GB)
        put(scr, i, 5, "  ] " + s, G)
        pause(0.09)
    pause(0.4)
    scr.timeout(1000)


def shutdown_anim(scr, sysm, rebooting=False):
    cursor(0)
    scr.erase()
    scr.timeout(70)
    lines = ["Stopped window manager (windowd)", "Stopped audio daemon (audiod)",
             "Stopped network daemon (netd)", "Saving file system to ~/.greenos.json",
             "Unmounting virtual file system"]
    sysm.save()
    for i, s in enumerate(lines):
        put(scr, i, 0, "[  ", G)
        put(scr, i, 3, "OK", GB)
        put(scr, i, 5, "  ] " + s)
        scr.refresh()
        getkey(scr)
    put(scr, len(lines) + 1, 0, "Rebooting..." if rebooting else
        "System halted. Goodbye!", GB)
    scr.refresh()
    scr.timeout(900)
    getkey(scr)


# --------------------------------------------------------------------------
# Terminal / shell screen
# --------------------------------------------------------------------------
def shell_screen(scr, sysm, shell, in_ui=False):
    buf = []

    def out(lines, attr=None):
        for l in lines:
            buf.append((l, attr))

    if in_ui:
        out([f"{OS_NAME} Terminal - type 'exit' to return to the desktop.", ""])
    else:
        out(LOGO, GB)
        out(["", f"Welcome to {OS_NAME} {VERSION}  -  a pretend operating system in your terminal.",
             "Type 'help' for commands, or 'ui run' to start the desktop.", ""])
    inp, cur, hidx, scroll = "", 0, None, 0
    scr.timeout(1000)
    while True:
        H, W = scr.getmaxyx()
        sysm.size = (W, H)
        scr.erase()
        put(scr, 0, 0, " " * W, INV)
        put(scr, 0, 1, f"{OS_NAME} Terminal" + ("" if in_ui else "   |   'help' for commands   |   'ui run' for desktop"), INV | curses.A_BOLD)
        clock = datetime.datetime.now().strftime(" %H:%M:%S ")
        put(scr, 0, W - len(clock), clock, INV)

        cw = max(10, W - 1)
        rows = []
        for text, attr in buf:
            for seg in chunks(text, cw):
                rows.append((seg, attr))
        pr = shell.prompt()
        full = pr + inp
        prow = chunks(full, cw)
        idx = len(pr) + cur
        crow = idx // cw
        while len(prow) <= crow:
            prow.append("")
        allrows = rows + [(i, "prompt") for i in range(len(prow))]
        view = H - 1
        scroll = max(0, min(scroll, len(allrows) - view))
        start = max(0, len(allrows) - view - scroll)
        for i, (seg, attr) in enumerate(allrows[start:start + view]):
            y = 1 + i
            if attr == "prompt":
                j = seg
                a, b = j * cw, (j + 1) * cw
                text = full[a:b]
                nb = max(0, min(b, len(pr)) - a)
                put(scr, y, 0, text[:nb], GB)
                put(scr, y, nb, text[nb:], G)
            else:
                put(scr, y, 0, seg, attr if attr is not None else G)
        cy = 1 + len(rows) + crow - start
        if scroll == 0 and 1 <= cy < H:
            cursor(1)
            try:
                scr.move(cy, idx % cw)
            except curses.error:
                pass
        else:
            cursor(0)
        scr.refresh()

        k = getkey(scr)
        if k is None or k == curses.KEY_RESIZE:
            continue
        if is_enter(k):
            out([pr + inp], GB)
            line, inp, cur, hidx, scroll = inp, "", 0, None, 0
            lines, action = shell.execute(line)
            out(lines)
            if action == "clear":
                buf.clear()
            elif action == "ui":
                if in_ui:
                    out(["ui: the desktop is already running."])
                else:
                    cursor(0)
                    out(["Starting desktop..."])
                    return "ui"
            elif action in ("exit", "reboot", "shutdown"):
                cursor(0)
                return action
            elif isinstance(action, tuple) and action[0] == "edit":
                notepad(scr, sysm, action[1])
            elif action == "matrix":
                matrix_effect(scr)
            elif action == "snake":
                snake_app(scr, sysm)
            elif action == "top":
                monitor_app(scr, sysm)
            scr.timeout(1000)
        elif k == "\x03":
            out([pr + inp + "^C"], GB)
            inp, cur = "", 0
        elif k == "\x0c":
            buf.clear()
        elif k == "\t":
            cands = shell.complete(inp[:cur])
            if len(cands) == 1 or (cands and os.path.commonprefix(cands)):
                toks = inp[:cur].split(" ")
                one = len(cands) == 1
                rep = cands[0] if one else os.path.commonprefix(cands)
                if one and not rep.endswith("/"):
                    rep += " "
                new = " ".join(toks[:-1] + [rep])
                inp, cur = new + inp[cur:], len(new)
            if len(cands) > 1:
                out([pr + inp], GB)
                out(["  ".join(cands)])
        elif k == curses.KEY_UP:
            if shell.history:
                hidx = len(shell.history) - 1 if hidx is None else max(0, hidx - 1)
                inp = shell.history[hidx]
                cur = len(inp)
        elif k == curses.KEY_DOWN:
            if hidx is not None:
                hidx += 1
                if hidx >= len(shell.history):
                    hidx, inp = None, ""
                else:
                    inp = shell.history[hidx]
                cur = len(inp)
        elif k == curses.KEY_PPAGE:
            scroll += max(1, view // 2)
        elif k == curses.KEY_NPAGE:
            scroll = max(0, scroll - max(1, view // 2))
        else:
            inp, cur, _ = line_edit(k, inp, cur)
            scroll = 0


# --------------------------------------------------------------------------
# Apps
# --------------------------------------------------------------------------
def notepad(scr, sysm, parts=None, _shell=None):
    text = ""
    if parts is not None:
        n = sysm.node(parts)
        if isinstance(n, dict):
            message(scr, f"{sysm.path_str(parts)} is a folder.")
            return
        if isinstance(n, str):
            text = n
    lines = text.split("\n")
    cy = cx = top = left = 0
    dirty = False
    msg = "New file" if text == "" else "Opened"

    def save(save_as=False):
        nonlocal parts, dirty, msg
        if parts is None or save_as:
            default = sysm.path_str(parts) if parts else "/home/user/docs/untitled.txt"
            name = ask(scr, "Save as (path):", default)
            if not name:
                return False
            parts = sysm.split(name)
        try:
            sysm.write_file(parts, "\n".join(lines))
            dirty, msg = False, f"Saved {sysm.path_str(parts)}"
            return True
        except FSError as e:
            msg = f"Error: {e}"
            return False

    scr.timeout(1000)
    while True:
        name = sysm.path_str(parts) if parts else "untitled"
        r = frame(scr, f"Notepad - {name}{' *' if dirty else ''}",
                  "^S/F2 save   F3 save as   ^K delete line   PgUp/PgDn")
        if r is None:
            if is_esc(getkey(scr)):
                return
            continue
        y, x, h, w = r
        gut = 5
        th, tw = h - 1, w - gut
        cy = max(0, min(cy, len(lines) - 1))
        cx = max(0, min(cx, len(lines[cy])))
        if cy < top:
            top = cy
        if cy >= top + th:
            top = cy - th + 1
        if cx < left:
            left = cx
        if cx >= left + tw:
            left = cx - tw + 1
        for i in range(th):
            ln = top + i
            if ln < len(lines):
                put(scr, y + i, x, f"{ln + 1:>4} ", DIM)
                put(scr, y + i, x + gut, lines[ln][left:left + tw].replace("\t", " "))
            else:
                put(scr, y + i, x, "   ~", DIM)
        status = f" Ln {cy + 1}, Col {cx + 1}  |  {len(lines)} lines  |  {msg}"
        put(scr, y + h - 1, x, status.ljust(w)[:w], INV)
        cursor(1)
        try:
            scr.move(y + cy - top, x + gut + cx - left)
        except curses.error:
            pass
        scr.refresh()

        k = getkey(scr)
        if k is None or k == curses.KEY_RESIZE:
            continue
        line = lines[cy]
        if is_esc(k):
            cursor(0)
            if dirty:
                c = choose(scr, "Save changes before closing?", ["Save", "Discard", "Cancel"])
                if c == 0 and not save():
                    continue
                if c in (None, 2):
                    continue
            return
        elif k in ("\x13", curses.KEY_F2):
            cursor(0)
            save()
        elif k == curses.KEY_F3:
            cursor(0)
            save(True)
        elif k == curses.KEY_UP:
            cy = max(0, cy - 1)
        elif k == curses.KEY_DOWN:
            cy = min(len(lines) - 1, cy + 1)
        elif k == curses.KEY_LEFT:
            if cx > 0:
                cx -= 1
            elif cy > 0:
                cy -= 1
                cx = len(lines[cy])
        elif k == curses.KEY_RIGHT:
            if cx < len(line):
                cx += 1
            elif cy < len(lines) - 1:
                cy, cx = cy + 1, 0
        elif k in (curses.KEY_HOME, "\x01"):
            cx = 0
        elif k in (curses.KEY_END, "\x05"):
            cx = len(line)
        elif k == curses.KEY_PPAGE:
            cy = max(0, cy - th)
        elif k == curses.KEY_NPAGE:
            cy = min(len(lines) - 1, cy + th)
        elif is_enter(k):
            lines[cy:cy + 1] = [line[:cx], line[cx:]]
            cy, cx, dirty = cy + 1, 0, True
        elif is_back(k):
            if cx > 0:
                lines[cy] = line[:cx - 1] + line[cx:]
                cx -= 1
                dirty = True
            elif cy > 0:
                cx = len(lines[cy - 1])
                lines[cy - 1] += line
                del lines[cy]
                cy -= 1
                dirty = True
        elif k == curses.KEY_DC:
            if cx < len(line):
                lines[cy] = line[:cx] + line[cx + 1:]
                dirty = True
            elif cy < len(lines) - 1:
                lines[cy] += lines.pop(cy + 1)
                dirty = True
        elif k == "\x0b":
            if len(lines) > 1:
                del lines[cy]
            else:
                lines = [""]
            dirty = True
        elif k == "\t":
            lines[cy] = line[:cx] + "    " + line[cx:]
            cx += 4
            dirty = True
        elif isinstance(k, str) and len(k) == 1 and k.isprintable():
            lines[cy] = line[:cx] + k + line[cx:]
            cx += 1
            dirty = True
        if dirty and msg.startswith(("Saved", "Opened", "New")):
            msg = "Modified"


def files_app(scr, sysm, shell=None):
    path = list(HOME)
    sel = top = 0
    msg = "Welcome to Files"
    scr.timeout(1000)
    while True:
        node = sysm.node(path)
        if not isinstance(node, dict):
            path = []
            node = sysm.fs
        names = sorted(node, key=lambda k: (not isinstance(node[k], dict), k.lower()))
        entries = ([("..", True)] if path else []) + [(n, isinstance(node[n], dict)) for n in names]
        sel = max(0, min(sel, len(entries) - 1))
        r = frame(scr, "Files", "Enter open  Bksp up  n new file  d new folder  r rename  x delete")
        if r is None:
            if is_esc(getkey(scr)):
                return
            continue
        y, x, h, w = r
        put(scr, y, x, " Location: ", GB)
        put(scr, y, x + 11, sysm.path_str(path)[: w - 12])
        put(scr, y + 1, x, "─" * w, DIM)
        lw = w // 2 if w >= 70 else w
        lh = h - 3
        if sel < top:
            top = sel
        if sel >= top + lh:
            top = sel - lh + 1
        for i in range(lh):
            j = top + i
            if j >= len(entries):
                break
            name, isdir = entries[j]
            if isdir:
                label = f" [DIR]  {name}/"
                size = "" if name == ".." else f"{len(node[name])} items"
            else:
                label = f"        {name}"
                size = f"{len(node[name])} B"
            row = (label[: lw - 12]).ljust(lw - 12) + size.rjust(10) + " "
            put(scr, y + 2 + i, x, row[:lw], INV if j == sel else (GB if isdir else G))
        if not entries:
            put(scr, y + 3, x + 2, "(empty folder - press n to create a file)", DIM)
        # preview pane
        if lw < w and entries:
            px = x + lw + 1
            for i in range(lh):
                put(scr, y + 2 + i, px - 1, "│", DIM)
            name, isdir = entries[sel]
            if name == "..":
                put(scr, y + 2, px + 1, "Go up one folder", DIM)
            elif isdir:
                sub = node[name]
                put(scr, y + 2, px + 1, f"Folder: {name}", GB)
                for i, k in enumerate(sorted(sub)[: lh - 2]):
                    put(scr, y + 4 + i, px + 1, (k + ("/" if isinstance(sub[k], dict) else ""))[: w - lw - 3])
            else:
                put(scr, y + 2, px + 1, f"Preview: {name}"[: w - lw - 3], GB)
                for i, l in enumerate(node[name].split("\n")[: lh - 2]):
                    put(scr, y + 4 + i, px + 1, l.replace("\t", " ")[: w - lw - 3])
        put(scr, y + h - 1, x, f" {len(entries)} entries  |  {msg}".ljust(w)[:w], INV)
        scr.refresh()

        k = getkey(scr)
        if k is None or k == curses.KEY_RESIZE:
            continue
        cur = entries[sel] if entries else None
        try:
            if is_esc(k) or k == "q":
                return
            elif k == curses.KEY_UP:
                sel -= 1
            elif k == curses.KEY_DOWN:
                sel += 1
            elif k == curses.KEY_PPAGE:
                sel -= lh
            elif k == curses.KEY_NPAGE:
                sel += lh
            elif k == curses.KEY_HOME:
                sel = 0
            elif k == curses.KEY_END:
                sel = len(entries) - 1
            elif is_back(k) or k == curses.KEY_LEFT:
                if path:
                    path.pop()
                    sel = 0
            elif (is_enter(k) or k == curses.KEY_RIGHT) and cur:
                name, isdir = cur
                if name == "..":
                    path.pop()
                    sel = 0
                elif isdir:
                    path.append(name)
                    sel = 0
                elif is_enter(k):
                    notepad(scr, sysm, path + [name])
                    scr.timeout(1000)
            elif k == "n":
                name = ask(scr, "New file name:")
                if name:
                    if name in node:
                        raise FSError(f"{name} already exists")
                    sysm.write_file(sysm.split(sysm.path_str(path) + "/" + name), "")
                    msg = f"Created {name}"
            elif k == "d":
                name = ask(scr, "New folder name:")
                if name:
                    sysm.mkdir(sysm.split(sysm.path_str(path) + "/" + name))
                    msg = f"Created folder {name}"
            elif k == "r" and cur and cur[0] != "..":
                new = ask(scr, f"Rename '{cur[0]}' to:", cur[0])
                if new and new != cur[0]:
                    sysm.rename(path + [cur[0]], new)
                    msg = f"Renamed to {new}"
            elif k in ("x", curses.KEY_DC) and cur and cur[0] != "..":
                if confirm(scr, f"Delete '{cur[0]}'? This cannot be undone."):
                    sysm.remove(path + [cur[0]], recursive=True)
                    msg = f"Deleted {cur[0]}"
        except FSError as e:
            msg = f"Error: {e}"


def calculator_app(scr, sysm, shell=None):
    expr, cur = "", 0
    result, last, hist = "0", None, []
    pad = ["[ 7 ] [ 8 ] [ 9 ] [ / ]",
           "[ 4 ] [ 5 ] [ 6 ] [ * ]",
           "[ 1 ] [ 2 ] [ 3 ] [ - ]",
           "[ 0 ] [ . ] [ = ] [ + ]",
           "[ ( ] [ ) ] [ ^ ] [ % ]"]
    scr.timeout(1000)
    while True:
        r = frame(scr, "Calculator", "Type an expression, Enter = calculate, ^U clear  (sqrt sin log pi ans ^)")
        if r is None:
            if is_esc(getkey(scr)):
                return
            continue
        y, x, h, w = r
        dw = min(44, w - 2)
        box(scr, y, x, 6, dw, "Display")
        put(scr, y + 4, x + 2, result[-(dw - 4):].rjust(dw - 4), GB)
        fw = dw - 4
        start = max(0, cur - fw + 1)
        put(scr, y + 2, x + 2, expr[start:start + fw].ljust(fw), INV)
        for i, row in enumerate(pad):
            put(scr, y + 8 + i * 2, x + (dw - len(row)) // 2, row, G)
        put(scr, y + 19, x + 2, "Functions: sqrt sin cos tan log exp fact abs", DIM)
        put(scr, y + 20, x + 2, "Constants: pi e tau   'ans' = last result", DIM)
        hx = x + dw + 3
        if hx < x + w - 15:
            put(scr, y, hx, "History", GB)
            for i, l in enumerate(hist[-(h - 3):][::-1]):
                put(scr, y + 2 + i, hx, l[: x + w - hx - 1])
        cursor(1)
        try:
            scr.move(y + 2, x + 2 + cur - start)
        except curses.error:
            pass
        scr.refresh()
        k = getkey(scr)
        if k is None or k == curses.KEY_RESIZE:
            continue
        if is_esc(k):
            cursor(0)
            return
        if is_enter(k) or (k == "=" and expr):
            if expr.strip():
                try:
                    v = safe_eval(expr, {"ans": last})
                    result = fmt_num(v)
                    last = v
                    hist.append(f"{expr} = {result}")
                    expr, cur = "", 0
                except ZeroDivisionError:
                    result = "Error: division by zero"
                except Exception as e:
                    result = f"Error: {e}"
        else:
            expr, cur, _ = line_edit(k, expr, cur)


def monitor_app(scr, sysm, shell=None):
    cores = [random.uniform(5, 40) for _ in range(4)]
    mem = 30.0
    graph = []
    sel = 0
    msg = ""
    spark = " ▁▂▃▄▅▆▇█"
    while True:
        cores = [max(1, min(100, c + random.uniform(-12, 12))) for c in cores]
        mem = max(15, min(85, mem + random.uniform(-2, 2)))
        for p in sysm.procs:
            p["cpu"] = max(0, min(60, p["cpu"] + random.uniform(-1.5, 1.5)))
        if random.random() < 0.04 and len(sysm.procs) < 30:
            sysm.spawn(random.choice(["worker", "updater", "indexer", "thumbnaild", "greenhelper"]))
        avg = sum(cores) / len(cores)
        graph = (graph + [avg])[-200:]
        r = frame(scr, "System Monitor", "Up/Down select   k kill process")
        if r is None:
            scr.timeout(800)
            if is_esc(getkey(scr)):
                return
            continue
        y, x, h, w = r
        bw = max(10, min(40, w - 30))
        for i, c in enumerate(cores):
            n = int(bw * c / 100)
            put(scr, y + i, x, f"CPU{i} ")
            put(scr, y + i, x + 5, "[" + "|" * n + " " * (bw - n) + "]", GB)
            put(scr, y + i, x + bw + 8, f"{c:5.1f}%")
        n = int(bw * mem / 100)
        put(scr, y + 4, x, "MEM  ")
        put(scr, y + 4, x + 5, "[" + "|" * n + " " * (bw - n) + "]", GB)
        put(scr, y + 4, x + bw + 8, f"{mem * 163.84:6.0f}M / 16384M")
        ix = x + bw + 30
        if ix < x + w - 20:
            put(scr, y, ix, f"Uptime : {fmt_uptime(sysm.uptime())}")
            put(scr, y + 1, ix, f"Tasks  : {len(sysm.procs)}")
            put(scr, y + 2, ix, f"Avg CPU: {avg:5.1f}%")
            put(scr, y + 3, ix, f"User   : {sysm.settings['user']}")
        gw = w - 2
        put(scr, y + 6, x, "CPU history", GB)
        g = graph[-gw:]
        put(scr, y + 7, x, "".join(spark[min(8, int(v / 100 * 8.99))] for v in g), G)
        put(scr, y + 9, x, "  PID  NAME             CPU%   MEM%".ljust(w), INV)
        rows = h - 12
        sel = max(0, min(sel, len(sysm.procs) - 1))
        top = max(0, sel - rows + 1)
        for i, p in enumerate(sysm.procs[top:top + rows]):
            line = f"{p['pid']:>5}  {p['name']:<15} {p['cpu']:5.1f}  {p['mem']:5.1f}"
            put(scr, y + 10 + i, x, line.ljust(w)[:w], INV if top + i == sel else G)
        put(scr, y + h - 1, x, f" {msg}".ljust(w)[:w], DIM)
        scr.refresh()
        scr.timeout(800)
        k = getkey(scr)
        if is_esc(k) or k == "q":
            scr.timeout(1000)
            return
        if k == curses.KEY_UP:
            sel -= 1
        elif k == curses.KEY_DOWN:
            sel += 1
        elif k == "k" and sysm.procs:
            p = sysm.procs[sel]
            if p["name"] in ("init", "kernel_task"):
                msg = f"Permission denied: {p['name']} is a critical process"
            else:
                sysm.procs.remove(p)
                msg = f"Killed {p['name']} (PID {p['pid']})"


BIG = {
    "0": ["█████", "█   █", "█   █", "█   █", "█████"],
    "1": ["  █  ", " ██  ", "  █  ", "  █  ", " ███ "],
    "2": ["█████", "    █", "█████", "█    ", "█████"],
    "3": ["█████", "    █", " ████", "    █", "█████"],
    "4": ["█   █", "█   █", "█████", "    █", "    █"],
    "5": ["█████", "█    ", "█████", "    █", "█████"],
    "6": ["█████", "█    ", "█████", "█   █", "█████"],
    "7": ["█████", "    █", "   █ ", "  █  ", "  █  "],
    "8": ["█████", "█   █", "█████", "█   █", "█████"],
    "9": ["█████", "█   █", "█████", "    █", "█████"],
    ":": [" ", "█", " ", "█", " "],
}


def big_text(s):
    return [" ".join(BIG[c][r] for c in s) for r in range(5)]


def clock_app(scr, sysm, shell=None):
    running, start, acc = False, 0.0, 0.0
    while True:
        r = frame(scr, "Clock", "Space start/stop stopwatch   r reset")
        scr.timeout(200)
        if r is None:
            if is_esc(getkey(scr)):
                return
            continue
        y, x, h, w = r
        now = datetime.datetime.now()
        big = big_text(now.strftime("%H:%M:%S"))
        for i, l in enumerate(big):
            put(scr, y + 1 + i, x + (w - len(l)) // 2, l, GB)
        d = now.strftime("%A, %d %B %Y")
        put(scr, y + 7, x + (w - len(d)) // 2, d)
        # calendar
        cx = x + max(1, w // 2 - 26)
        cyy = y + 10
        cal = calendar.TextCalendar().formatmonth(now.year, now.month).splitlines()
        box(scr, cyy - 1, cx - 2, len(cal) + 2, 25, "Calendar")
        for i, l in enumerate(cal):
            put(scr, cyy + i, cx, l)
        first, _ = calendar.monthrange(now.year, now.month)
        idx = first + now.day - 1
        put(scr, cyy + 2 + idx // 7, cx + (idx % 7) * 3, f"{now.day:2d}", INV)
        # stopwatch
        el = acc + (time.time() - start if running else 0)
        m, s = divmod(el, 60)
        sx = x + w // 2 + 4
        box(scr, cyy - 1, sx - 2, 8, 26, "Stopwatch")
        put(scr, cyy + 1, sx, f"{int(m):02d}:{s:04.1f}", GB)
        put(scr, cyy + 3, sx, "RUNNING" if running else "STOPPED", INV if running else DIM)
        put(scr, cyy + 5, sx, "Space = start/stop", DIM)
        scr.refresh()
        k = getkey(scr)
        if is_esc(k) or k == "q":
            scr.timeout(1000)
            return
        if k == " ":
            if running:
                acc += time.time() - start
            else:
                start = time.time()
            running = not running
        elif k == "r":
            running, acc = False, 0.0


def snake_app(scr, sysm, shell=None):
    def new_game(gw, gh):
        cx, cy = gw // 2, gh // 2
        st = {"dims": (gw, gh), "snake": [(cx - i, cy) for i in range(3)], "dir": (1, 0),
              "next": (1, 0), "score": 0, "dead": False, "paused": False, "food": None}
        place_food(st)
        return st

    def place_food(st):
        gw, gh = st["dims"]
        free = [(a, b) for a in range(gw) for b in range(gh) if (a, b) not in st["snake"]]
        st["food"] = random.choice(free) if free else None

    st = None
    last = time.time()
    cursor(0)
    while True:
        hi = sysm.settings.get("snake_high", 0)
        score = st["score"] if st else 0
        r = frame(scr, f"Snake - score {score}  high {hi}", "Arrows/WASD move   p pause   r restart")
        if r is None:
            scr.timeout(500)
            if is_esc(getkey(scr)):
                return
            continue
        y, x, h, w = r
        gw, gh = max(5, w // 2), max(5, h)
        if st is None or st["dims"] != (gw, gh):
            st = new_game(gw, gh)
        if st["food"]:
            fx, fy = st["food"]
            put(scr, y + fy, x + fx * 2, "<>", GB)
        for i, (sx, sy) in enumerate(st["snake"]):
            put(scr, y + sy, x + sx * 2, "▓▓" if i == 0 else "██", GB if i == 0 else G)
        if st["dead"]:
            msg = f" GAME OVER - score {st['score']}   r = restart   Esc = quit "
            put(scr, y + h // 2, x + max(0, (w - len(msg)) // 2), msg, INV)
        elif st["paused"]:
            put(scr, y + h // 2, x + (w - 10) // 2, "  PAUSED  ", INV)
        scr.refresh()
        delay = max(0.045, 0.12 - st["score"] * 0.002)
        remaining = delay - (time.time() - last)
        scr.timeout(max(1, int(remaining * 1000)))
        k = getkey(scr)
        if is_esc(k) or k == "q":
            scr.timeout(1000)
            return
        dirs = {curses.KEY_UP: (0, -1), "w": (0, -1), curses.KEY_DOWN: (0, 1), "s": (0, 1),
                curses.KEY_LEFT: (-1, 0), "a": (-1, 0), curses.KEY_RIGHT: (1, 0), "d": (1, 0)}
        if k in dirs:
            nd = dirs[k]
            if (nd[0] + st["dir"][0], nd[1] + st["dir"][1]) != (0, 0):
                st["next"] = nd
        elif k == "p" and not st["dead"]:
            st["paused"] = not st["paused"]
        elif k == "r":
            st = new_game(gw, gh)
        if time.time() - last >= delay:
            last = time.time()
            if st["dead"] or st["paused"]:
                continue
            st["dir"] = st["next"]
            hx, hy = st["snake"][0]
            nh = (hx + st["dir"][0], hy + st["dir"][1])
            if not (0 <= nh[0] < gw and 0 <= nh[1] < gh) or nh in st["snake"][:-1]:
                st["dead"] = True
                if st["score"] > hi:
                    sysm.settings["snake_high"] = st["score"]
                    sysm.save()
                continue
            st["snake"].insert(0, nh)
            if nh == st["food"]:
                st["score"] += 1
                place_food(st)
                if st["food"] is None:
                    st["dead"] = True
            else:
                st["snake"].pop()


def settings_app(scr, sysm, shell=None):
    sel = 0
    msg = "Changes are saved automatically"
    s = sysm.settings
    onoff = lambda v: "ON " if v else "OFF"
    while True:
        items = [
            ("Username", s["user"]),
            ("Hostname", s["host"]),
            ("Bright green text", onoff(s["bright"])),
            ("Desktop dot pattern", onoff(s["pattern"])),
            ("Fast boot", onoff(s["fastboot"])),
            ("Reset snake high score", str(s.get("snake_high", 0))),
            ("Reset file system to factory default", ""),
        ]
        r = frame(scr, "Settings", "Up/Down select   Enter change")
        scr.timeout(1000)
        if r is None:
            if is_esc(getkey(scr)):
                return
            continue
        y, x, h, w = r
        put(scr, y, x + 2, "System Settings", GB)
        put(scr, y + 1, x + 2, "─" * min(56, w - 4), DIM)
        for i, (name, val) in enumerate(items):
            row = f"  {name:<40}{val:>12}  "
            put(scr, y + 3 + i * 2, x + 2, row, INV if i == sel else G)
        put(scr, y + h - 1, x, f" {msg}".ljust(w)[:w], INV)
        scr.refresh()
        k = getkey(scr)
        if is_esc(k) or k == "q":
            return
        if k == curses.KEY_UP:
            sel = (sel - 1) % len(items)
        elif k == curses.KEY_DOWN:
            sel = (sel + 1) % len(items)
        elif is_enter(k) or k == " ":
            if sel in (0, 1):
                key = "user" if sel == 0 else "host"
                v = ask(scr, f"New {items[sel][0].lower()}:", s[key])
                if v:
                    v = v.replace(" ", "")[:16]
                    if v:
                        s[key] = v
                        msg = f"{items[sel][0]} set to {v}"
            elif sel in (2, 3, 4):
                key = ["bright", "pattern", "fastboot"][sel - 2]
                s[key] = not s[key]
                if key == "bright":
                    apply_theme(scr, sysm)
                msg = f"{items[sel][0]}: {onoff(s[key]).strip()}"
            elif sel == 5:
                s["snake_high"] = 0
                msg = "Snake high score reset"
            elif sel == 6:
                if confirm(scr, "Erase ALL your files and restore the defaults?"):
                    sysm.fs = default_fs()
                    sysm.cwd = list(HOME)
                    msg = "File system restored to factory default"
            sysm.save()


def about_app(scr, sysm, shell=None):
    while True:
        r = frame(scr, f"About {OS_NAME}", "Press any key to close")
        scr.timeout(1000)
        if r is None:
            if is_esc(getkey(scr)):
                return
            continue
        y, x, h, w = r
        for i, l in enumerate(LOGO):
            put(scr, y + 1 + i, x + (w - len(l)) // 2, l, GB)
        H, W = scr.getmaxyx()
        info = [
            f"{OS_NAME} {VERSION}  -  \"The greenest OS that isn't one\"",
            "",
            "This is NOT a real operating system.",
            "It's a Python script pretending to be one inside your terminal.",
            "",
            f"Kernel     : green-{VERSION}.0-lts (imaginary)",
            f"Uptime     : {fmt_uptime(sysm.uptime())}",
            f"Display    : {W} x {H} characters",
            f"Python     : {platform.python_version()}",
            f"Saved data : {SAVE_FILE}",
        ]
        for i, l in enumerate(info):
            put(scr, y + 8 + i, x + (w - 64) // 2 if w > 64 else x, l, GB if i == 0 else G)
        scr.refresh()
        k = getkey(scr)
        if k is not None and k != curses.KEY_RESIZE:
            return


def terminal_app(scr, sysm, shell):
    res = shell_screen(scr, sysm, shell, in_ui=True)
    return res if res in ("reboot", "shutdown") else None


APPS = [
    ("Files", [" ___   ", "|   \\_ ", "|_____|"], files_app),
    ("Notepad", [" _____ ", "|=====|", "|_____|"], lambda s, m, sh: notepad(s, m)),
    ("Terminal", [" _____ ", "|>_   |", "|_____|"], terminal_app),
    ("Calculator", [" _____ ", "|1+2=3|", "|_____|"], calculator_app),
    ("Monitor", [" _____ ", "|/\\/\\_|", "|_____|"], monitor_app),
    ("Clock", ["  ___  ", " / | \\ ", " \\___/ "], clock_app),
    ("Snake", ["  __o  ", " /  ~  ", "~~~~   "], snake_app),
    ("Settings", ["  _*_  ", " (_o_) ", "   *   "], settings_app),
    ("About", [" _____ ", "|  i  |", "|_____|"], about_app),
]
CELL_W, CELL_H = 14, 5


# --------------------------------------------------------------------------
# Desktop
# --------------------------------------------------------------------------
def draw_desktop(scr, sysm, sel, toast):
    H, W = scr.getmaxyx()
    scr.erase()
    if sysm.settings.get("pattern"):
        row = ("·   " * (W // 4 + 1))[:W]
        for yy in range(2, H - 1, 2):
            put(scr, yy, 0, row, DIM)
    topbar(scr, "Desktop")
    cols = max(1, (W - 4) // CELL_W)
    cells = []
    for i, (name, icon, _) in enumerate(APPS):
        cy = 2 + (i // cols) * (CELL_H + 1)
        cx = 3 + (i % cols) * CELL_W
        cells.append((cy, cx))
        selected = i == sel
        for j, l in enumerate(icon):
            put(scr, cy + j, cx + (CELL_W - 2 - len(l)) // 2, l, GB if selected else G)
        lab = f" {name} "
        put(scr, cy + 3, cx + (CELL_W - 2 - len(lab)) // 2, lab, INV if selected else GB)
    bottom = cells[-1][0] + CELL_H
    ly = H - 3 - len(LOGO)
    if ly > bottom and W > len(LOGO[0]) + 6:
        for i, l in enumerate(LOGO):
            put(scr, ly + i, W - len(l) - 3, l, DIM)
    st = sysm.settings
    bottombar(scr, "          Arrows select   Enter open   F1/m menu   q log out",
              f"{st['user']}@{st['host']}")
    put(scr, H - 1, 0, " ▶ Start ", curses.A_REVERSE | GB)
    if toast and time.time() < toast[1]:
        t = toast[0]
        box(scr, H - 6, W - len(t) - 7, 3, len(t) + 4, "Notification", GB, fill=True)
        put(scr, H - 5, W - len(t) - 5, t, GB)
    scr.refresh()
    return cells


def start_menu(scr):
    H, W = scr.getmaxyx()
    items = [a[0] for a in APPS] + [None, "Log out to shell", "Reboot", "Shut down"]
    sel = 0
    mw = 24
    mh = len(items) + 2
    y0 = max(1, H - 1 - mh)
    scr.timeout(-1)
    try:
        while True:
            box(scr, y0, 0, mh, mw, OS_NAME, GB, fill=True)
            for i, it in enumerate(items):
                if it is None:
                    put(scr, y0 + 1 + i, 1, "─" * (mw - 2), DIM)
                else:
                    put(scr, y0 + 1 + i, 1, f" {it}".ljust(mw - 2), INV if i == sel else G)
            scr.refresh()
            k = getkey(scr)
            step = 0
            if k == curses.KEY_UP:
                step = -1
            elif k == curses.KEY_DOWN:
                step = 1
            elif is_enter(k):
                return items[sel]
            elif is_esc(k) or k in (curses.KEY_F1, "m"):
                return None
            elif k == curses.KEY_MOUSE:
                try:
                    _, mx, my, _, b = curses.getmouse()
                except curses.error:
                    continue
                i = my - y0 - 1
                if 0 <= mx < mw and 0 <= i < len(items) and items[i]:
                    return items[i]
                return None
            if step:
                sel = (sel + step) % len(items)
                if items[sel] is None:
                    sel = (sel + step) % len(items)
    finally:
        scr.timeout(1000)


def desktop(scr, sysm, shell):
    sel = 0
    toast = ("Welcome to the GreenOS desktop! Press F1 or m for the menu.", time.time() + 5)
    try:
        curses.mousemask(curses.ALL_MOUSE_EVENTS)
        curses.mouseinterval(0)
    except Exception:
        pass
    cursor(0)
    scr.timeout(1000)

    def launch(i):
        cursor(0)
        res = APPS[i][2](scr, sysm, shell)
        cursor(0)
        scr.timeout(1000)
        return res

    try:
        while True:
            if too_small(scr):
                k = getkey(scr)
                if k == "q" or is_esc(k):
                    return "logout"
                continue
            cells = draw_desktop(scr, sysm, sel, toast)
            H, W = scr.getmaxyx()
            cols = max(1, (W - 4) // CELL_W)
            k = getkey(scr)
            if k is None or k == curses.KEY_RESIZE:
                continue
            res = None
            if k == curses.KEY_LEFT:
                sel = max(0, sel - 1)
            elif k == curses.KEY_RIGHT:
                sel = min(len(APPS) - 1, sel + 1)
            elif k == curses.KEY_UP:
                sel = sel - cols if sel - cols >= 0 else sel
            elif k == curses.KEY_DOWN:
                sel = sel + cols if sel + cols < len(APPS) else sel
            elif is_enter(k):
                res = launch(sel)
            elif k in (curses.KEY_F1, "m"):
                choice = start_menu(scr)
                if choice == "Log out to shell":
                    return "logout"
                if choice == "Reboot":
                    return "reboot"
                if choice == "Shut down":
                    return "shutdown"
                names = [a[0] for a in APPS]
                if choice in names:
                    sel = names.index(choice)
                    res = launch(sel)
            elif k == "q" or is_esc(k):
                if confirm(scr, "Log out and return to the shell?"):
                    return "logout"
            elif k == curses.KEY_MOUSE:
                try:
                    _, mx, my, _, b = curses.getmouse()
                except curses.error:
                    continue
                if my == H - 1 and mx < 9:
                    curses.ungetch(curses.KEY_F1)
                    continue
                for i, (cy, cx) in enumerate(cells):
                    if cy <= my < cy + 4 and cx <= mx < cx + CELL_W - 2:
                        dbl = b & (curses.BUTTON1_DOUBLE_CLICKED)
                        if i == sel or dbl:
                            sel = i
                            res = launch(i)
                        else:
                            sel = i
                        break
            if res in ("reboot", "shutdown"):
                return res
    finally:
        try:
            curses.mousemask(0)
        except Exception:
            pass


# --------------------------------------------------------------------------
# Misc effects
# --------------------------------------------------------------------------
def matrix_effect(scr):
    cursor(0)
    scr.erase()
    chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ@#$%&*+=<>?"
    drops = []
    scr.timeout(45)
    tail = 12
    while True:
        H, W = scr.getmaxyx()
        if len(drops) != W:
            drops = [random.randint(-H, 0) for _ in range(W)]
            scr.erase()
        for x in range(0, W, 2):
            y = drops[x]
            put(scr, y, x, random.choice(chars), GB)
            put(scr, y - 1, x, random.choice(chars), G)
            put(scr, y - tail, x, " ")
            drops[x] += 1
            if drops[x] - tail > H and random.random() < 0.3:
                drops[x] = random.randint(-8, 0)
        msg = " Wake up, Neo...  (press any key) "
        put(scr, H // 2, (W - len(msg)) // 2, msg, INV)
        scr.refresh()
        k = getkey(scr)
        if k is not None and k != curses.KEY_RESIZE:
            scr.timeout(1000)
            return


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------
def main(scr):
    curses.raw()  # we handle Ctrl+C / Ctrl+S ourselves
    curses.noecho()
    scr.keypad(True)
    if curses.has_colors():
        curses.start_color()
        curses.init_pair(1, curses.COLOR_GREEN, curses.COLOR_BLACK)
        curses.init_pair(2, curses.COLOR_BLACK, curses.COLOR_GREEN)
    sysm = System()
    apply_theme(scr, sysm)
    while True:
        boot(scr, sysm)
        shell = Shell(sysm)
        while True:
            res = shell_screen(scr, sysm, shell)
            if res == "ui":
                res = desktop(scr, sysm, shell)
                if res == "logout":
                    continue
            if res in ("reboot", "shutdown", "exit"):
                break
        shutdown_anim(scr, sysm, rebooting=res == "reboot")
        if res != "reboot":
            return


if __name__ == "__main__":
    if not (sys.stdin.isatty() and sys.stdout.isatty()):
        print(f"{OS_NAME} must be run in a real terminal window (Terminal, cmd, PowerShell),")
        print("not inside IDLE or an editor's output panel. Open a terminal and run:")
        print(f"\n    python {os.path.basename(__file__)}\n")
        _pause()
        sys.exit(1)
    try:
        curses.wrapper(main)
    except KeyboardInterrupt:
        pass
    except Exception:
        import traceback
        err = traceback.format_exc()
        log = os.path.join(os.path.expanduser("~"), "greenos_crash.log")
        try:
            with open(log, "w") as f:
                f.write(err)
        except OSError:
            log = None
        print(f"{OS_NAME} crashed :(  Here is the error:\n")
        print(err)
        if log:
            print(f"(Also saved to {log})")
        _pause()
        sys.exit(1)
    print(f"{OS_NAME} has shut down. Your fake files are saved in {SAVE_FILE}")
    if os.name == "nt":
        _pause()
