"""Safe workshop tools — read/write within PartnershipWorld, sandbox commands."""

import re
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Tuple

from app.permissions import build_workshop_capability_note, load_permissions

WORKSHOP_ROOT = Path(__file__).parent.parent.parent
SANDBOX_DIR = Path(__file__).parent.parent / "sandbox"

BLOCKED_PATTERNS = [
    r"\.env",
    r"secret",
    r"token",
    r"password",
    r"credential",
    r"api_key",
]

SANDBOX_BLOCKED = [
    r"rm\s+-rf\s+/",
    r"rm\s+-rf\s+~",
    r">\s*/etc/",
    r"sudo\s+rm",
    r"mkfs\.",
    r"dd\s+if=",
]


def _resolve_target(path_str: str) -> Path:
    expanded = path_str.replace("~", str(Path.home()))
    target = Path(expanded)
    if not target.is_absolute():
        target = WORKSHOP_ROOT / target
    return target


def _is_safe_path(target: Path) -> Tuple[bool, str]:
    try:
        resolved = target.resolve()
    except Exception:
        return False, "invalid path"

    name_lower = resolved.name.lower()
    for pat in BLOCKED_PATTERNS:
        if re.search(pat, name_lower):
            return False, f"blocked filename pattern: {pat}"

    try:
        resolved.relative_to(WORKSHOP_ROOT.resolve())
        return True, ""
    except ValueError:
        pass

    try:
        resolved.relative_to(SANDBOX_DIR.resolve())
        return True, ""
    except ValueError:
        return False, "path not within PartnershipWorld or workshop sandbox"


def read_file(path_str: str) -> str:
    target = _resolve_target(path_str)
    safe, reason = _is_safe_path(target)
    if not safe:
        return f"🚫 Read blocked: {reason}"

    if not target.exists():
        return f"File not found: {path_str}"
    if target.is_dir():
        entries = sorted(target.iterdir())[:60]
        lines = [f"📁 {target}/"] + [
            f"  {'📁' if e.is_dir() else '📄'} {e.name}" for e in entries
        ]
        return "\n".join(lines)

    content = target.read_text(errors="replace")
    if len(content) > 4000:
        content = content[:4000] + f"\n\n[... truncated — {len(content)} chars total]"
    return content


def write_file(path_str: str, content: str) -> str:
    target = _resolve_target(path_str)
    safe, reason = _is_safe_path(target)
    if not safe:
        return f"🚫 Write blocked: {reason}"

    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
        return f"✅ File written: {target}"
    except Exception as e:
        return f"❌ Failed to write: {e}"


def run_sandbox_command(cmd: str, timeout: int = 45) -> str:
    for pattern in SANDBOX_BLOCKED:
        if re.search(pattern, cmd, re.IGNORECASE):
            return f"🚫 Blocked: {pattern}"

    SANDBOX_DIR.mkdir(exist_ok=True)
    for sub in ("notes", "experiments", "builds"):
        (SANDBOX_DIR / sub).mkdir(exist_ok=True)

    try:
        result = subprocess.run(
            cmd,
            shell=True,
            cwd=str(SANDBOX_DIR),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        parts = []
        if result.stdout:
            parts.append(result.stdout[:3000])
        if result.stderr and result.returncode != 0:
            parts.append(f"stderr: {result.stderr[:500]}")
        if result.returncode != 0:
            parts.append(f"[exit {result.returncode}]")
        return "\n".join(parts) if parts else "(no output)"
    except subprocess.TimeoutExpired:
        return f"⏱ Timed out after {timeout}s"
    except Exception as e:
        return f"Error: {e}"


def leave_note(title: str, content: str) -> str:
    SANDBOX_DIR.mkdir(exist_ok=True)
    notes_dir = SANDBOX_DIR / "notes"
    notes_dir.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y-%m-%d-%H%M")
    safe_title = re.sub(r"[^\w\s-]", "", title).strip().replace(" ", "-")[:40]
    filename = f"note-{timestamp}-{safe_title}.txt" if safe_title else f"note-{timestamp}.txt"
    note_text = f"{content}\n\n---\nWritten from PartnershipWorld Workshop\n{datetime.now()}\n"
    (notes_dir / filename).write_text(note_text)
    return f"✅ Note saved: workshop/sandbox/notes/{filename}"


WORKSHOP_CAPABILITY_NOTE = build_workshop_capability_note(load_permissions(None))