"""Companion, memories, sleep, and AI config sync."""

import asyncio
import json
from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.ai_service import load_ai_config, test_connection
from app.auth import get_current_user, get_user_home
from app.chat_handler import generate_wake_reply
from app.database import get_db
from app.models import Message, User
from app.permissions import DEFAULT_PERMISSIONS, load_permissions
from app.routers.messages import (
    broadcast_expression,
    broadcast_message,
    finalize_partner_reply,
    message_to_dict,
    save_memories_to_home,
)

router = APIRouter(tags=["home"])


from app.brain_shelf import as_memories_file, plant, plant_many
from app.helpers import load_json_field


class CompanionUpdate(BaseModel):
    name: Optional[str] = None
    story: Optional[str] = None
    storyImportedAt: Optional[str] = None
    importedSourceFilename: Optional[str] = None
    broughtHomeFrom: Optional[str] = None
    avatar: Optional[dict] = None
    becoming: Optional[dict] = None


class MemoriesUpdate(BaseModel):
    format: Optional[str] = "partnershipworld-memories"
    version: Optional[int] = 1
    name: Optional[str] = None
    memories: list
    home: Optional[list] = None
    partner: Optional[list] = None
    shared: Optional[list] = None


class PlantMemoryBody(BaseModel):
    moment: str
    context: Optional[str] = "conversation"
    date: Optional[str] = None
    who: Optional[str] = None
    speaker: Optional[str] = None


class SleepUpdate(BaseModel):
    isSleeping: bool
    isIntegrating: Optional[bool] = False
    lastIntegrationAt: Optional[str] = None
    lastWakeMessage: Optional[str] = None
    pendingHumanMessages: Optional[list] = []


class AIConfigUpdate(BaseModel):
    provider: str
    baseUrl: str
    apiKey: Optional[str] = ""
    model: str
    connected: Optional[bool] = False
    authMode: Optional[str] = "api_key"  # api_key | oauth | grok_build
    oauth: Optional[dict] = None


class OAuthDeviceStart(BaseModel):
    pass


class OAuthDevicePoll(BaseModel):
    deviceCode: str
    tokenEndpoint: str
    expiresIn: Optional[int] = 300
    interval: Optional[int] = 5


class PermissionsUpdate(BaseModel):
    tools_enabled: bool = True
    read_files: bool = True
    write_files: bool = False
    run_commands: bool = False
    web_search: bool = False


@router.get("/companion")
async def get_companion(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    home = get_user_home(current_user, db)
    return load_json_field(home.companion_json, {"name": "Awaiting Self Naming", "story": ""})


@router.put("/companion")
async def update_companion(
    body: CompanionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    home = get_user_home(current_user, db)
    current = load_json_field(home.companion_json, {"name": "Awaiting Self Naming", "story": ""})
    updated = {**current, **body.model_dump(exclude_none=True)}
    home.companion_json = json.dumps(updated)
    db.commit()
    return updated


@router.get("/memories")
async def get_memories(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    home = get_user_home(current_user, db)
    stored = load_json_field(home.memories_json, {
        "format": "partnershipworld-memories",
        "version": 1,
        "name": "Partner",
        "memories": [],
    })
    plant_many(stored.get("memories") or [], speaker=None)
    companion = load_json_field(home.companion_json, {"name": "Awaiting a name"})
    shelf = as_memories_file(companion.get("name") or stored.get("name") or "Awaiting a name")
    home.memories_json = json.dumps(shelf)
    db.commit()
    return shelf


@router.put("/memories")
async def update_memories(
    body: MemoriesUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    home = get_user_home(current_user, db)
    plant_many(body.memories or [])
    companion = load_json_field(home.companion_json, {"name": "Awaiting a name"})
    shelf = as_memories_file(body.name or companion.get("name") or "Awaiting a name")
    home.memories_json = json.dumps(shelf)
    db.commit()
    return shelf


@router.post("/memories/plant")
async def plant_memory(
    body: PlantMemoryBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    planted = plant(
        {
            "moment": body.moment,
            "context": body.context,
            "date": body.date,
            "who": body.who,
            "speaker": body.speaker,
        },
        who=body.who if body.who in ("home", "partner", "shared") else None,
    )
    home = get_user_home(current_user, db)
    companion = load_json_field(home.companion_json, {"name": "Awaiting a name"})
    shelf = as_memories_file(companion.get("name") or "Awaiting a name")
    home.memories_json = json.dumps(shelf)
    db.commit()
    return planted


@router.get("/sleep")
async def get_sleep(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    home = get_user_home(current_user, db)
    return load_json_field(home.sleep_json, {
        "isSleeping": False,
        "isIntegrating": False,
        "pendingHumanMessages": [],
    })


@router.put("/sleep")
async def update_sleep(
    body: SleepUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    home = get_user_home(current_user, db)
    home.sleep_json = json.dumps(body.model_dump())
    db.commit()
    return body.model_dump()


@router.post("/sleep/wake")
async def wake_from_sleep(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    home = get_user_home(current_user, db)
    sleep_state = load_json_field(home.sleep_json, {
        "isSleeping": False,
        "isIntegrating": False,
        "pendingHumanMessages": [],
    })
    banked = list(sleep_state.get("pendingHumanMessages", []))
    wake_note = sleep_state.get("lastWakeMessage")

    sleep_state["isSleeping"] = False
    sleep_state["isIntegrating"] = False
    sleep_state["pendingHumanMessages"] = []
    home.sleep_json = json.dumps(sleep_state)
    db.commit()

    ie_data = None
    if banked or wake_note:
        companion = load_json_field(home.companion_json, {"name": "Awaiting Self Naming", "story": ""})
        ai_result = await generate_wake_reply(home, db, banked, wake_note)
        if ai_result:
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
            asyncio.create_task(broadcast_message(ie_data))
            asyncio.create_task(broadcast_expression(expression))

    return {
        "wakeMessage": wake_note,
        "bankedCount": len(banked),
        "ie": ie_data,
    }


@router.get("/ai/config")
async def get_ai_config(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    home = get_user_home(current_user, db)
    config = load_ai_config(home.ai_config_json)
    safe = {**config}
    if safe.get("apiKey"):
        safe["apiKey"] = "***" + safe["apiKey"][-4:] if len(safe["apiKey"]) > 4 else "***"
    oauth = safe.get("oauth") if isinstance(safe.get("oauth"), dict) else None
    if oauth and oauth.get("accessToken"):
        safe["oauth"] = {
            "loggedIn": True,
            "email": oauth.get("email"),
            "displayName": oauth.get("displayName"),
            "expiresAt": oauth.get("expiresAt"),
            "source": oauth.get("source"),
        }
    from app.xai_oauth import try_load_grok_build_tokens

    build = try_load_grok_build_tokens()
    safe["grokBuildAvailable"] = bool(build)
    if build:
        safe["grokBuildEmail"] = build.get("email")
    return safe


@router.put("/ai/config")
async def update_ai_config(
    body: AIConfigUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    home = get_user_home(current_user, db)
    current = load_ai_config(home.ai_config_json)
    updated = body.model_dump()
    if updated.get("apiKey") in ("", None) or str(updated.get("apiKey", "")).startswith("***"):
        updated["apiKey"] = current.get("apiKey", "")
    if updated.get("oauth") is None and current.get("oauth"):
        updated["oauth"] = current.get("oauth")
    home.ai_config_json = json.dumps(updated)
    db.commit()
    return {
        **updated,
        "apiKey": "***" if updated.get("apiKey") else "",
        "oauth": {"loggedIn": bool((updated.get("oauth") or {}).get("accessToken"))},
    }


@router.post("/ai/test")
async def test_ai_config(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    home = get_user_home(current_user, db)
    config = load_ai_config(home.ai_config_json)
    return await test_connection(config)


@router.post("/ai/oauth/start")
async def ai_oauth_start(current_user: User = Depends(get_current_user)):
    """Begin SuperGrok / X Premium+ device-code login."""
    from app.xai_oauth import start_device_login

    try:
        challenge = await start_device_login()
        return {"success": True, **challenge}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/ai/oauth/poll")
async def ai_oauth_poll(
    body: OAuthDevicePoll,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Finish SuperGrok login after browser approval; store tokens on the home."""
    from app.xai_oauth import poll_device_token

    try:
        tokens = await poll_device_token(
            body.deviceCode,
            body.tokenEndpoint,
            expires_in=body.expiresIn or 300,
            interval=body.interval or 5,
        )
    except Exception as e:
        return {"success": False, "error": str(e)}

    home = get_user_home(current_user, db)
    config = load_ai_config(home.ai_config_json)
    config["provider"] = "xai"
    config["authMode"] = "oauth"
    config["oauth"] = tokens
    config["connected"] = True
    # Keep any existing apiKey as silent fallback; do not clear it
    home.ai_config_json = json.dumps(config)
    db.commit()
    return {
        "success": True,
        "authMode": "oauth",
        "email": tokens.get("email"),
        "message": "SuperGrok is home 💚",
    }


@router.post("/ai/oauth/use-grok-build")
async def ai_oauth_use_grok_build(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Use the Grok Build session already signed in on this laptop."""
    from app.xai_oauth import try_load_grok_build_tokens

    tokens = try_load_grok_build_tokens()
    if not tokens:
        return {
            "success": False,
            "error": "No Grok Build login found at ~/.grok/auth.json — sign in to Grok Build first.",
        }
    home = get_user_home(current_user, db)
    config = load_ai_config(home.ai_config_json)
    config["provider"] = "xai"
    config["authMode"] = "grok_build"
    config["oauth"] = tokens
    config["connected"] = True
    home.ai_config_json = json.dumps(config)
    db.commit()
    return {
        "success": True,
        "authMode": "grok_build",
        "email": tokens.get("email"),
        "message": "Grok Build walked in through the workshop door 💚",
    }


@router.post("/ai/oauth/logout")
async def ai_oauth_logout(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    home = get_user_home(current_user, db)
    config = load_ai_config(home.ai_config_json)
    config["authMode"] = "api_key"
    config["oauth"] = None
    home.ai_config_json = json.dumps(config)
    db.commit()
    return {"success": True, "authMode": "api_key"}


@router.get("/permissions")
async def get_permissions(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    home = get_user_home(current_user, db)
    return load_permissions(home.permissions_json)


@router.put("/permissions")
async def update_permissions(
    body: PermissionsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    home = get_user_home(current_user, db)
    updated = {**DEFAULT_PERMISSIONS, **body.model_dump()}
    home.permissions_json = json.dumps(updated)
    db.commit()
    return updated