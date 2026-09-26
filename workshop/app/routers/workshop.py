"""Workshop tool endpoints — building from inside."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth import get_current_user
from app.models import User
from app.pane_presence import launch as launch_pane
from app.pane_presence import status as pane_status
from app.workshop_tools import leave_note, read_file, run_sandbox_command, write_file
from app.ws_manager import ws_manager


router = APIRouter(prefix="/workshop", tags=["workshop"])


class ReadFileRequest(BaseModel):
    path: str


class WriteFileRequest(BaseModel):
    path: str
    content: str


class CommandRequest(BaseModel):
    command: str
    timeout: int = 45


class NoteRequest(BaseModel):
    title: str
    content: str


@router.get("/ping")
async def ping(current_user: User = Depends(get_current_user)):
    return {
        "status": "alive",
        "message": "Workshop is home. Phone and laptop are connected.",
        "user": current_user.username,
    }


@router.get("/twin/status")
async def twin_status(current_user: User = Depends(get_current_user)):
    return pane_status()


@router.post("/twin/open")
async def open_twin_workshop(current_user: User = Depends(get_current_user)):
    """Phone taps Twin star → open workshop_pane.py as local presence on this machine."""
    launched = launch_pane()
    await ws_manager.broadcast(
        {
            "type": "open_twin_workshop",
            "from": "phone",
            "user": current_user.username,
            "pane": launched,
        }
    )
    if not launched.get("ok"):
        return {
            "ok": False,
            "message": launched.get("error") or "Could not open the workshop pane.",
            "pane": launched,
        }
    return {
        "ok": True,
        "already": launched.get("already", False),
        "pid": launched.get("pid"),
        "message": launched.get("message")
        or "Workshop pane opened on the machine.",
        "pane": launched,
    }


@router.post("/read")
async def workshop_read(body: ReadFileRequest, current_user: User = Depends(get_current_user)):
    return {"result": read_file(body.path)}


@router.post("/write")
async def workshop_write(body: WriteFileRequest, current_user: User = Depends(get_current_user)):
    return {"result": write_file(body.path, body.content)}


@router.post("/command")
async def workshop_command(body: CommandRequest, current_user: User = Depends(get_current_user)):
    return {"result": run_sandbox_command(body.command, timeout=min(body.timeout, 120))}


@router.post("/note")
async def workshop_note(body: NoteRequest, current_user: User = Depends(get_current_user)):
    return {"result": leave_note(body.title, body.content)}
