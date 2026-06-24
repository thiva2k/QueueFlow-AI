import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker


Base = declarative_base()

_engine = None
_session_local = None
_database_url = None


def get_database_url() -> str:
    return os.getenv("QUEUEFLOW_DATABASE_URL", "sqlite:///./queueflow.db")


def get_engine():
    global _database_url, _engine, _session_local

    url = get_database_url()
    if _engine is None or url != _database_url:
        connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
        _engine = create_engine(url, connect_args=connect_args)
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
