"""Datamodel van het toegangssysteem.

users          medewerkers die mogen inloggen (Bert, receptie)
reservations   reserveringen van gasten (naam, plek, periode)
permits        de kentekenlijst: wie mag wanneer naar binnen
passages       logboek van elke passage bij de slagboom
presence       kentekens die bij de ingang zijn gescand en nog in het systeem staan
audit_log      wie deed wat in het beheer (inloggen, wijzigen)
"""
from datetime import date, datetime, time, timezone

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, String, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role IN ('beheerder', 'receptie')", name="ck_users_role"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(40), unique=True)
    display_name: Mapped[str] = mapped_column(String(80))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    failed_logins: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Reservation(Base):
    __tablename__ = "reservations"
    __table_args__ = (CheckConstraint("departure >= arrival", name="ck_reservations_period"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    guest_name: Mapped[str] = mapped_column(String(80))
    pitch: Mapped[str] = mapped_column(String(40))
    arrival: Mapped[date] = mapped_column(Date)
    departure: Mapped[date] = mapped_column(Date)

    permits: Mapped[list["Permit"]] = relationship(back_populates="reservation", cascade="all, delete-orphan")


class Permit(Base):
    __tablename__ = "permits"
    __table_args__ = (
        CheckConstraint("category IN ('guest', 'staff', 'supplier')", name="ck_permits_category"),
        CheckConstraint("category <> 'guest' OR reservation_id IS NOT NULL", name="ck_permits_guest_reservation"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    plate_key: Mapped[str] = mapped_column(String(12), unique=True)  # kenteken zonder streepjes en spaties
    plate: Mapped[str] = mapped_column(String(14))
    country: Mapped[str] = mapped_column(String(3), default="NL")
    holder: Mapped[str] = mapped_column(String(80))
    category: Mapped[str] = mapped_column(String(20))
    vehicle_type: Mapped[str] = mapped_column(String(20), default="auto")
    reservation_id: Mapped[int | None] = mapped_column(ForeignKey("reservations.id", ondelete="CASCADE"), nullable=True)
    window_start: Mapped[time | None] = mapped_column(Time, nullable=True)
    window_end: Mapped[time | None] = mapped_column(Time, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    reservation: Mapped[Reservation | None] = relationship(back_populates="permits")


class Passage(Base):
    __tablename__ = "passages"
    __table_args__ = (
        CheckConstraint("direction IN ('in', 'out')", name="ck_passages_direction"),
        CheckConstraint("outcome IN ('granted', 'denied', 'pending')", name="ck_passages_outcome"),
        Index("ix_passages_occurred_at", "occurred_at"),
        Index("ix_passages_plate_key", "plate_key"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime)
    direction: Mapped[str] = mapped_column(String(3))
    plate_key: Mapped[str] = mapped_column(String(12))
    plate: Mapped[str] = mapped_column(String(14))
    country: Mapped[str] = mapped_column(String(3))
    vehicle_type: Mapped[str] = mapped_column(String(20))
    permit_id: Mapped[int | None] = mapped_column(ForeignKey("permits.id", ondelete="SET NULL"), nullable=True)
    holder: Mapped[str] = mapped_column(String(80))      # naam op het moment van de passage
    category: Mapped[str] = mapped_column(String(20))
    outcome: Mapped[str] = mapped_column(String(10))     # pending = wacht op antwoord via de intercom
    manual: Mapped[bool] = mapped_column(Boolean, default=False)   # beslist door de receptie
    offline: Mapped[bool] = mapped_column(Boolean, default=False)  # lokaal beslist, later gesynchroniseerd
    reason: Mapped[str] = mapped_column(String(200))
    decided_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class Presence(Base):
    __tablename__ = "presence"

    id: Mapped[int] = mapped_column(primary_key=True)
    plate_key: Mapped[str] = mapped_column(String(12), unique=True)
    plate: Mapped[str] = mapped_column(String(14))
    country: Mapped[str] = mapped_column(String(3))
    vehicle_type: Mapped[str] = mapped_column(String(20))
    holder: Mapped[str] = mapped_column(String(80))
    category: Mapped[str] = mapped_column(String(20))
    pitch: Mapped[str | None] = mapped_column(String(40), nullable=True)
    entered_at: Mapped[datetime] = mapped_column(DateTime)
    permit_id: Mapped[int | None] = mapped_column(ForeignKey("permits.id", ondelete="SET NULL"), nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_log"
    __table_args__ = (Index("ix_audit_log_at", "at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    username: Mapped[str] = mapped_column(String(40))
    action: Mapped[str] = mapped_column(String(40))
    detail: Mapped[str] = mapped_column(String(300), default="")
    ip: Mapped[str] = mapped_column(String(45), default="")
