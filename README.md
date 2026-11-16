# Slagboom De Groene Weide

Een 3D-simulatie van idee 1: een slagboom met kentekenherkenning en intercom voor de camping van Boer Bert.
Je kijkt mee als receptie, of rijdt zelf naar de slagboom. De camera bij de ingang leest elk kenteken en de slagboom beslist zelf; blijft hij dicht, dan belt de
bestuurder aan en beslis jij. Bij de uitgang staat geen camera: die slagboom gaat altijd open.

## Starten

Nodig: Docker Desktop, Python 3.12 of nieuwer en Node 20 of nieuwer.

**Alles in Docker (zoals in de cloud)**

```
docker compose up --build
```

Open daarna http://localhost:8080.

Dit werkt alleen als er een ingevuld `.env`-bestand in deze map staat. Bestaat dat nog niet (bijvoorbeeld op
een andere computer), kopieer dan eerst `.env.example` naar `.env` en vul alle waarden in. Kopieer niet over
een bestaande `.env` heen: dan zijn de wachtwoorden weg en start de stack niet meer.

**Ontwikkelen (database in Docker, de rest lokaal)**

```
docker compose up -d db

cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements-dev.txt
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000

cd frontend
npm install
npm run dev
```

Open daarna http://localhost:5173.

## Inloggen

| Account | Rol | Mag |
|---|---|---|
| `receptie` | receptie | een dienst draaien, intercom beantwoorden, overzichten bekijken |
| `bert` | beheerder | alles van de receptie, plus kentekens beheren en het auditlog inzien |

De wachtwoorden staan in `.env` (`SEED_BERT_PASSWORD` en `SEED_RECEPTIE_PASSWORD`). Ze worden alleen gebruikt
wanneer de database nog leeg is.

## Opbouw

```
backend/    Python, FastAPI, SQLAlchemy
  app/models.py     datamodel
  app/rules.py      de beslissing van de slagboom
  app/api.py        alle endpoints
  app/security.py   wachtwoorden, sessies, rollen, aanmeldlimiet, auditlog
  app/seed.py       beginvulling en bewaartermijn
  tests/            28 tests (regels, beveiliging, beheer, slecht weer)
frontend/   TypeScript, React, three.js (react-three-fiber)
  src/sim/          simulatiemotor, draaiboek van een dag, lokale regels (offline)
  src/scene/        de 3D-wereld
  src/ui/           inloggen, camera, intercom, overzichten
docker-compose.yml  database, backend en frontend
```

## Database (PostgreSQL)

| Tabel | Inhoud |
|---|---|
| `users` | accounts met rol, wachtwoordhash en blokkade na mislukte pogingen |
| `reservations` | reserveringen: naam, plek, aankomst en vertrek |
| `permits` | de kentekenlijst: gast (gekoppeld aan een reservering), medewerker of leverancier (met tijdvak) |
| `passages` | logboek van elke passage bij de ingang: tijd, kenteken, uitkomst, reden, wie besliste |
| `presence` | kentekens die bij de ingang zijn gescand en nog in het systeem staan |
| `audit_log` | wie deed wat in het beheer |

Kentekens worden opgeslagen zoals ze geschreven zijn en als sleutel zonder streepjes en spaties, zodat
`T-902-BZ` en `t902bz` hetzelfde voertuig zijn. De database bewaakt zelf de toegestane waarden (rol, richting,
uitkomst) en dat een gast altijd een reservering heeft.

**De database bekijken met pgAdmin 4**

```
docker compose --profile beheer up -d pgadmin
```

Open http://localhost:5050 en log in met `PGADMIN_EMAIL` en `PGADMIN_PASSWORD` uit `.env`. De server
"De Groene Weide" staat al in de lijst; vul bij het verbinden `POSTGRES_PASSWORD` in. pgAdmin start niet mee
met een gewone `docker compose up` en is alleen vanaf deze computer bereikbaar.

## Beveiliging

- Wachtwoorden worden gehasht met scrypt en nooit leesbaar opgeslagen.
- De sessie staat in een cookie die JavaScript niet kan lezen (`HttpOnly`, `SameSite=Strict`, in de cloud `Secure`).
- Na 5 mislukte pogingen is een account 15 minuten geblokkeerd; per adres maximaal 10 pogingen per minuut.
- Twee rollen. Alleen de beheerder mag de kentekenlijst wijzigen en het auditlog zien.
- Wijzigende verzoeken moeten een eigen header meesturen (bescherming tegen CSRF).
- Alle invoer wordt gecontroleerd; zoekopdrachten gaan via SQLAlchemy met parameters (geen SQL-injectie).
- Beveiligingsheaders en een strikte Content-Security-Policy op site en API.
- Beheeracties en beslissingen aan de intercom komen in het auditlog.
- Een kenteken verdwijnt binnen 24 uur na het einde van de reservering uit het systeem (reservering, kenteken en registratie).
  Wie zonder reservering is binnengekomen, verdwijnt 24 uur na het scannen van de lijst met gescande kentekens.
- Passages worden na 28 dagen verwijderd (`RETENTION_DAYS`); in simulatiemodus staat dit uit.
- Geheimen staan in `.env`, niet in de code. In productie start de backend niet zonder `SECRET_KEY`.
- De backend en de database zijn van buitenaf niet bereikbaar; alleen de frontend staat open.

## Slecht weer

Kies in de balk bovenaan het weer: helder, regen, sneeuw, hagel, ijzel of noodweer. Het tabblad "Weer" in het
overzicht laat zien hoe de camera, de slagboom en de intercom ervoor staan.

- **Camera.** Waterdicht (IP66) met een verwarmde lens tegen condens en ijs. Hij blijft bij elk weer lezen;
  bij zware neerslag duurt dat langer, maar hooguit 10 seconden. De leestijd staat bij elke passage in beeld.
- **Veiligheidsvergrendeling.** Na 20 minuten ijzel of bij 8 cm sneeuw rond de slagboom blijven beide slagbomen
  dicht. Voertuigen wachten tot de receptie meldt dat er gestrooid of geruimd is. Vergrendelen en vrijgeven
  komen in het auditlog.
- **Intercom als noodvoorziening.** Leest de camera een kenteken niet binnen 10 seconden (bij noodweer komt dat
  voor), dan belt de bestuurder aan, noemt het kenteken en opent de receptie de slagboom handmatig. De intercom
  filtert wind en neerslag weg.

De regels en getallen staan in `frontend/src/sim/weather.ts`.

## Zonder internet

Zet in de simulatie "Internet valt uit" aan. De slagboom beslist dan zelf met de lokale kopie van de kentekenlijst
(`frontend/src/sim/rules.ts`, dezelfde regels als `backend/app/rules.py`). Zodra de verbinding terug is, worden
de passages alsnog in het logboek gezet.

## Cloud

De drie containers uit `docker-compose.yml` draaien op elke cloud die Docker ondersteunt. Voor een echte
uitrol nog te doen:

1. Zet een domein met https voor de frontend en zet `COOKIE_SECURE=true`.
2. Gebruik een beheerde PostgreSQL met automatische back-ups in plaats van de container.
3. Zet `SECRET_KEY`, `POSTGRES_PASSWORD` en de account-wachtwoorden in de geheimenkluis van de cloud.
4. Zet `SIMULATION_MODE=false`: dan telt de klok van de server, kan het logboek niet worden gereset en geldt de bewaartermijn.

## Tests

```
cd backend
.venv\Scripts\python -m pytest
```

## Aannames

Deze punten staan niet in de opdracht en zijn zelf gekozen; check ze bij Bert:

- Bezoek voor gasten mag naar binnen als naam en plek kloppen met een reservering van vandaag.
- Wie te vroeg komt of van wie de reservering is afgelopen, komt niet met de auto het terrein op.
- Bezorgers zonder afspraak blijven buiten.
- De uitgang leest geen kentekens. Het systeem weet dus niet wie er op het terrein staat, alleen wie er is
  binnengereden. Terugkomen binnen het verblijf (of het tijdvak) mag daarom altijd.
- Een reservering loopt tot en met de vertrekdatum; 24 uur daarna is het kenteken uit het systeem. Vaste
  medewerkers en leveranciers blijven in de kentekenlijst staan.
- De bewaartermijn is 28 dagen (in de documenten staat zowel 4 als 6 weken).
- De vergrendeling bij ijzel of sneeuw geldt voor de ingang en de uitgang, ook voor hulpdiensten: een bevroren
  slagboom kan niet veilig bewegen. De grenzen (8 cm sneeuw, 20 minuten ijzel, 3 uur ijsvrij na strooien) zijn
  zelf gekozen.
- Alle namen en kentekens in de database zijn verzonnen.
