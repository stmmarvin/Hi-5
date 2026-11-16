import { clock, dateLabel, SHIFT_END } from '../sim/clock';
import { answer, backToMenu, clearGate, closeChat, toggleMute, logout, sayToReception, setOnline, setSpeed, setWeather, startShift, useGame, VEHICLE_NAME, type SessionMode } from '../sim/engine';
import { READ_LIMIT, seconds, WEATHER, WEATHER_ORDER, type Weather } from '../sim/weather';
import { DriveHud } from './DriveHud';
import { DriveSetup } from './DriveSetup';
import { Plate } from './Plate';

const COUNTRY_NAME = { NL: 'Nederland', D: 'Duitsland', B: 'België' };

export function TopBar() {
  const user = useGame((s) => s.user);
  const phase = useGame((s) => s.phase);
  const minute = useGame((s) => s.minute);
  const speed = useGame((s) => s.speed);
  const online = useGame((s) => s.online);
  const pendingSync = useGame((s) => s.pendingSync);
  const muted = useGame((s) => s.muted);
  const mode = useGame((s) => s.mode);
  const weather = useGame((s) => s.weather);
  const playing = phase === 'playing';

  return (
    <header className="kop">
      <h1>Slagboom De Groene Weide</h1>
      <div className="kop-midden">
        <div className="klok">
          <span>{dateLabel(minute)}</span>
          <strong>{clock(minute)}</strong>
        </div>
        {playing && <span className="modus-label">{mode === 'zelf_rijden' ? 'Zelf rijden' : 'Automatische kentekenherkenning'}</span>}
        {playing && <button type="button" className="knop klein donker" onClick={backToMenu}>Kies andere modus</button>}
        {playing && <button type="button" className="knop klein donker" aria-pressed={!muted} onClick={toggleMute}>{muted ? 'Geluid uit' : 'Geluid aan'}</button>}
        {playing && (
          <label className="schakel">
            Weer
            <select className="weer-keuze" value={weather} onChange={(e) => setWeather(e.target.value as Weather)}>
              {WEATHER_ORDER.map((kind) => (
                <option key={kind} value={kind}>{WEATHER[kind].label} ({WEATHER[kind].temperature} °C)</option>
              ))}
            </select>
          </label>
        )}
        {playing && mode === 'simulatie' && (
          <>
            <button type="button" className="knop klein donker" onClick={() => setSpeed(speed === 1 ? 2 : 1)}>
              {speed === 1 ? 'Dubbele snelheid' : 'Normale snelheid'}
            </button>
            <label className="schakel">
              <input type="checkbox" checked={!online} onChange={(e) => void setOnline(!e.target.checked)} />
              <span>Internet valt uit{pendingSync > 0 ? ` (${pendingSync} wachten)` : ''}</span>
            </label>
          </>
        )}
      </div>
      <div className="kop-gebruiker">
        <span>{user?.display_name} ({user?.role})</span>
        <button type="button" className="knop klein donker" onClick={() => void logout()}>Log uit</button>
      </div>
    </header>
  );
}

/** Camerabeeld, intercom en terugkoppeling: liggen over het 3D-beeld. */
export function GateCards() {
  const readout = useGame((s) => s.readout);
  const call = useGame((s) => s.call);
  const chat = useGame((s) => s.chat);
  const playerVehicle = useGame((s) => s.playerVehicle);
  const mode = useGame((s) => s.mode);
  const queue = useGame((s) => s.queue);
  const online = useGame((s) => s.online);
  const notice = useGame((s) => s.notice);
  const phase = useGame((s) => s.phase);
  const gateLock = useGame((s) => s.gateLock);
  const snowCm = useGame((s) => s.snowCm);
  const weather = useGame((s) => s.weather);
  if (phase !== 'playing') return null;
  // De intercom filtert wind en regen weg, zodat het gesprek ook bij noodweer verstaanbaar blijft.
  const line = weather === 'helder' ? '' : 'Verbinding helder: de intercom filtert wind en neerslag weg.';

  const waiting = [
    queue.in > 1 && `${queue.in - 1} in de rij voor de ingang`,
    queue.out > 1 && `${queue.out - 1} in de rij voor de uitgang`,
  ].filter(Boolean).join(', ');

  return (
    <>
      <div className="meldingen" aria-live="polite">
        {!online && <p className="melding geel">Geen internet. De slagboom beslist zelf met de lokale kentekenlijst; het logboek volgt later.</p>}
        {gateLock && (
          <p className="melding rood" role="alert">
            Veiligheidsvergrendeling: {gateLock === 'ijzel' ? 'ijzel op de slagboom' : `${snowCm} cm sneeuw bij de slagboom`}.
            {' '}De slagbomen blijven dicht om schade en ongelukken te voorkomen.
            {mode === 'simulatie'
              ? <button type="button" className="knop klein" onClick={clearGate}>{gateLock === 'ijzel' ? 'Gestrooid: geef de slagboom vrij' : 'Sneeuw geruimd: geef de slagboom vrij'}</button>
              : ' De beheerder is onderweg om de slagboom vrij te maken.'}
          </p>
        )}
        {notice && <p className="melding">{notice}</p>}
        {waiting && <p className="melding stil">{waiting}</p>}
      </div>

      <div className={`kaarten${playerVehicle ? ' met-hud' : ''}`}>
        {mode === 'zelf_rijden' && !playerVehicle && <DriveSetup />}
        {readout && (
        <section className="kaart camera" aria-label="Camera">
            <>
              <p className="kaart-kop">Camera bij de ingang</p>
              <Plate plate={readout.plate} country={readout.country} large />
              <p className="kaart-sub">
                {readout.model} ({VEHICLE_NAME[readout.type]}), kenteken uit {COUNTRY_NAME[readout.country]}
                {readout.holder && readout.holder !== 'Onbekend' ? `. Herkend: ${readout.holder}` : ''}
              </p>
              {readout.status === 'reading' && readout.note && <p className="kaart-sub">{readout.note}</p>}
              {readout.status === 'done' && readout.readSeconds !== undefined && (
                <p className="kaart-sub">
                  {readout.readSeconds >= READ_LIMIT
                    ? `Niet gelezen binnen ${READ_LIMIT} seconden: de intercom neemt het over.`
                    : `Gelezen in ${seconds(readout.readSeconds)} (norm: binnen ${READ_LIMIT} seconden).`}
                </p>
              )}
              {readout.status === 'reading'
                ? <p className="oordeel">Kenteken lezen…</p>
                : <p className={`oordeel ${readout.open ? 'goed' : 'fout'}`}>
                    {readout.open ? 'Slagboom open' : 'Slagboom blijft dicht'}: {readout.reason}
                  </p>}
            </>
        </section>
        )}

        {chat && (
          <section className="kaart intercom gesprek" role="alertdialog" aria-label="Gesprek met de receptie">
            <p className="kaart-kop">Intercom: receptie{chat.lines.length ? ` (${chat.name})` : ''}</p>
            <div className="gesprek-regels" aria-live="polite">
              {chat.lines.map((line, i) => (
                <p key={i} className={`regel ${line.who}`}><span>{line.who === 'jij' ? 'Jij' : chat.name}</span>{line.text}</p>
              ))}
            </div>
            <p className="kaart-sub">{chat.status}{line && <small className="lijn">{line}</small>}</p>
            {chat.options.length > 0 && (
              <div className="gesprek-keuzes">
                {chat.options.map((option, i) => (
                  <button key={option} type="button" className="knop" onClick={() => sayToReception(i)}><kbd>{i + 1}</kbd> “{option}”</button>
                ))}
              </div>
            )}
            {chat.done && <button type="button" className="knop klein" onClick={closeChat}>Sluit het gesprek</button>}
          </section>
        )}

        {call && (
          <section className="kaart intercom" role="alertdialog" aria-label="Intercom">
            <p className="kaart-kop">Intercom: de bestuurder belt aan</p>
            <p className="citaat">“{call.message}”</p>
            <p className="kaart-sub">
              <Plate plate={call.plate} country={call.country} /> {call.reason}
              {call.holder !== 'Onbekend' ? `. Kenteken van ${call.holder}.` : '.'}
              {line && <small className="lijn">{line}</small>}
            </p>
            <div className="rijtje">
              <button type="button" className="knop goed" onClick={() => answer(true)}>Open slagboom</button>
              <button type="button" className="knop fout" onClick={() => answer(false)}>Laat niet binnen</button>
            </div>
          </section>
        )}

      </div>
      <DriveHud />
    </>
  );
}

/** Beginscherm en eindscherm van een dienst. */
export function Overlay() {
  const phase = useGame((s) => s.phase);
  const notice = useGame((s) => s.notice);
  if (phase === 'playing') return null;

  if (phase === 'ready') {
    return (
      <div className="overlay">
        <div className="overlay-kaart">
          <h2>Kies je simulatie</h2>
          <p>De omgeving blijft actief als simulatie. Kies of je de verkeersstroom observeert of zelf naar de slagboom rijdt.</p>
          <div className="modus-keuze">
            <button type="button" className="modus-kaart" onClick={() => void startShift('simulatie' satisfies SessionMode)}>
              <strong>Automatische kentekenherkenning</strong>
              <span>Bekijk realistische aankomende auto’s, kentekenherkenning en intercomsituaties.</span>
            </button>
            <button type="button" className="modus-kaart" onClick={() => void startShift('zelf_rijden' satisfies SessionMode)}>
              <strong>Zelf rijden</strong>
              <span>Stap in, rijd en stuur zelf naar de slagboom, met zicht vanuit de auto en geluid.</span>
            </button>
          </div>
          <p className="klein-tekst">De simulatie loopt van 06:00 tot {clock(SHIFT_END)}. Sleep in het beeld om rond te kijken.</p>
          {notice && <p className="fout">{notice}</p>}
        </div>
      </div>
    );
  }

  return null;
}
