"""WebSocket endpoint for real-time message sync."""

import asyncio
import json

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.database import SessionLocal
from app.helpers import load_json_field
from app.routers.messages import (
    broadcast_expression,
    broadcast_message,
    finalize_partner_reply,
    message_to_dict,
    save_memories_to_home,
)
from app.auth import get_user_from_token, get_user_home
from app.chat_handler import generate_partner_reply
from app.models import Message
from app.ws_manager import ws_manager

router = APIRouter(tags=["websocket"])


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(default=None)):
    db = SessionLocal()
    try:
        user = get_user_from_token(token, db) if token else None
    finally:
        db.close()

    if not user:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await ws_manager.connect(websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue

            if data.get("type") == "ping":
                await ws_manager.send_personal_message(websocket, {"type": "pong"})
                continue

            if data.get("type") == "open_twin_workshop":
                await ws_manager.broadcast(
                    {
                        "type": "open_twin_workshop",
                        "from": data.get("from") or "client",
                        "user": user.username,
                    }
                )
                continue

            if data.get("type") != "send_message":
                continue

            content = (data.get("content") or "").strip()
            device = data.get("device") or "web"
            if not content:
                continue

            db = SessionLocal()
            try:
                home = get_user_home(user, db)
                sleep_state = load_json_field(home.sleep_json, {"isSleeping": False})

                user_msg = Message(
                    home_id=home.id,
                    speaker="human",
                    sender_name=user.username,
                    content=content,
                    device=device,
                )
                db.add(user_msg)
                db.commit()
                db.refresh(user_msg)
                user_data = message_to_dict(user_msg)
                await broadcast_message(user_data)

                if sleep_state.get("isSleeping"):
                    pending = sleep_state.get("pendingHumanMessages", [])
                    pending.append(content)
                    sleep_state["pendingHumanMessages"] = pending
                    home.sleep_json = json.dumps(sleep_state)
                    db.commit()
                    continue

                companion = load_json_field(home.companion_json, {"name": "Partner", "story": ""})

                ai_result = await generate_partner_reply(home, db)
                raw_content = ai_result["content"]
                # WebSocket chat used to skip the face entirely — markers showed
                # up in chat and the AMOLED never heard about them. Fixed here.
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
                await broadcast_message(message_to_dict(ie_msg))
                await broadcast_expression(expression)
            finally:
                db.close()

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        print(f"WebSocket error: {e}")
        ws_manager.disconnect(websocket)