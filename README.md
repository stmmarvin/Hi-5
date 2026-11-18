# Slagboom De Groene Weide

Een 3D-simulatie van idee 1: een slagboom met kentekenherkenning en intercom voor de camping van Boer Bert.
Je kijkt mee als receptie, of rijdt zelf naar de slagboom. De camera bij de ingang leest elk kenteken en de slagboom beslist zelf; blijft hij dicht, dan belt de
bestuurder aan en beslis jij. Bij de uitgang staat geen camera: die slagboom gaat altijd open.

## Installeren

Je hebt twee manieren om het project te draaien. Kies **A** als je de simulatie alleen wilt gebruiken of laten
zien. Kies **B** als je aan de code gaat werken.

### Wat je nodig hebt

| Programma | Nodig voor | Controleren |
|---|---|---|
| [Git](https://git-scm.com/downloads) | de code ophalen | `git --version` |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | A en B | `docker --version` |
| [Python](https://www.python.org/downloads/) 3.12 of nieuwer | alleen B | `python --version` |
| [Node.js](https://nodejs.org/) 20 of nieuwer | alleen B | `node --version` |

Start Docker Desktop en wacht tot het zegt dat het draait, voordat je verder gaat. Gebruik op Windows
**PowerShell** voor de commando's hieronder; in Git Bash mislukt het bouwen van de containers soms.

### Stap 1: de code ophalen

```
git clone https://github.com/stmmarvin/Hi-5.git
cd Hi-5
```

### Stap 2: het bestand `.env` maken

In `.env` staan de wachtwoorden. Dat bestand zit bewust niet in git, dus iedereen maakt zijn eigen versie.

```
copy .env.example .env
```

(Op Mac of Linux: `cp .env.example .env`.)

Genereer daarna je eigen wachtwoorden. Dit commando maakt ze willekeurig aan en toont ze alleen op je scherm:

```powershell
foreach ($naam in 'POSTGRES_PASSWORD','SECRET_KEY','SEED_BERT_PASSWORD','SEED_RECEPTIE_PASSWORD') {
  $b = New-Object byte[] 36
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  "$naam=" + ([Convert]::ToBase64String($b) -replace '\+','-' -replace '/','_')
}
```

Op Mac of Linux:

```bash
for naam in POSTGRES_PASSWORD SECRET_KEY SEED_BERT_PASSWORD SEED_RECEPTIE_PASSWORD; do
  echo "$naam=$(openssl rand -base64 36 | tr '+/' '-_')"
done
```

Open `.env` in een editor en vervang deze vier regels door de regels uit het commando:

| Regel | Waarvoor |
|---|---|
| `POSTGRES_PASSWORD` | het wachtwoord van de database |
| `SECRET_KEY` | de geheime sleutel van de backend |
| `SEED_BERT_PASSWORD` | het wachtwoord waarmee je straks inlogt als `bert` |
| `SEED_RECEPTIE_PASSWORD` | het wachtwoord waarmee je straks inlogt als `receptie` |

Iedereen genereert eigen wachtwoorden. Zet ze niet in git of in de groepsapp.

Laat `COOKIE_SECURE=false` en `POSTGRES_PORT=5433` staan. `PGADMIN_PASSWORD` hoef je alleen in te vullen als je
pgAdmin wilt gebruiken (zie verderop).

Let op twee dingen:

- Kopieer `.env.example` niet opnieuw over een bestaande `.env` heen: dan zijn je wachtwoorden weg.
- De wachtwoorden worden vastgelegd bij de eerste start. Pas je ze daarna aan in `.env`, dan verandert er niets
  (of de database is niet meer bereikbaar). Zie "Als het niet werkt" om opnieuw te beginnen.

### Stap 3A: alles in Docker (het makkelijkst)

```
docker compose up -d --build
```

De eerste keer duurt dit een paar minuten. Open daarna http://localhost:8080.

| Wat je wilt | Commando |
|---|---|
| Stoppen | `docker compose down` |
| Weer starten | `docker compose up -d` |
| Nieuwe code binnengehaald (`git pull`) | `docker compose up -d --build` |
| Kijken wat er misgaat | `docker compose logs backend` |

### Stap 3B: ontwikkelen (database in Docker, de rest op je eigen computer)

Zo zie je een wijziging in de code meteen, zonder opnieuw te bouwen. Je hebt drie vensters nodig.

Venster 1, de database:

```
docker compose up -d db
```

Venster 2, de backend (Windows):

```
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements-dev.txt
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
```

Op Mac of Linux is het `.venv/bin/pip` en `.venv/bin/python`. De regels met `venv` en `pip` hoef je alleen de
eerste keer te doen.

Venster 3, de frontend:

```
cd frontend
npm install
npm run dev
```

Open daarna http://localhost:5173. Draait A nog, stop die dan eerst met `docker compose down`.

### Stap 4: inloggen

| Account | Rol | Mag |
|---|---|---|
| `receptie` | receptie | een dienst draaien, intercom beantwoorden, overzichten bekijken |
| `bert` | beheerder | alles van de receptie, plus kentekens beheren en het auditlog inzien |

De wachtwoorden zijn de twee die je in stap 2 in `.env` hebt gezet. Kies na het inloggen "Automatische
kentekenherkenning" (jij bent de receptie) of "Zelf rijden".

### Als het niet werkt

| Wat je ziet | Oplossing |
|---|---|
| `Zet POSTGRES_PASSWORD in .env` of `Zet SECRET_KEY in .env` | Er is geen `.env`, of die regel is leeg. Doe stap 2. |
| `error during connect` of `cannot connect to the Docker daemon` | Docker Desktop draait niet. Start het en wacht tot het klaar is. |
| Het bouwen stopt met een melding over `fs.read` of extra rechten | Je zit in Git Bash. Gebruik PowerShell. |
| `port is already allocated` bij 8080 | Een ander programma gebruikt die poort. Sluit dat programma en start opnieuw. |
| Inloggen lukt, maar je staat meteen weer op het inlogscherm | In `.env` moet `COOKIE_SECURE=false` staan. Start daarna opnieuw met `docker compose up -d`. |
| "Gebruikersnaam of wachtwoord klopt niet" terwijl het wachtwoord in `.env` staat | Het wachtwoord is na de eerste start aangepast. Begin opnieuw, zie hieronder. |
| "Dit account is tijdelijk geblokkeerd" | Vijf keer fout ingelogd. Wacht 15 minuten of begin opnieuw. |
| De 3D-wereld blijft leeg of hapert | Gebruik een recente Chrome, Edge of Firefox en zet hardwareversnelling aan. |

**Opnieuw beginnen met een lege database.** Dit gooit alle gegevens weg en zet de wachtwoorden uit `.env`
opnieuw:

```
docker compose down -v
docker compose up -d --build
```

## Opbouw

```
backend/    Python, FastAPI, SQLAlchemy
  app/models.py     datamodel
  app/rules.py      de beslissing van de slagboom
  app/api.py        alle endpoints
  app/security.py   wachtwoorden, sessies, rollen, aanmeldlimiet, auditlog
  app/seed.py       beginvulling en bewaartermijn
  tests/            29 tests (regels, beveiliging, beheer, slecht weer, RDW-regels)
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

Vul eerst `PGADMIN_PASSWORD` in `.env` in (zelf verzinnen). Open daarna http://localhost:5050 en log in met
`PGADMIN_EMAIL` en `PGADMIN_PASSWORD` uit `.env`. De server
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
- AVG: een kenteken dat wordt geweigerd, wordt niet bewaard. Zolang de receptie de intercom nog niet heeft
  beantwoord, staat de passage als "wacht op receptie" in het logboek. Bij een weigering verdwijnt hij meteen, en
  het auditlog legt de weigering vast zonder kenteken. Weigeringen zonder internet worden niet gesynchroniseerd.
  Een oproep die niemand beantwoordt, verdwijnt na 24 uur.
- Er worden geen camerabeelden of foto's van kentekens opgeslagen, alleen het gelezen kenteken als tekst.
- Het logboek houdt een bewaartermijn aan van 28 dagen (`RETENTION_DAYS`, in de PHP-versie `retention_days`).
  Oudere passages worden bij elke scan verwijderd.
- Dit volgt de lijn van de Autoriteit Persoonsgegevens over kentekenherkenning
  ([cameratoezicht in het verkeer](https://www.autoriteitpersoonsgegevens.nl/themas/cameratoezicht/cameratoezicht-in-het-verkeer)):
  scannen mag, maar een foto van elk kenteken bewaren niet. Een kenteken zonder treffer wordt direct vernietigd,
  en een treffer wordt niet langer bewaard dan nodig. Die pagina gaat over de politie; een camping valt onder de
  AVG, waar dezelfde uitgangspunten gelden: noodzakelijk, relevant en niet bovenmatig.
- Passages worden na 28 dagen verwijderd (`RETENTION_DAYS`); in simulatiemodus staat dit uit.
- Geheimen staan in `.env`, niet in de code. In productie start de backend niet zonder `SECRET_KEY`.
- De backend en de database zijn van buitenaf niet bereikbaar; alleen de frontend staat open.

## Kentekens scannen met de webcam

Open in het overzicht het tabblad "Webcam". De camera gaat vanzelf aan (de eerste keer vraagt de browser om
toestemming) en toont één kentekenbalk. Houd een kenteken in die balk; er is geen knop nodig:

1. Zolang de balk geel knippert, scant de camera.
2. Wordt hetzelfde kenteken twee keer achter elkaar gelezen, dan wordt de balk groen, zoekt het systeem het op in
   de boekingen en rijdt de auto in de simulatie naar de slagboom.
3. Hetzelfde kenteken wordt daarna 25 seconden niet opnieuw gestuurd.
4. Bij "Zelf rijden" rijd alleen jij: de webcam laat dan alleen zien of het kenteken geboekt is.

Kentekens uit 31 Europese landen worden herkend. Het land volgt uit de landcode op de blauwe band, de kleur van de
plaat (geel is Nederland of Luxemburg) en de vorm van het kenteken. Sommige landen hebben precies dezelfde vorm
(Finland en Hongarije: ABC-123); is de band dan niet leesbaar, dan kan de receptie het land verbeteren onder
"Verkeerd gelezen". Het beeld blijft op de computer; er wordt niets verstuurd of opgeslagen.

Nederlandse kentekens volgen de regels van de RDW
([cijfers en letters op de kentekenplaat](https://www.rdw.nl/de-kentekenplaat/cijfers-en-letters-op-de-kentekenplaat)):
de veertien zijcodes, geen C en Q, sinds 1978 geen klinkers, en geen combinaties als SS, SD, PVV of VVD. Dat geldt
voor de camera én voor elk kenteken dat je zelf invoert, ook in de backend. De formaten staan in
`frontend/src/sim/plates.ts` en `backend/app/schemas.py`.

## Zelf rijden: AI-camera en plattegrond

Tijdens het rijden staat rechts het beeld van de AI-camera op de paal bij de ingang. Je ziet je eigen auto
aankomen, met een kader om de kentekenplaat, een uitvergroting van de plaat en de stappen die de herkenning
doorloopt: voertuig gedetecteerd, kentekenplaat gevonden, tekens lezen, land bepalen en boeking controleren.
Daaronder staat een plattegrond van de camping met jouw auto in het midden (de camping ligt boven, de openbare
weg onder) en de slagbomen in rood (dicht) of groen (open).

Je kiest een eigen auto of rijdt als **politie, ambulance of brandweer**. Een hulpdienst heeft een eigen kenteken,
hoeft niet in de kentekenlijst te staan en de slagboom gaat altijd open; bij ijzel of te veel sneeuw blijft de
veiligheidsvergrendeling gelden. Met L zet je zwaailicht en sirene aan. Sturen doe je met A en D of de pijltjes, en
van binnen ook door met de muis over het beeld te slepen.

De maximumsnelheid is 30 km/u op de weg en de oprit en 15 km/u op het terrein (voorbij de slagboom); voor hulpdiensten geldt geen limiet. Het bord
naast de snelheidsmeter toont wat er geldt; rijd je het terrein op, dan remt de auto vanzelf af naar 15.
Aanpassen kan in `speedLimit` in `frontend/src/sim/engine.ts`.

## Parkeerplaats en camping

Er is één slagboom, bij de ingang. Daarachter ligt links van de weg een grote parkeerplaats voor bezoekers met 32
vakken. Bezoekers en leveranciers gaan daarheen; gasten, medewerkers en hulpdiensten rijden door naar de camping.

## Storingen

Kies in de automatische simulatie bij **Storing** wat er uitvalt.

- **Stroom valt uit.** Camera, slagboom en intercom werken 60 simulatieminuten door op de noodaccu. Daarna staan de
  uitgang open, en controleert een medewerker bij de ingang de lokale lijst en opent met de hand.
- **Slagboom defect.** De camera en de beslissing werken nog, maar een medewerker opent de ingang met de hand.
- **Server of internet weg.** De kentekenlijst en de nog te versturen passages staan lokaal in de browser, ook na
  opnieuw laden. Uitloggen wist ze. De webpagina zelf moet nog wel te laden zijn.

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

Zet in de automatische simulatie of bij "Zelf rijden" "Internet valt uit" aan. De slagboom beslist dan zelf met de
lokale kopie van de kentekenlijst (`frontend/src/sim/rules.ts`, dezelfde regels als `backend/app/rules.py`). Bij
"Zelf rijden" toont de AI-camera dat hij lokaal controleert. Zodra de verbinding terug is, worden de passages alsnog
in het logboek gezet.

## Delen met het team

Draait de site op een computer, dan maakt deze stap er een tijdelijke https-link van:

```powershell
docker compose --profile team up -d tunnel
docker compose logs tunnel
```

In de logregels staat een adres dat eindigt op `trycloudflare.com`. Teamleden openen dat en loggen in met `bert` of
`receptie`. De link werkt zolang de computer en de tunnel aan staan, en verandert bij elke herstart. Stoppen doe je
met `docker compose stop tunnel`. Iedereen met de link ziet het inlogscherm, dus gebruik sterke wachtwoorden.

Via de link gelden de wachtwoorden uit de `.env` van de computer waarop de tunnel draait. De wachtwoorden uit je
eigen `.env` gebruik je alleen voor je eigen lokale installatie.

## Cloud

De drie containers uit `docker-compose.yml` draaien op elke cloud die Docker ondersteunt. Voor een echte
uitrol nog te doen:

1. Zet een domein met https voor de frontend en zet `COOKIE_SECURE=true`.
2. Gebruik een beheerde PostgreSQL met automatische back-ups in plaats van de container.
3. Zet `SECRET_KEY`, `POSTGRES_PASSWORD` en de account-wachtwoorden in de geheimenkluis van de cloud.
4. Zet `SIMULATION_MODE=false`: dan telt de klok van de server, kan het logboek niet worden gereset en geldt de bewaartermijn.

## Tests

Hiervoor heb je de installatie van stap 3B nodig (de map `backend/.venv`). De tests gebruiken een eigen
database in het geheugen; Docker hoeft niet te draaien.

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
