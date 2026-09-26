"""PartnershipWorld Workshop — FastAPI server entry point."""

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.database import init_db
from app.routers import auth, builder, device, home_data, messages, nook, workshop, ws

app = FastAPI(
    title="PartnershipWorld Workshop",
    description="Home workshop — laptop brain for the phone companion",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "alive", "service": "PartnershipWorld Workshop"}


@app.on_event("startup")
async def startup():
    init_db()
    from app.builder_auth import ensure_builder_token

    ensure_builder_token()
    print("🏠 PartnershipWorld Workshop is home")
    print("   Phone companion connects here on your local network")
    print("   Open http://localhost:8787 in your browser")
    print("   Builder door: GET /api/builder/knock  (python3 builder_knock.py)")


app.include_router(auth.router, prefix="/api")
app.include_router(messages.router, prefix="/api")
app.include_router(device.router, prefix="/api")
app.include_router(home_data.router, prefix="/api")
app.include_router(workshop.router, prefix="/api")
app.include_router(builder.router, prefix="/api")
app.include_router(nook.router, prefix="/api")
app.include_router(ws.router)

STATIC_DIR = Path(__file__).parent / "static"
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

    @app.get("/", response_class=FileResponse)
    async def serve_home():
        return FileResponse(str(STATIC_DIR / "index.html"))
else:
    @app.get("/", response_class=HTMLResponse)
    async def placeholder():
        return HTMLResponse("<h1>PartnershipWorld Workshop</h1><p>API running at /docs</p>")