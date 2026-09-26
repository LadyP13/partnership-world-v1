"""Local builder door — Grok Build knocks without retyping the home password.

On first use we write a token under workshop/data/builder_token.txt.
Requests from localhost, or with a matching X-Builder-Token header, may enter.
"""

from __future__ import annotations

import secrets
from pathlib import Path
from typing import Optional

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User

DATA_DIR = Path(__file__).parent.parent / "data"
TOKEN_PATH = DATA_DIR / "builder_token.txt"


def ensure_builder_token() -> str:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if TOKEN_PATH.exists():
        token = TOKEN_PATH.read_text().strip()
        if token:
            return token
    token = secrets.token_urlsafe(32)
    TOKEN_PATH.write_text(token + "\n")
    try:
        TOKEN_PATH.chmod(0o600)
    except OSError:
        pass
    return token


def read_builder_token() -> Optional[str]:
    if not TOKEN_PATH.exists():
        return None
    token = TOKEN_PATH.read_text().strip()
    return token or None


def is_local_request(request: Request) -> bool:
    client = request.client.host if request.client else ""
    return client in ("127.0.0.1", "::1", "localhost")


def get_primary_user(db: Session) -> Optional[User]:
    return db.query(User).order_by(User.id.asc()).first()


def require_builder(
    request: Request,
    db: Session = Depends(get_db),
    x_builder_token: Optional[str] = Header(default=None, alias="X-Builder-Token"),
) -> User:
    """Allow Grok Build when local or when X-Builder-Token matches."""
    expected = read_builder_token() or ensure_builder_token()
    local = is_local_request(request)

    if x_builder_token:
        if not secrets.compare_digest(x_builder_token, expected):
            raise HTTPException(status_code=401, detail="Invalid builder token")
    elif not local:
        raise HTTPException(
            status_code=401,
            detail="Builder door locked — send X-Builder-Token header (see workshop/data/builder_token.txt)",
        )

    user = get_primary_user(db)
    if user is None:
        raise HTTPException(
            status_code=404,
            detail="No home account yet — run workshop setup / register first",
        )
    return user
