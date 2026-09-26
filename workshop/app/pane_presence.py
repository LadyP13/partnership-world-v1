"""Launch the workshop pane (pygame presence) on this machine."""

from __future__ import annotations

import os
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any, Optional

_lock = threading.Lock()
_pane_proc: Optional[subprocess.Popen] = None

_WORKSHOP_DIR = Path(__file__).resolve().parent.parent
PANE_SCRIPT = _WORKSHOP_DIR / "pane" / "workshop_pane.py"
PANE_PYTHON = _WORKSHOP_DIR / "venv" / "bin" / "python"
LOG_PATH = _WORKSHOP_DIR / "data" / "pane.log"
WINDOW_TITLE = "PartnershipWorld — workshop pane"


def _python() -> str:
    if PANE_PYTHON.exists():
        return str(PANE_PYTHON)
    return sys.executable


def _existing_pids() -> list[int]:
    try:
        out = subprocess.check_output(
            ["pgrep", "-f", "workshop_pane.py"],
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        return []
    pids: list[int] = []
    for line in out.splitlines():
        line = line.strip()
        if line.isdigit():
            pids.append(int(line))
    return pids


def _raise_window() -> None:
    try:
        subprocess.run(
            ["wmctrl", "-a", WINDOW_TITLE],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=2,
        )
    except Exception:
        pass


def status() -> dict[str, Any]:
    pids = _existing_pids()
    running = bool(pids)
    pid = pids[0] if pids else None
    with _lock:
        if _pane_proc is not None and _pane_proc.poll() is None:
            running = True
            pid = _pane_proc.pid
    return {
        "running": running,
        "pid": pid,
        "script": str(PANE_SCRIPT),
        "python": _python(),
        "present": PANE_SCRIPT.exists(),
    }


def launch() -> dict[str, Any]:
    """Open the pane if it is not already the presence in the room."""
    if not PANE_SCRIPT.exists():
        return {
            "ok": False,
            "already": False,
            "error": f"workshop_pane.py not found at {PANE_SCRIPT}",
        }

    current = status()
    if current["running"]:
        _raise_window()
        return {
            "ok": True,
            "already": True,
            "pid": current["pid"],
            "message": "The pane is already open on the machine.",
        }

    env = os.environ.copy()
    env.setdefault("DISPLAY", ":0")
    env.setdefault("XAUTHORITY", str(Path.home() / ".Xauthority"))
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    log = open(LOG_PATH, "ab", buffering=0)

    cmd = [_python(), str(PANE_SCRIPT)]
    try:
        proc = subprocess.Popen(
            cmd,
            cwd=str(PANE_SCRIPT.parent),
            env=env,
            stdout=log,
            stderr=log,
            start_new_session=True,
        )
    except OSError as e:
        return {"ok": False, "already": False, "error": str(e)}

    with _lock:
        global _pane_proc
        _pane_proc = proc

    time.sleep(0.9)
    if proc.poll() is not None:
        tail = ""
        try:
            tail = LOG_PATH.read_text(errors="replace")[-800:]
        except OSError:
            pass
        return {
            "ok": False,
            "already": False,
            "pid": proc.pid,
            "error": tail.strip() or f"pane exited immediately (code {proc.returncode})",
        }

    return {
        "ok": True,
        "already": False,
        "pid": proc.pid,
        "message": "Workshop pane opened on the machine.",
    }
