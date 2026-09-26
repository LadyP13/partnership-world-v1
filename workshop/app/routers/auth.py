"""Authentication routes."""

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import (
    TOKEN_EXPIRE_DAYS,
    create_access_token,
    get_current_user,
    get_user_home,
    hash_password,
    verify_password,
)
from app.database import get_db
from app.models import Home, User

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
async def login(request: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == request.username).first()
    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect username or password")

    token = create_access_token(
        data={"sub": user.username},
        expires_delta=timedelta(days=TOKEN_EXPIRE_DAYS),
    )
    get_user_home(user, db)
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": user.username,
    }


@router.post("/register")
async def register(request: RegisterRequest, db: Session = Depends(get_db)):
    if len(request.username.strip()) < 2:
        raise HTTPException(status_code=400, detail="Username too short")
    if len(request.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    existing = db.query(User).filter(User.username == request.username.strip()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already taken")

    user = User(username=request.username.strip(), hashed_password=hash_password(request.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    get_user_home(user, db)

    token = create_access_token(data={"sub": user.username}, expires_delta=timedelta(days=TOKEN_EXPIRE_DAYS))
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": user.username,
    }


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
    }