"""Shared helpers."""

import json
from typing import Any, Optional


def load_json_field(raw: Optional[str], default: Any):
    if not raw:
        return default
    try:
        return json.loads(raw)
    except Exception:
        return default