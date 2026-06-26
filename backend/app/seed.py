from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app import models
from app.database import get_session_local, init_db
from app.services.prediction import recalculate_predictions


SEED_SERVICES = [
    ("NIC Renewal", 8),
    ("License Renewal", 12),
    ("Document Verification", 6),
]

SEED_COUNTERS = [
    ("Counter 1", "active"),
    ("Counter 2", "active"),
    ("Counter 3", "paused"),
    ("Counter 4", "active"),
]

RESET_COUNTERS = [
    ("Counter 1", "active"),
    ("Counter 2", "active"),
    ("Counter 3", "active"),
    ("Counter 4", "active"),
]


def clear_demo_data(db: Session) -> None:
    for counter in db.query(models.Counter).all():
        counter.current_token_id = None
    db.flush()
    db.query(models.Token).delete()
    db.query(models.Counter).delete()
    db.query(models.Service).delete()
    db.commit()


def seed_demo_data(db: Session) -> dict[str, int]:
    clear_demo_data(db)

    services = [
        models.Service(name=name, default_duration_minutes=duration)
        for name, duration in SEED_SERVICES
    ]
    counters = [
        models.Counter(name=name, status=status)
        for name, status in SEED_COUNTERS
    ]
    db.add_all(services + counters)
    db.flush()

    sample_tokens = []
    for index in range(1, 21):
        service = services[(index - 1) % len(services)]
        sample_tokens.append(
            models.Token(
                token_number=f"A-{index:03d}",
                citizen_name=f"Demo Citizen {index}",
                nic_or_phone=f"077000{index:04d}",
                service_id=service.id,
                status="waiting",
            )
        )

    db.add_all(sample_tokens)
    db.commit()
    recalculate_predictions(db)
    return {"services": len(services), "counters": len(counters), "tokens": len(sample_tokens)}


def reset_demo_data(db: Session) -> dict[str, int]:
    clear_demo_data(db)

    now = datetime.now(timezone.utc)
    services = [
        models.Service(name=name, default_duration_minutes=duration, created_at=now)
        for name, duration in SEED_SERVICES
    ]
    counters = [
        models.Counter(name=name, status=status, created_at=now)
        for name, status in RESET_COUNTERS
    ]
    db.add_all(services + counters)
    db.flush()

    sample_tokens = []
    for index in range(1, 21):
        service = services[(index - 1) % len(services)]
        status = "waiting"
        called_at = None
        started_at = None
        if index == 1:
            status = "serving"
            called_at = now - timedelta(minutes=5)
            started_at = now - timedelta(minutes=3)
        elif index == 2:
            status = "serving"
            called_at = now - timedelta(minutes=8)
            started_at = now - timedelta(minutes=6)

        sample_tokens.append(
            models.Token(
                token_number=f"A-{index:03d}",
                citizen_name=f"Demo Citizen {index}",
                nic_or_phone=f"077000{index:04d}",
                service_id=service.id,
                status=status,
                created_at=now - timedelta(minutes=max(20 - index, 0)),
                called_at=called_at,
                started_at=started_at,
            )
        )

    db.add_all(sample_tokens)
    db.flush()
    counters[0].current_token_id = sample_tokens[0].id
    counters[1].current_token_id = sample_tokens[1].id
    counters[2].current_token_id = None

    db.commit()
    recalculate_predictions(db)
    return {"services": len(services), "counters": len(counters), "tokens": len(sample_tokens)}


def main() -> None:
    init_db()
    session_local = get_session_local()
    db = session_local()
    try:
        summary = seed_demo_data(db)
        print(f"Seeded {summary['services']} services, {summary['counters']} counters, {summary['tokens']} tokens.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
