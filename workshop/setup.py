"""First-run setup — creates account and database."""

import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from app.auth import hash_password, verify_password
from app.database import SessionLocal, init_db
from app.models import Home, User


def main():
    print("=" * 50)
    print("  PartnershipWorld Workshop Setup")
    print("=" * 50)
    print()
    print("IMPORTANT: Stop the workshop server first (Ctrl+C in its terminal)")
    print("           before deleting workshop.db or running setup.")
    print()

    init_db()
    print("Database created at workshop/data/workshop.db")
    print()

    db = SessionLocal()
    try:
        existing = db.query(User).all()
        if existing:
            print("Setup already ran — you have account(s) in the database:")
            for u in existing:
                print(f"  • {u.username}")
            print()
            print("You do NOT need to run setup again.")
            print("Just start the workshop:")
            print("  python3 start.py")
            print()
            print("Forgot your password, or want a fresh start?")
            print("  rm workshop/data/workshop.db")
            print("  python3 setup.py")
            print()
            return

        print("Create your home login (same on phone + laptop):")
        username = input("  Username: ").strip()
        while not username:
            username = input("  Username: ").strip()

        password = getpass.getpass("  Password: ")
        while len(password) < 6:
            print("  Password must be at least 6 characters.")
            password = getpass.getpass("  Password: ")

        hashed = hash_password(password)
        if not verify_password(password, hashed):
            print("ERROR: password could not be saved correctly. Try again or run:")
            print("  ./venv/bin/pip install -r requirements.txt")
            return

        user = User(username=username, hashed_password=hashed)
        db.add(user)
        db.commit()
        db.refresh(user)

        home = Home(user_id=user.id)
        db.add(home)
        db.commit()

        print()
        print("=" * 50)
        print("  Setup complete!")
        print("=" * 50)
        print(f"  Account: {username}")
        print("  Run: python3 start.py")
        print()
    finally:
        db.close()


if __name__ == "__main__":
    main()