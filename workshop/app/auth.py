"""Authentication utilities for PartnershipWorld Workshop."""

from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
import secrets

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Home, User

ALGORITHM = "HS256"
TOKEN_EXPIRE_DAYS = 30

# Lives next to the local database. Gitignored. Never commit this file.
SECRET_PATH = Path(__file__).resolve().parent.parent / "data" / "jwt_secret"

security = HTTPBearer(auto_error=False)


def load_or_create_secret() -> str:
    """One random key per machine. Created on first setup/start."""
    SECRET_PATH.parent.mkdir(parents=True, exist_ok=True)
    if SECRET_PATH.exists():
        key = SECRET_PATH.read_text(encoding="utf-8").strip()
        if key:
            return key
    key = secrets.token_hex(32)
    SECRET_PATH.write_text(key + "\n", encoding="utf-8")
    try:
        SECRET_PATH.chmod(0o600)
    except OSError:
        pass
    return key


SECRET_KEY = load_or_create_secret()


def hash_password(password: str) -> str:
    """Hash password with bcrypt (direct — avoids passlib/bcrypt version bugs)."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except (ValueError, TypeError):
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(days=TOKEN_EXPIRE_DAYS))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        return payload
    except JWTError:
        raise credentials_exception


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = verify_token(credentials.credentials)
    username = payload.get("sub")
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def get_user_home(user: User, db: Session) -> Home:
    home = db.query(Home).filter(Home.user_id == user.id).first()
    if home is None:
        home = Home(user_id=user.id)
        db.add(home)
        db.commit()
        db.refresh(home)
    return home


def get_user_from_token(token: str, db: Session) -> Optional[User]:
    try:
        payload = verify_token(token)
        username = payload.get("sub")
        return db.query(User).filter(User.username == username).first()
    except HTTPException:
        return None
