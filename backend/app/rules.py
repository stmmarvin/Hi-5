"""De beslissing van de slagboom: mag dit kenteken nu naar binnen?

Alleen bij de ingang wordt het kenteken gelezen. De uitgang gaat altijd open, zonder camera.

Dezelfde regels staan in frontend/src/sim/rules.ts, zodat de slagboom
ook zonder internet kan beslissen. Pas ze op beide plekken aan.
"""
import re
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from .config import settings
from .models import Passage, Permit, Presence, Reservation

EMERGENCY_TYPES = {"ambulance", "brandweer", "politie"}
KEEP = timedelta(hours=24)  # zo lang blijft een kenteken na afloop nog in het systeem
CATEGORY_LABEL = {"staff": "Medewerker", "supplier": "Leverancier"}


@dataclass
class Decision:
    open: bool
    code: str
    reason: str
    permit: Permit | None = None


def plate_key(plate: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", plate.upper())


def forget_expired(db: Session, at: datetime) -> None:
    """Haalt kentekens uit het systeem die er niet meer in horen.

    Een gast blijft bekend tot 24 uur na het einde van de reservering; daarna verdwijnen
    reservering, kenteken en registratie. Wie zonder reservering is binnengekomen (bezoek,
    medewerker, leverancier, hulpdienst) verdwijnt 24 uur na het scannen van de lijst met
    geregistreerde kentekens; een vaste medewerker of leverancier blijft wel in de kentekenlijst.
    Geweigerde kentekens worden nooit bewaard (AVG).
    """
    for reservation in db.scalars(select(Reservation).where(Reservation.departure < at.date() - KEEP)).all():
        keys = [permit.plate_key for permit in reservation.permits]
        db.execute(delete(Presence).where(Presence.plate_key.in_(keys)))
        db.delete(reservation)
    db.flush()
    # AVG: geweigerde kentekens worden niet bewaard (ook niet uit een oudere versie), en een oproep aan de
    # intercom die nooit is beantwoord, verdwijnt na 24 uur.
    db.execute(delete(Passage).where(or_(
        Passage.outcome == "denied",
        (Passage.outcome == "pending") & (Passage.occurred_at < at - KEEP),
        # Bewaartermijn: het logboek houdt passages niet langer vast dan nodig (standaard 28 dagen).
        Passage.occurred_at < at - timedelta(days=settings.retention_days),
    )))
    guests = select(Permit.id).where(Permit.category == "guest")
    db.execute(delete(Presence).where(
        Presence.entered_at < at - KEEP,
        or_(Presence.permit_id.is_(None), Presence.permit_id.not_in(guests)),
    ))


def decide(db: Session, key: str, vehicle_type: str, at: datetime) -> Decision:
    if vehicle_type in EMERGENCY_TYPES:
        return Decision(True, "emergency", "Hulpdienst, mag altijd door")

    permit = db.scalar(select(Permit).where(Permit.plate_key == key, Permit.active.is_(True)))
    if permit is None:
        return Decision(False, "unknown", "Kenteken staat niet in de lijst")

    # Bij de uitgang wordt niets gelezen: het systeem weet dus niet wie er weg is. Wie binnen
    # zijn verblijf of tijdvak terugkomt, mag daarom gewoon opnieuw naar binnen.
    if permit.category == "guest":
        reservation = permit.reservation
        today = at.date()
        if today < reservation.arrival:
            days = (reservation.arrival - today).days
            when = "morgen" if days == 1 else f"over {days} dagen"
            return Decision(False, "too_early", f"Reservering begint pas {when}", permit)
        if today > reservation.departure:
            return Decision(False, "expired", "Reservering is afgelopen", permit)
        return Decision(True, "ok", f"Reservering voor {reservation.pitch}", permit)

    if permit.window_start is not None and permit.window_end is not None:
        now = at.time()
        if not (permit.window_start <= now <= permit.window_end):
            return Decision(
                False, "outside_window",
                f"Buiten het tijdvak {permit.window_start:%H:%M} tot {permit.window_end:%H:%M}", permit,
            )
    return Decision(True, "ok", f"{CATEGORY_LABEL[permit.category]} binnen tijdvak", permit)
