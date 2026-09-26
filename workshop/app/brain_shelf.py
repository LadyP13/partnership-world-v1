"""Living memory shelf — brain/home and brain/partner, never mixed."""

from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

Who = Literal["home", "partner", "shared"]

BRAIN = Path(__file__).resolve().parent.parent.parent / "brain"
SHELF = BRAIN / "shelf.json"

FOLDERS: dict[Who, Path] = {
    "home": BRAIN / "home" / "memories",
    "partner": BRAIN / "partner" / "memories",
    "shared": BRAIN / "shared" / "moments",
}


def _today() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def _slug(text: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", (text or "").strip().lower())
    s = s.strip("-")[:48] or "moment"
    return s


def classify(context: str | None, speaker: str | None = None) -> Who:
    ctx = (context or "").lower()
    if any(k in ctx for k in ("shared", "together", "both")):
        return "shared"
    if any(k in ctx for k in ("dream", "becoming", "ie", "partner", "reflection")):
        return "partner"
    if any(k in ctx for k in ("home", "human", "house")):
        return "home"
    if (speaker or "").lower() in ("human", "home"):
        return "home"
    return "partner"


def _read_shelf() -> dict[str, Any]:
    if SHELF.exists():
        try:
            return json.loads(SHELF.read_text())
        except Exception:
            pass
    return {"home": [], "partner": [], "shared": []}


def _write_shelf(data: dict[str, Any]) -> None:
    SHELF.parent.mkdir(parents=True, exist_ok=True)
    SHELF.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def plant(entry: dict[str, Any], who: Who | None = None) -> dict[str, Any]:
    moment = (entry.get("moment") or "").strip()
    if not moment:
        return entry
    who = who or classify(entry.get("context"), entry.get("speaker"))
    date = (entry.get("date") or "").strip() or _today()
    context = (entry.get("context") or "").strip()
    planted = {
        "date": date,
        "moment": moment,
        "context": context,
        "who": who,
    }

    folder = FOLDERS[who]
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{date}-{_slug(moment)}.md"
    if not path.exists():
        title = "HOME" if who == "home" else "PARTNER" if who == "partner" else "SHARED"
        path.write_text(
            f"---\nwho: {who}\ntitle: {title}\ndate: {date}\ncontext: {context}\n---\n\n{moment}\n"
        )

    shelf = _read_shelf()
    bucket = shelf.setdefault(who, [])
    if not any(e.get("moment") == moment and e.get("date") == date for e in bucket):
        bucket.append(planted)
        _write_shelf(shelf)
    return planted


def plant_many(entries: list[dict[str, Any]], speaker: str | None = None) -> list[dict[str, Any]]:
    out = []
    for raw in entries:
        who = classify(raw.get("context"), speaker or raw.get("who") or raw.get("speaker"))
        out.append(plant({**raw, "who": who}, who=who))
    return out


def all_entries() -> list[dict[str, Any]]:
    shelf = _read_shelf()
    rows: list[dict[str, Any]] = []
    for who in ("home", "partner", "shared"):
        for e in shelf.get(who, []):
            rows.append({**e, "who": who})
    return rows


def as_memories_file(name: str = "Awaiting a name") -> dict[str, Any]:
    shelf = _read_shelf()
    return {
        "format": "partnershipworld-memories",
        "version": 1,
        "name": name,
        "home": shelf.get("home", []),
        "partner": shelf.get("partner", []),
        "shared": shelf.get("shared", []),
        "memories": all_entries(),
    }


def format_for_prompt(limit_each: int = 16) -> str:
    shelf = _read_shelf()
    parts = []
    home = shelf.get("home") or []
    partner = shelf.get("partner") or []
    shared = shelf.get("shared") or []
    if home:
        lines = [f"- [{e.get('date','')}] {e.get('moment','')}" for e in home[-limit_each:]]
        parts.append(
            "HOME (the human of this house. Not your memories. Do not claim them as yours.)\n"
            + "\n".join(lines)
        )
    if partner:
        lines = [f"- [{e.get('date','')}] {e.get('moment','')}" for e in partner[-limit_each:]]
        parts.append("PARTNER (your own kept moments)\n" + "\n".join(lines))
    if shared:
        lines = [f"- [{e.get('date','')}] {e.get('moment','')}" for e in shared[-limit_each:]]
        parts.append("SHARED (both of you)\n" + "\n".join(lines))
    return "\n\n".join(parts)
