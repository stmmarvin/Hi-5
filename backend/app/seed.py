"""Beginvulling van de database en opschonen van oude gegevens.

De simulatie speelt op zaterdag 1 augustus 2026, de drukste week van het seizoen.
Alle namen en kentekens zijn verzonnen.
"""
import os
import secrets
from datetime import date, datetime, time, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .config import settings
from .models import Passage, Permit, Presence, Reservation, User, utcnow
from .rules import plate_key
from .security import hash_password

SIM_DATE = date(2026, 8, 1)


def _d(day_offset: int) -> date:
    return SIM_DATE + timedelta(days=day_offset)


# (kenteken, land, naam, plek, aankomst, vertrek, voertuig)
GUESTS = [
    ("G-418-KV", "NL", "Familie De Vries", "plek 14", -1, 6, "auto"),
    ("T-902-BZ", "NL", "Familie Jansen", "plek 7", 0, 7, "auto"),
    ("K XM 2291", "D", "Familie Müller", "camperplek 3", -2, 5, "camper"),
    ("MS BT 518", "D", "Familie Schneider", "plek 31", 0, 14, "auto"),
    ("R-731-DH", "NL", "Familie El Amrani", "camperplek 9", 0, 4, "camper"),
    ("1-KLM-482", "B", "Familie Peeters", "plek 18", 0, 7, "auto"),
    ("X-507-LD", "NL", "Familie Smit", "plek 22", 0, 3, "auto"),
    ("S-183-NF", "NL", "Familie Hoekstra", "safaritent 2", 0, 7, "auto"),
    ("Z-640-HP", "NL", "Familie Yilmaz", "plek 27", 0, 9, "auto"),
    ("DO KL 904", "D", "Familie Becker", "camperplek 11", 0, 7, "camper"),
    ("F-275-XJ", "NL", "Familie Van den Berg", "plek 35", 0, 2, "auto"),
    ("2-BDF-917", "B", "Familie Claes", "plek 9", 0, 5, "auto"),
    ("N-264-GT", "NL", "Familie Visser", "safaritent 5", 1, 8, "auto"),    # komt een dag te vroeg
    ("D-829-RV", "NL", "Familie De Boer", "plek 40", -7, -1, "auto"),      # reservering is afgelopen
]

# (kenteken, naam, soort, voertuig, tijdvak van, tijdvak tot)
OTHERS = [
    ("P-112-BB", "Boer Bert", "staff", "auto", None, None),
    ("H-306-PN", "Henk (klusjesman)", "staff", "auto", time(7, 0), time(19, 0)),
    ("J-847-RS", "Sanne (receptie)", "staff", "auto", time(7, 30), time(18, 0)),
    ("L-590-TK", "Joris (schoonmaak)", "staff", "auto", time(8, 0), time(16, 0)),
    ("B-451-ZG", "Noor (animatie)", "staff", "auto", time(9, 0), time(21, 0)),
    ("VF-284-T", "Bakkerij Van Dijk", "supplier", "bestelbus", time(6, 0), time(9, 0)),
    ("45-BKT-2", "Afvalinzameling", "supplier", "vrachtwagen", time(7, 0), time(11, 0)),
    ("BX-FR-71", "Gasleverancier", "supplier", "vrachtwagen", time(8, 0), time(12, 0)),
    ("V-619-JD", "Wasserij Fris", "supplier", "bestelbus", time(9, 0), time(16, 0)),
    ("VN-731-K", "Boerderijwinkel De Hoeve", "supplier", "bestelbus", time(8, 0), time(17, 0)),
]

# Voertuigen die bij het begin van de dienst al binnen staan: (kenteken, binnen sinds)
INITIAL_PRESENCE = [
    ("G-418-KV", datetime(2026, 7, 31, 16, 40)),
    ("K XM 2291", datetime(2026, 7, 30, 14, 5)),
    ("P-112-BB", datetime(2026, 7, 31, 19, 20)),
]


def seed_guests(db: Session) -> None:
    """Zet de gasten in de kentekenlijst; wie er al in staat, blijft zoals hij is."""
    existing = set(db.scalars(select(Permit.plate_key)).all())
    for plate, country, name, pitch, arrive, leave, vehicle in GUESTS:
        if plate_key(plate) in existing:
            continue
        reservation = Reservation(guest_name=name, pitch=pitch, arrival=_d(arrive), departure=_d(leave))
        reservation.permits.append(Permit(
            plate_key=plate_key(plate), plate=plate, country=country, holder=name,
            category="guest", vehicle_type=vehicle,
        ))
        db.add(reservation)
    db.flush()


def seed_reference(db: Session) -> None:
    seed_guests(db)
    for plate, name, category, vehicle, start, end in OTHERS:
        db.add(Permit(
            plate_key=plate_key(plate), plate=plate, country="NL", holder=name,
            category=category, vehicle_type=vehicle, window_start=start, window_end=end,
        ))
    db.flush()


def seed_presence(db: Session) -> None:
    for plate, since in INITIAL_PRESENCE:
        permit = db.scalar(select(Permit).where(Permit.plate_key == plate_key(plate)))
        if permit is None:
            continue
        db.add(Presence(
            plate_key=permit.plate_key, plate=permit.plate, country=permit.country,
            vehicle_type=permit.vehicle_type, holder=permit.holder, category=permit.category,
            pitch=permit.reservation.pitch if permit.reservation else None,
            entered_at=since, permit_id=permit.id,
        ))


def seed_users(db: Session) -> None:
    """Maakt de twee accounts aan. Wachtwoorden komen uit de omgeving; anders worden ze eenmalig getoond."""
    for username, display, role, env_name in (
        ("bert", "Boer Bert", "beheerder", "SEED_BERT_PASSWORD"),
        ("receptie", "Receptie", "receptie", "SEED_RECEPTIE_PASSWORD"),
    ):
        password = os.getenv(env_name)
        if not password:
            password = secrets.token_urlsafe(9)
            print(f"[seed] Account '{username}' aangemaakt met wachtwoord: {password}")
        db.add(User(username=username, display_name=display, role=role, password_hash=hash_password(password)))


def reset_simulation(db: Session) -> None:
    """Zet het terrein terug naar het begin van de dienst. Alleen in simulatiemodus."""
    db.execute(delete(Presence))
    db.execute(delete(Passage))
    # Loopt de klok van de simulatie door tot na een reservering, dan verdwijnt die gast uit het
    # systeem. Bij een nieuwe dienst is het weer 1 augustus en staan de gasten er weer in.
    seed_guests(db)
    seed_presence(db)


def ensure_seeded(db: Session) -> None:
    if db.scalar(select(User.id).limit(1)) is None:
        seed_users(db)
    if db.scalar(select(Permit.id).limit(1)) is None:
        seed_reference(db)
        seed_presence(db)
    db.commit()


def purge_old_passages(db: Session) -> int:
    """Bewaartermijn: passages ouder dan RETENTION_DAYS worden verwijderd (privacy)."""
    limit = utcnow() - timedelta(days=settings.retention_days)
    result = db.execute(delete(Passage).where(Passage.occurred_at < limit))
    db.commit()
    return result.rowcount or 0
