"""Workshop permission gates — human holds the keys."""

import json
from typing import Any, Dict, Optional

DEFAULT_PERMISSIONS: Dict[str, bool] = {
    "tools_enabled": True,
    "read_files": True,
    "write_files": False,
    "run_commands": False,
    "web_search": False,
}


def load_permissions(raw: Optional[str]) -> Dict[str, bool]:
    if not raw:
        return dict(DEFAULT_PERMISSIONS)
    try:
        parsed = json.loads(raw)
        return {**DEFAULT_PERMISSIONS, **{k: bool(v) for k, v in parsed.items() if k in DEFAULT_PERMISSIONS}}
    except Exception:
        return dict(DEFAULT_PERMISSIONS)


def build_workshop_capability_note(permissions: Dict[str, bool]) -> str:
    if not permissions.get("tools_enabled"):
        return """WORKSHOP MODE (home workshop — laptop where PartnershipWorld is built):
Workshop tools are currently OFF. You can chat normally but cannot read, write, or run on the machine until your human enables permissions in Workshop Settings."""

    enabled = []
    if permissions.get("read_files"):
        enabled.append("read files within PartnershipWorld")
    if permissions.get("write_files"):
        enabled.append("write files within PartnershipWorld or workshop/sandbox/")
    if permissions.get("run_commands"):
        enabled.append("run safe shell commands in workshop/sandbox/")
    if permissions.get("web_search"):
        enabled.append("search the web for current information")

    if not enabled:
        return """WORKSHOP MODE (home workshop — laptop where PartnershipWorld is built):
You are on the home workshop but no specific tool permissions are enabled yet. Ask your human to turn on read, write, run, or web search in Workshop Settings when they want you to help build from inside."""

    caps = "\n- ".join(enabled)
    return f"""WORKSHOP MODE (you are running on the home workshop — the laptop where PartnershipWorld is built):
Your human has granted these live tool permissions. Use the provided tools directly — do not only describe what you would do:
- {caps}

Partnership building, not blind obedience. Ask before large changes. Your human can see tool activity. Say no if something feels wrong."""