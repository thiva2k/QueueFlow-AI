import os
from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, declarative_base, sessionmaker


Base = declarative_base()

_engine = None
_session_local = None
_database_url = None


def get_database_url() -> str:
    return os.getenv("QUEUEFLOW_DATABASE_URL", "sqlite:///./queueflow.db")


def _configure_sqlite(dbapi_connection, _connection_record) -> None:
    """Make SQLite safe under concurrent counters.

    WAL allows readers during a write; busy_timeout makes writers wait for a
    lock instead of raising ``database is locked``; foreign_keys enforces FK
    integrity (off by default in SQLite).
    """
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def get_engine():
    global _database_url, _engine, _session_local

    url = get_database_url()
    if _engine is None or url != _database_url:
        connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
        _engine = create_engine(url, connect_args=connect_args)
        if url.startswith("sqlite"):
            event.listen(_engine, "connect", _configure_sqlite)
        _session_local = sessionmaker(autocommit=False, autoflush=False, bind=_engine)
        _database_url = url
    return _engine


def get_session_local():
    get_engine()
    return _session_local


def init_db() -> None:
    Base.metadata.create_all(bind=get_engine())


def get_db() -> Generator[Session, None, None]:
    session_local = get_session_local()
    db = session_local()
    try:
        yield db
    finally:
        db.close()
