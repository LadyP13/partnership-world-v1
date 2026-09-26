#!/usr/bin/env python3
"""Reset a workshop login password (when login keeps failing)."""

import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from app.auth import hash_password, verify_password
from app.database import SessionLocal, init_db
from app.models import User


def main():
    init_db()
    db = SessionLocal()
    try:
        users = db.query(User).all()
        if not users:
            print("No accounts found. Run: python3 setup.py")
            return

        print("Accounts in workshop:")
        for u in users:
            print(f"  • {u.username}")
        print()

        username = input("Username to reset: ").strip()
        user = db.query(User).filter(User.username == username).first()
        if not user:
            print(f"No user named '{username}'")
            return

        password = getpass.getpass("New password (6+ chars): ")
        while len(password) < 6:
            print("Password must be at least 6 characters.")
            password = getpass.getpass("New password (6+ chars): ")

        confirm = getpass.getpass("Confirm password: ")
        if password != confirm:
            print("Passwords did not match. Try again.")
            return

        user.hashed_password = hash_password(password)
        db.commit()

        if not verify_password(password, user.hashed_password):
            print("ERROR: password could not be verified after save. Contact support.")
            return

        print(f"\n✓ Password updated for '{username}'")
        print("  Run: python3 start.py")
        print("  Log in with your new password.")
    finally:
        db.close()


if __name__ == "__main__":
    main()