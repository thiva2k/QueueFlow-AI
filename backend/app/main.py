from contextlib import asynccontextmanager
import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import models
from app.auth import log_auth_mode
from app.database import get_session_local, init_db
from app.routers import admin, counters, services, tokens
from app.seed import seed_demo_data

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("queueflow")


def _seed_if_empty() -> None:
    """Seed demo data when the database is empty.

    Render's free disk is ephemeral, so the SQLite file is wiped on every
    deploy/restart. Without this, the demo would come back up with an empty
    queue until someone manually clicked "Reset". Controlled by SEED_ON_START
    (default on); set SEED_ON_START=false for a real deployment with real data.
    """
    if os.getenv("SEED_ON_START", "true").strip().lower() in {"false", "0", "no"}:
        return
    session_local = get_session_local()
    db = session_local()
    try:
        if db.query(models.Service).count() == 0:
            summary = seed_demo_data(db)
            logger.info("Seeded empty database: %s", summary)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    log_auth_mode()
    _seed_if_empty()
    yield


app = FastAPI(title="QueueFlow AI", version="0.1.0", lifespan=lifespan)


def get_cors_origins() -> list[str]:
    origins = os.getenv(
        "CORS_ORIGINS",
        "http://127.0.0.1:5173,http://localhost:5173",
    )
    return [origin.strip().rstrip("/") for origin in origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(services.router)
app.include_router(counters.router)
app.include_router(tokens.router)
app.include_router(admin.router)
