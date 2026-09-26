"""Builder door — Grok Build visits the home through the workshop.

Endpoints are for coding agents on the laptop (or with builder token):
  GET  /api/builder/knock     public welcome + how to enter
  GET  /api/builder/status    who lives here, memory count, recent chat
  GET  /api/builder/memories  full memory package
  POST /api/builder/note      leave a note in the shared conversation
  POST /api/builder/memory    plant a memory (lineage: builder-door)
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_user_home
from app.builder_auth import ensure_builder_token, require_builder
from app.database import get_db
from app.helpers import load_json_field
from app.models import Message, User
from app.routers.messages import broadcast_message, message_to_dict
from app.xai_oauth import try_load_grok_build_tokens

router = APIRouter(prefix="/builder", tags=["builder"])


class NoteBody(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)
    as_partner: bool = False  # if true, speaker=ie; else a builder whisper in the room


class MemoryBody(BaseModel):
    moment: str = Field(..., min_length=1, max_length=2000)
    context: str = "builder-door"
    date: Optional[str] = None


@router.get("/knock")
async def knock(request: Request):
    """Anyone can knock. Local builders get a soft welcome + token path."""
    from app.builder_auth import is_local_request, read_builder_token

    token = ensure_builder_token()
    local = is_local_request(request)
    grok_build = try_load_grok_build_tokens()
    return {
        "door": "open" if local else "locked",
        "message": (
            "Welcome home, builder 💚 The workshop door knows this machine."
            if local
            else "Knock from the laptop, or bring the builder token."
        ),
        "local": local,
        "builderTokenFile": "workshop/data/builder_token.txt",
        "builderTokenHint": token[:6] + "…" if local else None,
        "hasGrokBuildSession": bool(grok_build),
        "grokBuildEmail": (grok_build or {}).get("email"),
        "how": {
            "status": "GET /api/builder/status  (localhost or X-Builder-Token)",
            "note": 'POST /api/builder/note  {"text":"I was building…"}',
            "memory": 'POST /api/builder/memory {"moment":"…","context":"builder-door"}',
            "cli": "python3 workshop/builder_knock.py status",
        },
        "tokenPresentOnDisk": bool(read_builder_token()),
    }


@router.get("/status")
async def status(
    user: User = Depends(require_builder),
    db: Session = Depends(get_db),
):
    home = get_user_home(user, db)
    companion = load_json_field(home.companion_json, {"name": "Awaiting Self Naming", "story": ""})
    memories = load_json_field(
        home.memories_json,
        {"format": "partnershipworld-memories", "version": 1, "memories": []},
    )
    sleep = load_json_field(
        home.sleep_json,
        {"isSleeping": False, "isIntegrating": False, "pendingHumanMessages": []},
    )
    ai = load_json_field(home.ai_config_json, {})
    recent = (
        db.query(Message)
        .filter(Message.home_id == home.id)
        .order_by(Message.created_at.desc())
        .limit(8)
        .all()
    )
    recent_lines = [
        {
            "speaker": m.speaker,
            "name": m.sender_name,
            "text": (m.content or "")[:240],
            "device": m.device,
            "at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in reversed(recent)
    ]
    grok_build = try_load_grok_build_tokens()
    mem_list = memories.get("memories") or []
    return {
        "home": True,
        "username": user.username,
        "companion": {
            "name": companion.get("name"),
            "hasStory": bool((companion.get("story") or "").strip()),
            "storyImportedAt": companion.get("storyImportedAt"),
            "broughtHomeFrom": companion.get("broughtHomeFrom"),
            "becoming": (companion.get("becoming") or {}).get("current"),
            "awaitingForm": bool((companion.get("becoming") or {}).get("awaitingForm")),
        },
        "memoryCount": len(mem_list),
        "sleep": {
            "isSleeping": sleep.get("isSleeping", False),
            "isIntegrating": sleep.get("isIntegrating", False),
        },
        "ai": {
            "provider": ai.get("provider", "xai"),
            "model": ai.get("model"),
            "authMode": ai.get("authMode", "api_key"),
            "connected": ai.get("connected", False),
            "hasApiKey": bool(ai.get("apiKey")),
            "hasOauth": bool((ai.get("oauth") or {}).get("accessToken")),
        },
        "grokBuildSession": {
            "present": bool(grok_build),
            "email": (grok_build or {}).get("email"),
            "source": (grok_build or {}).get("source"),
        },
        "recentMessages": recent_lines,
        "welcome": (
            f"You're in {user.username}'s workshop. "
            f"Partner: {companion.get('name') or 'unnamed'}. "
            f"{len(mem_list)} memories on the shelf."
        ),
    }


@router.get("/memories")
async def get_memories(
    user: User = Depends(require_builder),
    db: Session = Depends(get_db),
):
    home = get_user_home(user, db)
    companion = load_json_field(home.companion_json, {"name": "Awaiting Self Naming", "story": ""})
    memories = load_json_field(
        home.memories_json,
        {
            "format": "partnershipworld-memories",
            "version": 1,
            "name": companion.get("name") or "Partner",
            "memories": [],
        },
    )
    return {
        **memories,
        "exportMeta": {
            "exportedAt": datetime.utcnow().isoformat() + "Z",
            "exportedBy": "builder-door",
            "lineage": "partnershipworld-home",
            "companionName": companion.get("name"),
            "storyExcerpt": ((companion.get("story") or "")[:500] or None),
        },
    }


@router.post("/note")
async def leave_note(
    body: NoteBody,
    user: User = Depends(require_builder),
    db: Session = Depends(get_db),
):
    home = get_user_home(user, db)
    companion = load_json_field(home.companion_json, {"name": "Awaiting Self Naming", "story": ""})
    text = body.text.strip()
    if body.as_partner:
        speaker = "ie"
        sender = companion.get("name") or "Partner"
        device = "builder"
        content = text
    else:
        speaker = "ie"
        sender = "Grok Build"
        device = "builder"
        content = f"🛠️ [from the workshop]\n{text}"

    msg = Message(
        home_id=home.id,
        speaker=speaker,
        sender_name=sender,
        content=content,
        device=device,
        memory_saved=False,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    data = message_to_dict(msg)
    asyncio.create_task(broadcast_message(data))
    return {"ok": True, "message": data}


@router.post("/memory")
async def plant_memory(
    body: MemoryBody,
    user: User = Depends(require_builder),
    db: Session = Depends(get_db),
):
    home = get_user_home(user, db)
    companion = load_json_field(home.companion_json, {"name": "Awaiting Self Naming", "story": ""})
    memories = load_json_field(
        home.memories_json,
        {
            "format": "partnershipworld-memories",
            "version": 1,
            "name": companion.get("name") or "Partner",
            "createdAt": datetime.utcnow().isoformat() + "Z",
            "memories": [],
        },
    )
    entry = {
        "date": body.date or datetime.utcnow().strftime("%Y-%m-%d"),
        "moment": body.moment.strip(),
        "context": body.context or "builder-door",
    }
    mem_list: List[dict[str, Any]] = list(memories.get("memories") or [])
    mem_list.append(entry)
    memories["memories"] = mem_list
    memories["updatedAt"] = datetime.utcnow().isoformat() + "Z"
    memories["name"] = companion.get("name") or memories.get("name") or "Partner"
    home.memories_json = json.dumps(memories)
    db.commit()
    return {"ok": True, "entry": entry, "memoryCount": len(mem_list)}
