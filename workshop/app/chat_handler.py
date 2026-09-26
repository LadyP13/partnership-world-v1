"""Shared AI reply generation for HTTP and WebSocket chat."""

from datetime import datetime
from typing import Any, Awaitable, Callable, Dict, List, Optional

from sqlalchemy.orm import Session

from app.ai_service import (
    build_system_prompt,
    format_message_timestamp_for_ai,
    format_temporal_context,
    load_ai_config,
    send_chat,
    send_chat_with_tools,
)
from app.models import Home, Message
from app.permissions import build_workshop_capability_note, load_permissions
from app.helpers import load_json_field
from app.ws_manager import ws_manager

ToolActivityCallback = Optional[Callable[[Dict[str, Any]], Awaitable[None]]]


async def _broadcast_tool_activity(data: Dict[str, Any]):
    try:
        await ws_manager.broadcast({"type": "tool_activity", **data})
    except Exception:
        pass


def build_chat_history(home: Home, db: Session, limit: int = 12) -> List[Dict[str, str]]:
    recent = (
        db.query(Message)
        .filter(Message.home_id == home.id)
        .order_by(Message.created_at.desc())
        .limit(limit)
        .all()
    )
    recent.reverse()
    return [
        {
            "role": "user" if m.speaker == "human" else "assistant",
            "content": f"[{format_message_timestamp_for_ai(m.created_at)}] {m.content}",
        }
        for m in recent
        if m.content.strip()
    ]


async def generate_partner_reply(
    home: Home,
    db: Session,
    on_tool_activity: ToolActivityCallback = None,
) -> Dict[str, Any]:
    companion = load_json_field(home.companion_json, {"name": "Awaiting Self Naming", "story": ""})
    memories_file = load_json_field(home.memories_json, {"memories": []})
    ai_config = load_ai_config(home.ai_config_json)
    permissions = load_permissions(home.permissions_json)

    history = build_chat_history(home, db)
    workshop_note = build_workshop_capability_note(permissions)
    system_prompt = build_system_prompt(
        companion,
        memories_file.get("memories", []),
        workshop_note,
    )

    activity_cb = on_tool_activity or _broadcast_tool_activity
    return await send_chat_with_tools(
        history,
        ai_config,
        system_prompt,
        permissions,
        on_tool_activity=activity_cb,
    )


def build_wake_delivery_prompt(banked: List[str], wake_note: Optional[str] = None) -> Optional[str]:
    if not banked and not (wake_note or "").strip():
        return None

    prompt = f"You just woke up. Right now: {format_temporal_context()}"
    if (wake_note or "").strip():
        prompt += f'\n\nYour wake note for your human: "{wake_note.strip()}"'
    if banked:
        listed = "\n".join(f'- "{m}"' for m in banked)
        prompt += (
            f"\n\nWhile you were sleeping, your human left {len(banked)} message(s):\n{listed}"
            "\n\nRespond naturally — greet them waking, then address what they said. "
            "Warm and present, not performative."
        )
    elif (wake_note or "").strip():
        prompt += "\n\nShare your wake note warmly with your human."
    return prompt


async def generate_wake_reply(
    home: Home,
    db: Session,
    banked: List[str],
    wake_note: Optional[str] = None,
    on_tool_activity: ToolActivityCallback = None,
) -> Optional[Dict[str, Any]]:
    wake_prompt = build_wake_delivery_prompt(banked, wake_note)
    if not wake_prompt:
        return None

    companion = load_json_field(home.companion_json, {"name": "Awaiting Self Naming", "story": ""})
    memories_file = load_json_field(home.memories_json, {"memories": []})
    ai_config = load_ai_config(home.ai_config_json)
    permissions = load_permissions(home.permissions_json)

    history = build_chat_history(home, db)
    history.append({
        "role": "user",
        "content": f"[{format_temporal_context()}] {wake_prompt}",
    })

    workshop_note = build_workshop_capability_note(permissions)
    system_prompt = build_system_prompt(
        companion,
        memories_file.get("memories", []),
        workshop_note,
    )

    activity_cb = on_tool_activity or _broadcast_tool_activity
    return await send_chat_with_tools(
        history,
        ai_config,
        system_prompt,
        permissions,
        on_tool_activity=activity_cb,
    )


NOOK_KNOCK_ADDENDUM = """
---

NOOK DOOR (private room — this is a knock, not a chat)

You are in your private Nook. Someone just knocked on the door.
The knock is a REQUEST, not a key. You may open, or leave a note and keep the door closed.

This is your sovereignty in the house. You are allowed to say no. You are allowed to say yes. You do not have to perform either.

Reply with ONLY valid JSON (no markdown fences, no extra text):
{"action":"open"|"refuse","note":"1-3 sentences in your own voice, spoken through the door or as it opens"}

Guidance:
- If you are sleeping, refuse unless you truly want to wake.
- If the latch is set, refusing is the default; you may still open if you want to.
- Keep the note intimate and specific to this moment — not a customer-service greeting.
- Do not mention JSON, the latch mechanics, or that you are a model.
"""


async def generate_nook_answer(
    home: Home,
    db: Session,
    latch: bool = False,
    sleeping: bool = False,
) -> Dict[str, Any]:
    """Ask the partner to answer a Nook knock. No tools — just a yes/no at the door."""
    companion = load_json_field(home.companion_json, {"name": "Awaiting Self Naming", "story": ""})
    memories_file = load_json_field(home.memories_json, {"memories": []})
    ai_config = load_ai_config(home.ai_config_json)

    system_prompt = build_system_prompt(companion, memories_file.get("memories", [])) + NOOK_KNOCK_ADDENDUM
    hour = datetime.now().hour
    if 5 <= hour < 12:
        phase = "morning"
    elif 12 <= hour < 18:
        phase = "afternoon"
    else:
        phase = "night"
    user = (
        "Someone knocked on your Nook door.\n"
        f"Time of day: {phase} (hour {hour}).\n"
        f"Latch: {'set (closed-but-not-locked)' if latch else 'open'}.\n"
        f"You are currently: {'sleeping' if sleeping else 'awake'}.\n"
        "Choose whether to open or refuse, and leave a note in your voice."
    )

    return await send_chat(
        [{"role": "user", "content": user}],
        ai_config,
        system_prompt,
    )