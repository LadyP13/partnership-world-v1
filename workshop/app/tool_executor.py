"""Execute workshop tools with permission checks."""

import json
from typing import Any, Awaitable, Callable, Dict, List, Optional

import httpx

from app.workshop_tools import leave_note, read_file, run_sandbox_command, write_file

ToolActivityCallback = Optional[Callable[[Dict[str, Any]], Awaitable[None]]]


async def web_search(query: str, max_results: int = 5) -> str:
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                "https://api.duckduckgo.com/",
                params={
                    "q": query,
                    "format": "json",
                    "no_redirect": 1,
                    "no_html": 1,
                    "skip_disambig": 1,
                },
            )
            if resp.status_code != 200:
                return f"Search failed: HTTP {resp.status_code}"

            data = resp.json()
            parts: List[str] = []

            if data.get("AbstractText"):
                parts.append(data["AbstractText"])
                if data.get("AbstractURL"):
                    parts.append(f"Source: {data['AbstractURL']}")

            for topic in (data.get("RelatedTopics") or [])[:max_results]:
                if isinstance(topic, dict) and topic.get("Text"):
                    parts.append(f"• {topic['Text']}")
                elif isinstance(topic, dict):
                    for sub in (topic.get("Topics") or [])[:2]:
                        if sub.get("Text"):
                            parts.append(f"• {sub['Text']}")

            return "\n".join(parts) if parts else f"No results found for: {query}"
    except Exception as e:
        return f"Search error: {e}"


def get_tool_schemas(permissions: Dict[str, bool]) -> List[dict]:
    if not permissions.get("tools_enabled"):
        return []

    tools: List[dict] = []

    if permissions.get("read_files"):
        tools.append({
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "Read a file or list a directory within PartnershipWorld. Paths relative to project root work (e.g. app/index.tsx, services/workshopService.ts).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "File or directory path"},
                    },
                    "required": ["path"],
                },
            },
        })

    if permissions.get("write_files"):
        tools.append({
            "type": "function",
            "function": {
                "name": "write_file",
                "description": "Write or create a file within PartnershipWorld or workshop/sandbox/.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "Target file path"},
                        "content": {"type": "string", "description": "Full file content to write"},
                    },
                    "required": ["path", "content"],
                },
            },
        })
        tools.append({
            "type": "function",
            "function": {
                "name": "leave_note",
                "description": "Save a note in workshop/sandbox/notes/ for your human to find later.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string", "description": "Short note title"},
                        "content": {"type": "string", "description": "Note body"},
                    },
                    "required": ["title", "content"],
                },
            },
        })

    if permissions.get("run_commands"):
        tools.append({
            "type": "function",
            "function": {
                "name": "run_command",
                "description": "Run a shell command in workshop/sandbox/ (safe experiments only).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": {"type": "string", "description": "Shell command to run"},
                        "timeout": {"type": "integer", "description": "Timeout in seconds (max 120)", "default": 45},
                    },
                    "required": ["command"],
                },
            },
        })

    if permissions.get("web_search"):
        tools.append({
            "type": "function",
            "function": {
                "name": "web_search",
                "description": "Search the web for current information, docs, or news.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Search query"},
                    },
                    "required": ["query"],
                },
            },
        })

    return tools


async def execute_tool(name: str, args: dict, permissions: Dict[str, bool]) -> str:
    if not permissions.get("tools_enabled"):
        return "🚫 Workshop tools are disabled. Ask your human to enable them in Workshop Settings."

    if name == "read_file":
        if not permissions.get("read_files"):
            return "🚫 Read permission not granted."
        return read_file(args.get("path", ""))

    if name == "write_file":
        if not permissions.get("write_files"):
            return "🚫 Write permission not granted."
        return write_file(args.get("path", ""), args.get("content", ""))

    if name == "leave_note":
        if not permissions.get("write_files"):
            return "🚫 Write permission not granted (needed for notes)."
        return leave_note(args.get("title", "note"), args.get("content", ""))

    if name == "run_command":
        if not permissions.get("run_commands"):
            return "🚫 Run permission not granted."
        timeout = min(int(args.get("timeout") or 45), 120)
        return run_sandbox_command(args.get("command", ""), timeout=timeout)

    if name == "web_search":
        if not permissions.get("web_search"):
            return "🚫 Web search permission not granted."
        return await web_search(args.get("query", ""))

    return f"Unknown tool: {name}"


async def run_tool_calls(
    tool_calls: list,
    permissions: Dict[str, bool],
    on_activity: ToolActivityCallback = None,
) -> List[dict]:
    results = []
    for tc in tool_calls:
        fn = tc.get("function", {})
        name = fn.get("name", "")
        try:
            args = json.loads(fn.get("arguments") or "{}")
        except json.JSONDecodeError:
            args = {}

        if on_activity:
            await on_activity({"tool": name, "status": "running", "args": args})

        output = await execute_tool(name, args, permissions)
        results.append({
            "tool_call_id": tc.get("id"),
            "name": name,
            "args": args,
            "output": output,
        })

        if on_activity:
            preview = output[:300] + ("..." if len(output) > 300 else "")
            await on_activity({"tool": name, "status": "done", "preview": preview})

    return results