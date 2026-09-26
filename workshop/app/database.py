"""Database setup for PartnershipWorld Workshop."""

from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)

DATABASE_URL = f"sqlite:///{DATA_DIR}/workshop.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _migrate_columns():
    inspector = inspect(engine)
    if "homes" not in inspector.get_table_names():
        return
    columns = {col["name"] for col in inspector.get_columns("homes")}
    if "permissions_json" not in columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE homes ADD COLUMN permissions_json TEXT"))


def init_db():
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _migrate_columns()