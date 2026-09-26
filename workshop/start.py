#!/usr/bin/env python3
"""Launch PartnershipWorld Workshop."""

import socket
import subprocess
import sys
import webbrowser
from pathlib import Path

WORKSHOP_DIR = Path(__file__).parent
DB_PATH = WORKSHOP_DIR / "data" / "workshop.db"
PORT = 8787


def python_executable() -> str:
    """Always use the workshop venv when it exists — setup and server must match."""
    venv_python = WORKSHOP_DIR / "venv" / "bin" / "python"
    if venv_python.exists():
        return str(venv_python)
    return sys.executable


def get_local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def check_db_writable() -> bool:
    """SQLite goes stale if the db file is deleted while the server runs."""
    if not DB_PATH.exists():
        return True
    try:
        import sqlite3
        conn = sqlite3.connect(str(DB_PATH))
        conn.execute("SELECT 1")
        conn.execute("CREATE TABLE IF NOT EXISTS _write_check (id INTEGER)")
        conn.execute("DROP TABLE IF EXISTS _write_check")
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Database problem: {e}")
        print("Fix: stop the server (Ctrl+C), then:")
        print("  rm workshop/data/workshop.db")
        print("  python3 start.py")
        return False


def main():
    (WORKSHOP_DIR / "data").mkdir(exist_ok=True)

    if DB_PATH.exists() and not check_db_writable():
        sys.exit(1)

    if not DB_PATH.exists():
        print("No account found. Running setup first...\n")
        result = subprocess.run([python_executable(), "setup.py"], cwd=str(WORKSHOP_DIR))
        if result.returncode != 0:
            sys.exit(1)
        print()

    local_ip = get_local_ip()
    print("Starting PartnershipWorld Workshop...")
    print(f"  Browser:  http://localhost:{PORT}")
    print(f"  Phone:    http://{local_ip}:{PORT}")
    print("  Press Ctrl+C to stop\n")

    webbrowser.open(f"http://localhost:{PORT}")

    subprocess.run(
        [python_executable(), "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", str(PORT)],
        cwd=str(WORKSHOP_DIR),
    )


if __name__ == "__main__":
    main()