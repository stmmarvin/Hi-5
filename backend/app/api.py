from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import schemas
from .config import settings
from .db import get_db
from .models import AuditLog, Passage, Permit, Presence, Reservation, User, utcnow
from .rules import decide, forget_expired, is_emergency, plate_key
from .security import (
    COOKIE_NAME, DUMMY_HASH, audit, client_ip, create_token, current_user,
    login_limiter, require_admin, verify_password,
)
from .seed import reset_simulation

router = APIRouter(prefix="/api")

MAX_FAILED_LOGINS = 5
LOCK_MINUTES = 15


# ---------- hulpfuncties ----------

def moment(at: datetime | None) -> datetime:
    """In simulatiemodus bepaalt de simulatie de tijd; anders altijd de klok van de server."""
    if settings.simulation_mode and at is not None:
        return at.replace(tzinfo=None)
    return utcnow()


def permit_out(permit: Permit) -> schemas.PermitOut:
    r = permit.reservation
    return schemas.PermitOut(
        id=permit.id, plate=permit.plate, plate_key=permit.plate_key, country=permit.country,
        holder=permit.holder, category=permit.category, vehicle_type=permit.vehicle_type,
        pitch=r.pitch if r else None, arrival=r.arrival if r else None, departure=r.departure if r else None,
        window_start=permit.window_start, window_end=permit.window_end,
    )


def enter(db: Session, passage: Passage, permit: Permit | None) -> None:
    """Registreert het kenteken dat bij de ingang is gescand. Komt het voertuig terug, dan telt de laatste keer."""
    presence = db.scalar(select(Presence).where(Presence.plate_key == passage.plate_key))
    if presence is not None:
        presence.entered_at = passage.occurred_at
        return
    db.add(Presence(
        plate_key=passage.plate_key, plate=passage.plate, country=passage.country,
        vehicle_type=passage.vehicle_type, holder=passage.holder, category=passage.category,
        pitch=permit.reservation.pitch if permit and permit.reservation else None,
        entered_at=passage.occurred_at, permit_id=permit.id if permit else None,
    ))


def identity(db: Session, key: str, vehicle_type: str, permit: Permit | None = None,
             siren: bool = False) -> tuple[Permit | None, str, str]:
    if is_emergency(vehicle_type, siren):
        return None, "Hulpdienst", "emergency"
    permit = permit or db.scalar(select(Permit).where(Permit.plate_key == key))
    if permit is None:
        return None, "Onbekend", "visitor"
    return permit, permit.holder, permit.category


# ---------- inloggen ----------

@router.post("/auth/login", response_model=schemas.UserOut)
def login(body: schemas.LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    if not login_limiter.allow(client_ip(request)):
        raise HTTPException(429, "Te veel pogingen. Probeer het over een minuut opnieuw.")

    username = body.username.strip().lower()
    user = db.scalar(select(User).where(User.username == username))
    now = utcnow()

    if user and user.locked_until and user.locked_until > now:
        audit(db, request, "login_geblokkeerd", user=user)
        db.commit()
        raise HTTPException(429, f"Dit account is tijdelijk geblokkeerd. Probeer het over {LOCK_MINUTES} minuten opnieuw.")

    password_ok = verify_password(body.password, user.password_hash if user else DUMMY_HASH)
    if user is None or not user.is_active or not password_ok:
        if user:
            user.failed_logins += 1
            if user.failed_logins >= MAX_FAILED_LOGINS:
                user.failed_logins = 0
                user.locked_until = now + timedelta(minutes=LOCK_MINUTES)
        audit(db, request, "login_mislukt", user=user, username=username)
        db.commit()
        raise HTTPException(401, "Gebruikersnaam of wachtwoord klopt niet.")

    user.failed_logins = 0
    user.locked_until = None
    audit(db, request, "login", user=user)
    db.commit()
    response.set_cookie(
        COOKIE_NAME, create_token(user), max_age=settings.session_hours * 3600,
        httponly=True, samesite="strict", secure=settings.cookie_secure, path="/",
    )
    return user


@router.post("/auth/logout", status_code=204)
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/", httponly=True, samesite="strict", secure=settings.cookie_secure)


@router.get("/auth/me", response_model=schemas.UserOut)
def me(user: User = Depends(current_user)):
    return user


# ---------- kentekenlijst ----------

@router.get("/permits", response_model=list[schemas.PermitOut])
def list_permits(_: User = Depends(current_user), db: Session = Depends(get_db)):
    permits = db.scalars(select(Permit).where(Permit.active.is_(True)).order_by(Permit.category, Permit.holder)).all()
    return [permit_out(p) for p in permits]


@router.post("/permits", response_model=schemas.PermitOut, status_code=201)
def create_permit(body: schemas.PermitIn, request: Request, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    key = plate_key(body.plate)
    if db.scalar(select(Permit.id).where(Permit.plate_key == key)) is not None:
        raise HTTPException(409, f"{body.plate} staat al in de kentekenlijst.")
    permit = Permit(
        plate_key=key, plate=body.plate, country=body.country, holder=body.holder,
        category=body.category, vehicle_type=body.vehicle_type,
    )
    if body.category == "guest":
        permit.reservation = Reservation(guest_name=body.holder, pitch=body.pitch, arrival=body.arrival, departure=body.departure)
    else:
        permit.window_start, permit.window_end = body.window_start, body.window_end
    db.add(permit)
    audit(db, request, "kenteken_toegevoegd", f"{body.plate} ({body.holder})", user=user)
    db.commit()
    return permit_out(permit)


@router.delete("/permits/{permit_id}", status_code=204)
@router.post("/permits/{permit_id}/delete", status_code=204)  # voor hosting die DELETE niet doorlaat
def delete_permit(permit_id: int, request: Request, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    permit = db.get(Permit, permit_id)
    if permit is None:
        raise HTTPException(404, "Dit kenteken bestaat niet (meer).")
    audit(db, request, "kenteken_verwijderd", f"{permit.plate} ({permit.holder})", user=user)
    db.delete(permit.reservation if permit.reservation else permit)
    db.commit()


# ---------- overzichten ----------

@router.get("/presence", response_model=list[schemas.PresenceOut])
def list_presence(_: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.scalars(select(Presence).order_by(Presence.entered_at.desc())).all()


@router.get("/passages", response_model=list[schemas.PassageOut])
def list_passages(limit: int = Query(50, ge=1, le=200), _: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.scalars(select(Passage).order_by(Passage.occurred_at.desc(), Passage.id.desc()).limit(limit)).all()


@router.get("/audit")
def list_audit(limit: int = Query(100, ge=1, le=500), _: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.scalars(select(AuditLog).order_by(AuditLog.at.desc(), AuditLog.id.desc()).limit(limit)).all()
    return [{"id": r.id, "at": r.at, "username": r.username, "action": r.action, "detail": r.detail} for r in rows]


# ---------- de slagboom ----------

@router.post("/gate/scan", response_model=schemas.ScanOut)
def scan(body: schemas.ScanIn, _: User = Depends(current_user), db: Session = Depends(get_db)):
    """De camera bij de ingang heeft een kenteken gelezen. Het systeem beslist en legt de passage vast.

    Bij de uitgang staat geen camera: die slagboom gaat altijd open en legt niets vast.
    """
    at = moment(body.at)
    key = plate_key(body.plate)
    common = dict(occurred_at=at, direction="in", plate_key=key, plate=body.plate,
                  country=body.country, vehicle_type=body.vehicle_type)

    for attempt in (1, 2):
        forget_expired(db, at)
        decision = decide(db, key, body.vehicle_type, at, body.siren)
        permit, holder, category = identity(db, key, body.vehicle_type, decision.permit, body.siren)
        passage = Passage(**common, permit_id=permit.id if permit else None, holder=holder, category=category,
                          outcome="granted" if decision.open else "pending", reason=decision.reason)
        db.add(passage)
        if decision.open:
            enter(db, passage, permit)
        try:
            db.commit()
            break
        except IntegrityError:
            # Twee scans van hetzelfde kenteken op hetzelfde moment: de database registreert het
            # kenteken maar één keer. Probeer opnieuw; de registratie bestaat nu.
            db.rollback()
            if attempt == 2:
                raise
    return schemas.ScanOut(
        passage_id=passage.id, open=decision.open, code=decision.code, reason=decision.reason,
        holder=holder, category=category,
        pitch=permit.reservation.pitch if permit and permit.reservation else None,
    )


@router.post("/gate/passages/{passage_id}/decision", response_model=schemas.PassageOut)
def intercom_decision(passage_id: int, body: schemas.DecisionIn, request: Request,
                      user: User = Depends(current_user), db: Session = Depends(get_db)):
    """De receptie beantwoordt de intercom en laat iemand wel of niet binnen."""
    passage = db.get(Passage, passage_id)
    if passage is None:
        raise HTTPException(404, "Deze passage bestaat niet.")
    if passage.outcome != "pending":
        raise HTTPException(409, "Deze oproep is al afgehandeld.")

    cause = passage.reason[:1].lower() + passage.reason[1:]
    if not body.open:
        # AVG: een geweigerd kenteken wordt niet bewaard. De passage verdwijnt en het auditlog noemt geen kenteken.
        result = schemas.PassageOut.model_validate(passage).model_copy(update={
            "outcome": "denied", "manual": True, "reason": f"Door receptie geweigerd ({cause})"[:200],
        })
        db.delete(passage)
        audit(db, request, "intercom_geweigerd", cause, user=user)
        db.commit()
        return result

    passage.outcome = "granted"
    passage.manual = True
    passage.decided_by = user.id
    passage.reason = f"Door receptie binnengelaten ({cause})"[:200]
    if passage.holder == "Onbekend":
        passage.holder = "Bezoeker"
    enter(db, passage, db.get(Permit, passage.permit_id) if passage.permit_id else None)
    audit(db, request, "intercom_open", f"{passage.plate}: {cause}", user=user)
    db.commit()
    return passage


@router.post("/gate/safety", status_code=204)
def gate_safety(body: schemas.SafetyIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Vergrendeling door ijzel of sneeuw en storingen (stroom, defecte slagboom) komen in het auditlog,
    net als het moment waarop ze voorbij zijn."""
    audit(db, request, "slagboom_vergrendeld" if body.locked else "slagboom_vrijgegeven", body.cause, user=user)
    db.commit()


@router.post("/gate/sync")
def sync(body: schemas.SyncIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Passages die de slagboom zonder internet zelf heeft afgehandeld, worden alsnog vastgelegd.

    AVG: wie zonder internet is geweigerd, wordt niet opgeslagen. Alleen binnengelaten voertuigen komen in het logboek.
    """
    allowed = [item for item in body.items if item.open]
    for item in sorted(allowed, key=lambda i: i.at):
        at = item.at.replace(tzinfo=None)
        key = plate_key(item.plate)
        # Opschonen gaat op de klok van het systeem, niet op een tijd die de slagboom zelf meestuurt.
        forget_expired(db, moment(item.at))
        permit, holder, category = identity(db, key, item.vehicle_type, siren=item.siren)
        if item.manual and item.open and holder == "Onbekend":
            holder = "Bezoeker"
        passage = Passage(
            occurred_at=at, direction="in", plate_key=key, plate=item.plate, country=item.country,
            vehicle_type=item.vehicle_type, permit_id=permit.id if permit else None, holder=holder,
            category=category, outcome="granted", manual=item.manual,
            offline=True, reason=item.reason, decided_by=user.id if item.manual else None,
        )
        db.add(passage)
        enter(db, passage, permit)
        db.flush()
    audit(db, request, "offline_gesynchroniseerd", f"{len(allowed)} passages", user=user)
    db.commit()
    return {"synced": len(body.items)}


# ---------- simulatie ----------

@router.post("/sim/reset", status_code=204)
def sim_reset(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not settings.simulation_mode:
        raise HTTPException(403, "Resetten kan alleen in simulatiemodus.")
    reset_simulation(db)
    audit(db, request, "simulatie_gereset", user=user)
    db.commit()


@router.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "simulation": settings.simulation_mode}
