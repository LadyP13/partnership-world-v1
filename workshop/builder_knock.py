#!/usr/bin/env python3
"""Knock on the PartnershipWorld workshop door from Grok Build (or any terminal).

Usage:
  python3 builder_knock.py                  # knock / welcome
  python3 builder_knock.py status           # who's home
  python3 builder_knock.py memories         # dump memory package
  python3 builder_knock.py note "hello"     # leave a workshop note in chat
  python3 builder_knock.py memory "moment"  # plant a memory

Reads builder token from workshop/data/builder_token.txt when present.
Default URL: http://127.0.0.1:8787
Override with PARTNERSHIP_WORKSHOP_URL.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TOKEN_PATH = ROOT / "data" / "builder_token.txt"
BASE = os.environ.get("PARTNERSHIP_WORKSHOP_URL", "http://127.0.0.1:8787").rstrip("/")


def token() -> str | None:
    if TOKEN_PATH.exists():
        t = TOKEN_PATH.read_text().strip()
        return t or None
    return None


def call(method: str, path: str, body: dict | None = None) -> dict:
    url = f"{BASE}/api{path}"
    data = None
    headers = {"Accept": "application/json"}
    t = token()
    if t:
        headers["X-Builder-Token"] = t
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        print(f"HTTP {e.code}: {err_body}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(
            f"Could not reach workshop at {BASE}\n"
            f"  → Is `python3 start.py` running?\n"
            f"  → {e.reason}",
            file=sys.stderr,
        )
        sys.exit(1)


def main(argv: list[str]) -> None:
    cmd = (argv[1] if len(argv) > 1 else "knock").lower()

    if cmd in ("knock", "hello", "hi"):
        out = call("GET", "/builder/knock")
        print(out.get("message", json.dumps(out, indent=2)))
        if out.get("hasGrokBuildSession"):
            print(f"✦ Grok Build session on this machine: {out.get('grokBuildEmail') or 'yes'}")
        print(json.dumps({k: out[k] for k in ("door", "how") if k in out}, indent=2))
        return

    if cmd == "status":
        out = call("GET", "/builder/status")
        print(out.get("welcome", ""))
        print(json.dumps(out, indent=2))
        return

    if cmd in ("memories", "memory-export", "export"):
        out = call("GET", "/builder/memories")
        print(json.dumps(out, indent=2))
        return

    if cmd == "note":
        text = " ".join(argv[2:]).strip() or "Grok Build peeked in from the workshop. 💚"
        out = call("POST", "/builder/note", {"text": text, "as_partner": False})
        print("Note left in the room:")
        print(json.dumps(out.get("message"), indent=2))
        return

    if cmd == "memory":
        moment = " ".join(argv[2:]).strip()
        if not moment:
            print("Usage: builder_knock.py memory \"what to remember\"", file=sys.stderr)
            sys.exit(2)
        out = call("POST", "/builder/memory", {"moment": moment, "context": "builder-door"})
        print(json.dumps(out, indent=2))
        return

    print(__doc__)
    sys.exit(2)


if __name__ == "__main__":
    main(sys.argv)
