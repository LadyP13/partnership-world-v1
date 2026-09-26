"""Device routes — handles the physical ESP32-S3 companion device."""

import asyncio
import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_user_home
from app.chat_handler import generate_partner_reply
from app.database import get_db
from app.helpers import load_json_field
from app.models import Message, User
from app.ws_manager import ws_manager
from app.routers.messages import (
    VALID_EXPRESSIONS,
    broadcast_expression,
    finalize_partner_reply,
    message_to_dict,
    save_memories_to_home,
)

router = APIRouter(prefix="/device", tags=["device"])

# JPEGs live on the laptop; the ESP32 pulls one when an expression fires.
EXPRESSIONS_DIR = Path(__file__).resolve().parent.parent.parent / "static" / "expressions"


async def broadcast_message(msg_data: dict):
    try:
        await ws_manager.broadcast({"type": "new_message", "message": msg_data})
    except Exception:
        pass


@router.post("/ping")
async def device_ping(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Called when the human taps the device — 'I'm thinking of you'."""
    home = get_user_home(current_user, db)
    companion = load_json_field(home.companion_json, {"name": "Awaiting Self Naming", "story": ""})

    sleep_state = load_json_field(home.sleep_json, {"isSleeping": False})
    if sleep_state.get("isSleeping"):
        return {"sleeping": True}

    ping_text = "💚 *tapped the device — thinking of you*"
    human_msg = Message(
        home_id=home.id,
        speaker="human",
        sender_name=current_user.username,
        content=ping_text,
        device="device",
    )
    db.add(human_msg)
    db.commit()
    db.refresh(human_msg)
    human_data = message_to_dict(human_msg)
    asyncio.create_task(broadcast_message(human_data))

    ai_result = await generate_partner_reply(home, db)
    raw_content = ai_result["content"]
    # Device taps are pure affection — default Love if he forgets the marker
    display_text, expression, memory_entries = finalize_partner_reply(
        raw_content, default_expression="Love"
    )

    if memory_entries:
        save_memories_to_home(home, memory_entries, db)

    ie_msg = Message(
        home_id=home.id,
        speaker="ie",
        sender_name=companion.get("name", "Partner"),
        content=display_text,
        device="workshop",
        memory_saved=len(memory_entries) > 0,
    )
    db.add(ie_msg)
    db.commit()
    db.refresh(ie_msg)
    ie_data = message_to_dict(ie_msg)
    asyncio.create_task(broadcast_message(ie_data))
    asyncio.create_task(broadcast_expression(expression))

    return {"expression": expression, "ie": ie_data}


@router.get("/sleep-state")
async def get_sleep_state(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Device polls this to reflect sleep state on screen."""
    home = get_user_home(current_user, db)
    sleep_state = load_json_field(home.sleep_json, {"isSleeping": False, "isIntegrating": False})
    return {
        "isSleeping": sleep_state.get("isSleeping", False),
        "isDreaming": sleep_state.get("isIntegrating", False),
    }


def _resolve_expression_file(name: str) -> Path | None:
    """Map Friendly / friendly / QuietConfidence → static JPEG path."""
    if not name:
        return None
    cleaned = name.strip().replace("_", "").replace(" ", "").replace("-", "")
    canonical = None
    for valid in VALID_EXPRESSIONS:
        if valid.lower() == cleaned.lower() or valid.lower() == name.strip().lower():
            canonical = valid
            break
    if not canonical:
        return None
    path = EXPRESSIONS_DIR / f"{canonical}.jpg"
    return path if path.is_file() else None


@router.get("/expressions")
async def list_expressions():
    """Catalog of faces the device (or phone) can pull from the workshop."""
    available = sorted(p.stem for p in EXPRESSIONS_DIR.glob("*.jpg")) if EXPRESSIONS_DIR.is_dir() else []
    return {
        "expressions": available,
        "url_template": "/api/device/expressions/{name}.jpg",
        "static_template": "/static/expressions/{name}.jpg",
    }


@router.get("/expressions/{name}.jpg")
async def get_expression_image(name: str):
    """Serve one face JPEG — no auth so the ESP32 can fetch with a simple GET.

    Local-network only by design (workshop binds to LAN). Swap faces by
    dropping new 368×448 JPEGs into workshop/static/expressions/.
    """
    path = _resolve_expression_file(name)
    if not path:
        raise HTTPException(status_code=404, detail=f"Unknown expression: {name}")
    return FileResponse(
        path,
        media_type="image/jpeg",
        filename=path.name,
        headers={"Cache-Control": "public, max-age=3600"},
    )
