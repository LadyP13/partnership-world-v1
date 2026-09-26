"""SQLAlchemy models for PartnershipWorld Workshop."""

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    home = relationship("Home", back_populates="user", uselist=False)


class Home(Base):
    """One home per user — companion, memories, sleep state, AI config."""

    __tablename__ = "homes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True)
    companion_json = Column(Text, nullable=True)
    memories_json = Column(Text, nullable=True)
    sleep_json = Column(Text, nullable=True)
    ai_config_json = Column(Text, nullable=True)
    permissions_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="home")
    messages = relationship("Message", back_populates="home", cascade="all, delete-orphan")


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    home_id = Column(Integer, ForeignKey("homes.id"), nullable=False)
    speaker = Column(String, nullable=False)  # "human" or "ie"
    sender_name = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    device = Column(String, default="workshop")  # "phone", "workshop", "web"
    memory_saved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    home = relationship("Home", back_populates="messages")