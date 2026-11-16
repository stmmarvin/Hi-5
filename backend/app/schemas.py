import re
from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

VehicleType = Literal["auto", "camper", "bestelbus", "vrachtwagen", "ambulance", "brandweer", "politie"]
Country = Literal["NL", "D", "B"]
PLATE_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9 -]{1,12}[A-Z0-9]$")


def clean_plate(value: str) -> str:
    value = re.sub(r"\s+", " ", value.strip().upper())
    if not PLATE_PATTERN.match(value):
        raise ValueError("Ongeldig kenteken: gebruik 3 tot 14 letters, cijfers, streepjes of spaties.")
    return value


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=40)
    password: str = Field(min_length=1, max_length=200)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    display_name: str
    role: str


class PermitOut(BaseModel):
    id: int
    plate: str
    plate_key: str
    country: str
    holder: str
    category: str
    vehicle_type: str
    pitch: str | None
    arrival: date | None
    departure: date | None
    window_start: time | None
    window_end: time | None


class PermitIn(BaseModel):
    plate: str
    country: Country = "NL"
    holder: str = Field(min_length=2, max_length=80)
    category: Literal["guest", "staff", "supplier"]
    vehicle_type: VehicleType = "auto"
    pitch: str | None = Field(default=None, max_length=40)
    arrival: date | None = None
    departure: date | None = None
    window_start: time | None = None
    window_end: time | None = None

    _plate = field_validator("plate")(clean_plate)

    @field_validator("holder")
    @classmethod
    def _holder(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def _consistent(self):
        if self.category == "guest":
            if not (self.pitch and self.arrival and self.departure):
                raise ValueError("Een gast heeft een plek, aankomstdatum en vertrekdatum nodig.")
            if self.departure < self.arrival:
                raise ValueError("De vertrekdatum ligt voor de aankomstdatum.")
        elif (self.window_start is None) != (self.window_end is None):
            raise ValueError("Vul beide tijden van het tijdvak in, of geen van beide.")
        elif self.window_start and self.window_end and self.window_end <= self.window_start:
            raise ValueError("Het einde van het tijdvak ligt voor het begin.")
        return self


class ScanIn(BaseModel):
    plate: str
    country: Country = "NL"
    vehicle_type: VehicleType = "auto"
    direction: Literal["in"] = "in"  # alleen de ingang leest kentekens; de uitgang heeft geen camera
    at: datetime | None = None  # alleen gebruikt in simulatiemodus

    _plate = field_validator("plate")(clean_plate)


class ScanOut(BaseModel):
    passage_id: int
    open: bool
    code: str
    reason: str
    holder: str
    category: str
    pitch: str | None = None


class DecisionIn(BaseModel):
    open: bool


class SafetyIn(BaseModel):
    """De veiligheidsvergrendeling van de slagboom gaat aan of uit."""
    locked: bool
    cause: Literal["ijzel", "sneeuw"]


class SyncItem(ScanIn):
    at: datetime
    open: bool
    manual: bool = False
    reason: str = Field(max_length=200)


class SyncIn(BaseModel):
    items: list[SyncItem] = Field(max_length=200)


class PassageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    occurred_at: datetime
    direction: str
    plate: str
    country: str
    vehicle_type: str
    holder: str
    category: str
    outcome: str
    manual: bool
    offline: bool
    reason: str


class PresenceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    plate: str
    plate_key: str
    country: str
    vehicle_type: str
    holder: str
    category: str
    pitch: str | None
    entered_at: datetime
