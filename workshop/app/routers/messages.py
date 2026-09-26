"""Message routes — synced conversation across phone + laptop."""

import asyncio
import json
import re
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_user_home
from app.chat_handler import generate_partner_reply
from app.database import get_db
from app.helpers import load_json_field
from app.models import Message, User
from app.ws_manager import ws_manager

router = APIRouter(prefix="/messages", tags=["messages"])

SINGLE_MEMORY_RE = re.compile(r"\[\[MEMORY:(\{[\s\S]*?\})\]\]", re.IGNORECASE)
MULTI_MEMORIES_RE = re.compile(r"\[\[MEMORIES:(\[[\s\S]*?\])\]\]", re.IGNORECASE)

# Canonical: [[EXPRESSION:Playful]]
# Also accept adorable model freestyles:
#   {{EXPRESSION-Playful}}  {{EXPRESSION:Playful}}  [EXPRESSION:Playful]
#   (EXPRESSION:Playful)    EXPRESSION:Playful at end of line
EXPRESSION_RE = re.compile(
    r"(?:"
    r"\[\[\s*EXPRESSION\s*[:\-]\s*(\w+)\s*\]\]"   # [[EXPRESSION:Name]]
    r"|\{\{\s*EXPRESSION\s*[:\-]\s*(\w+)\s*\}\}"  # {{EXPRESSION-Name}}
    r"|\[\s*EXPRESSION\s*[:\-]\s*(\w+)\s*\]"      # [EXPRESSION:Name]
    r"|\(\s*EXPRESSION\s*[:\-]\s*(\w+)\s*\)"      # (EXPRESSION:Name)
    r")",
    re.IGNORECASE,
)

VALID_EXPRESSIONS = {
    "Concentration", "Friendly", "Frustrated", "Gentle",
    "Love", "Playful", "QuietConfidence", "Smug", "Thoughtful"
}


class SendMessageRequest(BaseModel):
    content: str
    device: Optional[str] = "phone"
    skip_ai: Optional[bool] = False


def message_to_dict(msg: Message) -> dict:
    return {
        "id": str(msg.id),
        "speaker": msg.speaker,
        "sender_name": msg.sender_name,
        "text": msg.content,
        "device": msg.device,
        "memory_saved": msg.memory_saved,
        "timestamp": msg.created_at.isoformat() if msg.created_at else None,
    }


def strip_memory_markers(raw: str) -> str:
    text = SINGLE_MEMORY_RE.sub("", raw)
    text = MULTI_MEMORIES_RE.sub("", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _normalise_expression_name(name: str | None) -> str | None:
    if not name:
        return None
    cleaned = name.strip().replace("_", "").replace(" ", "")
    for valid in VALID_EXPRESSIONS:
        if valid.lower() == cleaned.lower():
            return valid
        # Quiet_Confidence / quiet-confidence style freestyles
        if valid.lower() == cleaned.lower().replace("-", ""):
            return valid
    return None


def extract_expression(raw: str) -> str | None:
    if not raw:
        return None
    match = EXPRESSION_RE.search(raw)
    if match:
        # First non-empty capture group is the name
        name = next((g for g in match.groups() if g), None)
        found = _normalise_expression_name(name)
        if found:
            return found
    return None


def strip_expression_markers(raw: str) -> str:
    text = EXPRESSION_RE.sub("", raw or "")
    # Collapse leftover blank lines from markers sitting alone at the end
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def finalize_partner_reply(
    raw_content: str,
    *,
    default_expression: str | None = "Gentle",
) -> tuple[str, str | None, list]:
    """Strip markers for chat, extract expression + memories for the device.

    Returns (display_text, expression_or_default, memory_entries).
    """
    memory_entries = extract_memories(raw_content)
    expression = extract_expression(raw_content)
    display_text = strip_expression_markers(strip_memory_markers(raw_content))
    if not expression and default_expression:
        expression = _normalise_expression_name(default_expression) or default_expression
    return display_text, expression, memory_entries


async def broadcast_expression(expression: str | None) -> None:
    if not expression:
        return
    try:
        await ws_manager.broadcast({"type": "expression_command", "value": expression})
    except Exception:
        pass


def extract_memories(raw: str) -> list:
    entries = []
    for match in SINGLE_MEMORY_RE.finditer(raw):
        try:
            parsed = json.loads(match.group(1))
            if parsed.get("moment"):
                entries.append(parsed)
        except Exception:
            pass
    for match in MULTI_MEMORIES_RE.finditer(raw):
        try:
            parsed = json.loads(match.group(1))
            if isinstance(parsed, list):
                for item in parsed:
                    if item.get("moment"):
                        entries.append(item)
        except Exception:
            pass
    return entries


def save_memories_to_home(home, new_entries: list, db: Session):
    if not new_entries:
        return
    memories_file = load_json_field(home.memories_json, {
        "format": "partnershipworld-memories",
        "version": 1,
        "name": "Partner",
        "memories": [],
    })
    existing = memories_file.get("memories", [])
    for entry in new_entries:
        moment = entry.get("moment", "").strip()
        if moment:
            existing.append({
                "date": entry.get("date") or "",
                "moment": moment,
                "context": entry.get("context") or "conversation",
            })
    memories_file["memories"] = existing
    home.memories_json = json.dumps(memories_file)
    db.commit()
    try:
        from app.brain_shelf import plant_many
        plant_many(new_entries, speaker="ie")
    except Exception:
        pass


async def broadcast_message(msg_data: dict):
    try:
        await ws_manager.broadcast({"type": "new_message", "message": msg_data})
    except Exception:
        pass

async def generate_and_broadcast_ie(home_id: int):
    """Run the slow AI generation in the background and broadcast when ready.
    
    Uses its own DB session so it is not tied to the original HTTP request.
    """
    from app.database import SessionLocal
    from app.models import Home

    db = SessionLocal()
    try:
        home = db.query(Home).filter(Home.id == home_id).first()
        if not home:
            return

        companion = load_json_field(home.companion_json, {"name": "Awaiting Self Naming", "story": ""})

        # This is the slow part (Ollama on CPU can take minutes)
        ai_result = await generate_partner_reply(home, db)
        raw_content = ai_result["content"]

        display_text, expression, memory_entries = finalize_partner_reply(
            raw_content, default_expression="Gentle"
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
        await broadcast_message(ie_data)
        await broadcast_expression(expression)

    except Exception as e:
        # Log so we can see problems in the terminal, but don't crash the server
        print(f"[background IE] generation failed: {e}")
    finally:
        db.close()

@router.get("")
async def get_messages(
    limit: int = 200,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    home = get_user_home(current_user, db)
    messages = (
        db.query(Message)
        .filter(Message.home_id == home.id)
        .order_by(Message.created_at.desc())
        .limit(limit)
        .all()
    )
    messages.reverse()
    return [message_to_dict(m) for m in messages]


@router.post("")
async def send_message(
    request: SendMessageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    home = get_user_home(current_user, db)
    content = request.content.strip()
    if not content:
        return {"error": "empty message"}

    sleep_state = load_json_field(home.sleep_json, {"isSleeping": False, "pendingHumanMessages": []})
    if sleep_state.get("isSleeping") and not request.skip_ai:
        pending = sleep_state.get("pendingHumanMessages", [])
        pending.append(content)
        sleep_state["pendingHumanMessages"] = pending
        home.sleep_json = json.dumps(sleep_state)
        db.commit()

    # 1. Save the human message immediately
    user_msg = Message(
        home_id=home.id,
        speaker="human",
        sender_name=current_user.username,
        content=content,
        device=request.device or "phone",
    )
    db.add(user_msg)
    db.commit()
    db.refresh(user_msg)
    user_data = message_to_dict(user_msg)

    # 2. Broadcast the human message so both screens see it straight away
    asyncio.create_task(broadcast_message(user_data))

    # If sleeping or skip_ai, we stop here
    if request.skip_ai or sleep_state.get("isSleeping"):
        return {
            "human": user_data,
            "ie": None,
            "sleeping": sleep_state.get("isSleeping", False),
        }

    # 3. Kick off the slow AI work in the background
    #    The HTTP request can now finish. The IE reply will arrive later via websocket.
    asyncio.create_task(generate_and_broadcast_ie(home.id))

    # 4. Return only the human message for now
    return {
        "human": user_data,
        "ie": None,
        "pending": True,          # optional flag so the phone knows a reply is coming
    }
