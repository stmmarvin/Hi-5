from conftest import login

NOON = "2026-08-01T12:00:00"


def scan(client, plate, direction="in", at=NOON, vehicle_type="auto", country="NL"):
    r = client.post("/api/gate/scan", json={
        "plate": plate, "direction": direction, "at": at, "vehicle_type": vehicle_type, "country": country,
    })
    assert r.status_code == 200, r.text
    return r.json()


# ---------- beveiliging ----------

def test_alles_vereist_inloggen(client):
    for path in ("/api/permits", "/api/presence", "/api/passages", "/api/auth/me"):
        assert client.get(path).status_code == 401
    assert client.post("/api/gate/scan", json={"plate": "T-902-BZ", "direction": "in"}).status_code == 401


def test_fout_wachtwoord_en_blokkade(client):
    for _ in range(5):
        assert login(client, "receptie", "fout").status_code == 401
    # Na vijf mislukte pogingen is het account geblokkeerd, ook met het juiste wachtwoord.
    assert login(client).status_code == 429


def test_onbekende_gebruiker_krijgt_dezelfde_melding(client):
    a = login(client, "bestaat-niet", "x")
    b = login(client, "receptie", "x")
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json()


def test_aanmeldlimiet_per_adres(client):
    for i in range(10):
        login(client, f"gebruiker{i}", "x")
    assert login(client, "nog-een", "x").status_code == 429


def test_wijzigen_zonder_beveiligingsheader_wordt_geweigerd(receptie):
    r = receptie.post("/api/gate/scan", json={"plate": "T-902-BZ", "direction": "in"}, headers={"X-Requested-With": ""})
    assert r.status_code == 403


def test_sessiecookie_is_afgeschermd(client):
    cookie = login(client).headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=strict" in cookie


def test_receptie_mag_kentekenlijst_niet_wijzigen(receptie):
    r = receptie.post("/api/permits", json={"plate": "AB-123-C", "holder": "Test", "category": "staff"})
    assert r.status_code == 403
    assert receptie.get("/api/audit").status_code == 403


def test_ongeldig_kenteken_wordt_afgewezen(receptie):
    r = receptie.post("/api/gate/scan", json={"plate": "'; DROP TABLE permits;--", "direction": "in"})
    assert r.status_code == 422


def test_uitloggen(receptie):
    assert receptie.post("/api/auth/logout").status_code == 204
    assert receptie.get("/api/auth/me").status_code == 401


# ---------- regels van de slagboom ----------

def test_gast_met_reservering_mag_binnen(receptie):
    result = scan(receptie, "T-902-BZ")
    assert result["open"] and result["pitch"] == "plek 7"
    assert any(p["plate"] == "T-902-BZ" for p in receptie.get("/api/presence").json())


def test_kenteken_wordt_herkend_ongeacht_schrijfwijze(receptie):
    assert scan(receptie, "t902bz")["open"]


def test_onbekend_kenteken_blijft_buiten(receptie):
    result = scan(receptie, "ZZ-999-Z")
    assert not result["open"] and result["code"] == "unknown"
    assert all(p["plate"] != "ZZ-999-Z" for p in receptie.get("/api/presence").json())


def test_terugkomen_tijdens_het_verblijf_mag(receptie):
    # G-418-KV is al eerder gescand. De uitgang leest niets, dus terugkomen moet gewoon kunnen.
    assert scan(receptie, "G-418-KV")["open"]
    assert scan(receptie, "G-418-KV", at="2026-08-03T22:00:00")["open"]
    rows = [p for p in receptie.get("/api/presence").json() if p["plate"] == "G-418-KV"]
    assert len(rows) == 1 and rows[0]["entered_at"].startswith("2026-08-03T22:00")


def test_te_vroeg_en_afgelopen(receptie):
    assert scan(receptie, "N-264-GT")["code"] == "too_early"
    assert scan(receptie, "D-829-RV")["code"] == "expired"


def test_leverancier_alleen_binnen_tijdvak(receptie):
    assert scan(receptie, "VF-284-T", at="2026-08-01T06:30:00")["open"]
    assert scan(receptie, "VF-284-T", at="2026-08-01T14:00:00")["code"] == "outside_window"


def test_hulpdienst_mag_altijd_door(receptie):
    assert scan(receptie, "12-AMB-3", vehicle_type="ambulance", at="2026-08-01T03:00:00")["open"]


def test_uitgang_leest_geen_kenteken(receptie):
    # Bij de uitgang staat geen camera: het systeem neemt daar geen scans aan.
    r = receptie.post("/api/gate/scan", json={"plate": "G-418-KV", "direction": "out", "at": NOON})
    assert r.status_code == 422
    assert any(p["plate"] == "G-418-KV" for p in receptie.get("/api/presence").json())


# ---------- kentekens verdwijnen uit het systeem ----------

def plates(client, path):
    return {p["plate"] for p in client.get(path).json()}


def test_gast_verdwijnt_24_uur_na_einde_reservering(receptie):
    # De reservering van D-829-RV liep tot en met 31 juli. Tot 24 uur daarna is het kenteken nog bekend.
    assert scan(receptie, "D-829-RV", at="2026-08-01T23:30:00")["code"] == "expired"
    assert scan(receptie, "D-829-RV", at="2026-08-02T00:30:00")["code"] == "unknown"
    assert "D-829-RV" not in plates(receptie, "/api/permits")


def test_gast_blijft_bekend_tijdens_het_verblijf(receptie):
    # G-418-KV is op 31 juli gescand en blijft tot en met 7 augustus geboekt.
    scan(receptie, "T-902-BZ", at="2026-08-07T12:00:00")
    assert "G-418-KV" in plates(receptie, "/api/presence")
    scan(receptie, "MS BT 518", at="2026-08-09T00:30:00", country="D")
    assert "G-418-KV" not in plates(receptie, "/api/presence") | plates(receptie, "/api/permits")


def test_bezoeker_zonder_reservering_verdwijnt_na_24_uur(receptie):
    result = scan(receptie, "ZZ-999-Z")
    receptie.post(f"/api/gate/passages/{result['passage_id']}/decision", json={"open": True})
    scan(receptie, "T-902-BZ", at="2026-08-02T11:00:00")
    assert "ZZ-999-Z" in plates(receptie, "/api/presence")
    scan(receptie, "T-902-BZ", at="2026-08-02T12:30:00")
    assert "ZZ-999-Z" not in plates(receptie, "/api/presence")
    # Een vaste medewerker verdwijnt wel van de lijst met scans, maar blijft in de kentekenlijst.
    assert "P-112-BB" not in plates(receptie, "/api/presence")
    assert "P-112-BB" in plates(receptie, "/api/permits")


def test_receptie_laat_bezoeker_binnen_via_intercom(receptie):
    result = scan(receptie, "ZZ-999-Z")
    r = receptie.post(f"/api/gate/passages/{result['passage_id']}/decision", json={"open": True})
    assert r.status_code == 200 and r.json()["manual"] and r.json()["outcome"] == "granted"
    assert any(p["plate"] == "ZZ-999-Z" for p in receptie.get("/api/presence").json())
    # Een oproep kan maar één keer worden afgehandeld.
    assert receptie.post(f"/api/gate/passages/{result['passage_id']}/decision", json={"open": False}).status_code == 409


def test_offline_passages_synchroniseren(receptie):
    r = receptie.post("/api/gate/sync", json={"items": [
        {"plate": "T-902-BZ", "at": "2026-08-01T13:00:00", "open": True, "reason": "Reservering voor plek 7"},
        {"plate": "ZZ-999-Z", "at": "2026-08-01T13:05:00", "open": False, "manual": True, "reason": "Door receptie geweigerd"},
    ]})
    assert r.json() == {"synced": 2}
    present = {p["plate"] for p in receptie.get("/api/presence").json()}
    assert "T-902-BZ" in present and "ZZ-999-Z" not in present
    passages = receptie.get("/api/passages").json()
    assert all(p["offline"] for p in passages)
    # AVG: wie zonder internet is geweigerd, wordt niet opgeslagen.
    assert "ZZ-999-Z" not in {p["plate"] for p in passages}


def test_geweigerd_kenteken_wordt_niet_bewaard(receptie, bert):
    result = scan(receptie, "ZZ-999-Z")
    assert any(p["plate"] == "ZZ-999-Z" for p in receptie.get("/api/passages").json())  # wacht op de receptie
    r = receptie.post(f"/api/gate/passages/{result['passage_id']}/decision", json={"open": False})
    assert r.status_code == 200 and r.json()["outcome"] == "denied"
    # AVG: na een weigering staat het kenteken nergens meer, ook niet in het auditlog.
    assert "ZZ-999-Z" not in plates(receptie, "/api/passages") | plates(receptie, "/api/presence")
    audit = bert.get("/api/audit").json()
    weigering = next(a for a in audit if a["action"] == "intercom_geweigerd")
    assert "ZZ" not in weigering["detail"]
    assert receptie.post(f"/api/gate/passages/{result['passage_id']}/decision", json={"open": True}).status_code == 404


def test_storing_komt_in_het_auditlog(bert):
    assert bert.post("/api/gate/safety", json={"locked": True, "cause": "stroom"}).status_code == 204
    assert any(a["action"] == "slagboom_vergrendeld" and a["detail"] == "stroom" for a in bert.get("/api/audit").json())


def test_logboek_houdt_bewaartermijn_aan(receptie):
    scan(receptie, "T-902-BZ", at="2026-08-01T10:00:00")
    scan(receptie, "AA-11-BB", vehicle_type="ambulance", at="2026-08-28T09:00:00")
    assert "T-902-BZ" in plates(receptie, "/api/passages")
    scan(receptie, "AA-11-BB", vehicle_type="ambulance", at="2026-08-29T10:30:00")
    assert "T-902-BZ" not in plates(receptie, "/api/passages")


def test_onbeantwoorde_oproep_verdwijnt_na_24_uur(receptie):
    scan(receptie, "ZZ-999-Z", at="2026-08-01T10:00:00")
    scan(receptie, "T-902-BZ", at="2026-08-02T10:30:00")
    assert "ZZ-999-Z" not in plates(receptie, "/api/passages")


# ---------- beheer ----------

def test_beheerder_beheert_kentekenlijst(bert):
    r = bert.post("/api/permits", json={
        "plate": "kx-481-p", "holder": "Pakketdienst", "category": "supplier",
        "vehicle_type": "bestelbus", "window_start": "09:00", "window_end": "17:00",
    })
    assert r.status_code == 201 and r.json()["plate"] == "KX-481-P"
    assert bert.post("/api/permits", json={"plate": "KX481P", "holder": "Dubbel", "category": "staff"}).status_code == 409
    assert scan(bert, "KX-481-P")["open"]
    assert bert.delete(f"/api/permits/{r.json()['id']}").status_code == 204
    # Dezelfde verwijdering via POST, voor hosting die DELETE niet doorlaat.
    r = bert.post("/api/permits", json={"plate": "KX-481-P", "holder": "Opnieuw", "category": "staff"})
    assert bert.post(f"/api/permits/{r.json()['id']}/delete").status_code == 204
    assert bert.post(f"/api/permits/{r.json()['id']}/delete").status_code == 404
    actions = [a["action"] for a in bert.get("/api/audit").json()]
    assert "kenteken_toegevoegd" in actions and "kenteken_verwijderd" in actions


def test_gast_toevoegen_vereist_reservering(bert):
    assert bert.post("/api/permits", json={"plate": "KB-123-D", "holder": "Familie Test", "category": "guest"}).status_code == 422
    r = bert.post("/api/permits", json={
        "plate": "KB-123-D", "holder": "Familie Test", "category": "guest",
        "pitch": "plek 2", "arrival": "2026-08-01", "departure": "2026-08-05",
    })
    assert r.status_code == 201
    assert scan(bert, "KB-123-D")["open"]


def test_reset(receptie):
    scan(receptie, "T-902-BZ")
    assert receptie.post("/api/sim/reset").status_code == 204
    assert receptie.get("/api/passages").json() == []
    assert len(receptie.get("/api/presence").json()) == 3


def test_nieuwe_dienst_zet_verdwenen_gasten_terug(receptie):
    # De klok van de simulatie liep door tot na de reservering: de gast is uit het systeem.
    assert scan(receptie, "D-829-RV", at="2026-08-03T10:00:00")["code"] == "unknown"
    assert receptie.post("/api/sim/reset").status_code == 204
    # Een nieuwe dienst begint weer op 1 augustus, met de gasten van die dag.
    assert scan(receptie, "D-829-RV")["code"] == "expired"
    assert len(receptie.get("/api/permits").json()) == 24


# ---------- slecht weer ----------

def test_veiligheidsvergrendeling_komt_in_het_auditlog(bert):
    assert bert.post("/api/gate/safety", json={"locked": True, "cause": "ijzel"}).status_code == 204
    assert bert.post("/api/gate/safety", json={"locked": False, "cause": "ijzel"}).status_code == 204
    assert bert.post("/api/gate/safety", json={"locked": True, "cause": "storm"}).status_code == 422
    log = [(a["action"], a["detail"]) for a in bert.get("/api/audit").json()]
    assert ("slagboom_vergrendeld", "ijzel") in log and ("slagboom_vrijgegeven", "ijzel") in log


def test_onleesbaar_kenteken_gaat_via_de_intercom(receptie):
    # De camera kon het kenteken niet lezen: de slagboom blijft dicht tot de receptie hem handmatig opent.
    result = scan(receptie, "ONBEKEND")
    assert not result["open"]
    r = receptie.post(f"/api/gate/passages/{result['passage_id']}/decision", json={"open": True})
    assert r.status_code == 200 and r.json()["manual"] and r.json()["outcome"] == "granted"


# ---------- regels van de RDW ----------

def test_nederlands_kenteken_volgt_de_rdw(bert):
    for plate in ("AB-12-CD", "T-90C-BZ", "K-123-QB", "SS-12-BB", "VVD-12-B", "T-902-BZX"):
        r = bert.post("/api/permits", json={"plate": plate, "holder": "Test", "category": "staff"})
        assert r.status_code == 422, plate
    assert bert.post("/api/permits", json={"plate": "KX-481-P", "holder": "Test", "category": "staff"}).status_code == 201
    # Een buitenlands kenteken volgt die regels niet.
    assert bert.post("/api/permits", json={"plate": "AB 123 CD", "country": "I", "holder": "Famiglia Rossi", "category": "staff"}).status_code == 201
