"""Nook door — the partner answers a knock from the star map."""

from __future__ import annotations

import json
import re
from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_user_home
from app.chat_handler import generate_nook_answer
from app.database import get_db
from app.helpers import load_json_field
from app.models import User

router = APIRouter(prefix="/nook", tags=["nook"])

SLEEP_NOTE = (
    "I'm sleeping. The door stayed closed on purpose — not because you aren't wanted. "
    "Knock again when I wake, if you still want to."
)


class KnockBody(BaseModel):
    latch: bool = False
    sleeping: bool = False


def _parse_knock_reply(raw: str) -> Optional[dict[str, str]]:
    text = (raw or "").strip()
    if not text or text.startswith("⚠️"):
        return None
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.IGNORECASE)
    if fenced:
        text = fenced.group(1).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        data = json.loads(text[start : end + 1])
    except Exception:
        return None
    action = data.get("action")
    note = (data.get("note") or "").strip()
    if action not in ("open", "refuse") or not note:
        return None
    return {"action": action, "note": note}


@router.post("/knock")
async def answer_knock(
    body: KnockBody,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Ask the partner to answer a knock. Sleeping refuses without waking the model."""
    home = get_user_home(user, db)
    sleep = load_json_field(
        home.sleep_json,
        {"isSleeping": False, "isIntegrating": False, "pendingHumanMessages": []},
    )
    sleeping = body.sleeping or bool(sleep.get("isSleeping"))
    if sleeping:
        return {"ok": True, "action": "refuse", "note": SLEEP_NOTE, "source": "sleeping"}

    ai_result = await generate_nook_answer(home, db, latch=body.latch, sleeping=False)
    content = (ai_result or {}).get("content") or ""
    parsed = _parse_knock_reply(content)
    if not parsed:
        return {"ok": False, "error": "unparsed", "raw": content[:400]}

    ai = load_json_field(home.ai_config_json, {})
    return {
        "ok": True,
        "action": parsed["action"],
        "note": parsed["note"],
        "source": "workshop",
        "provider": ai.get("provider") or "xai",
    }
