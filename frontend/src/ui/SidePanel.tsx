import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { isoDate, momentLabel, shortDate, timeOf } from '../sim/clock';
import { cleanDutchPlateInput, clearGate, reloadPermits, sendCustom, useGame } from '../sim/engine';
import { heaterOn, READ_LIMIT, seconds, SNOW_LOCK_CM, WEATHER } from '../sim/weather';
import type { NewPermit, Permit } from '../types';
import { CATEGORY, Plate } from './Plate';
import { WebcamScanner } from './Webcam';

type Tab = 'binnen' | 'camera' | 'logboek' | 'lijst' | 'weer' | 'regels';

export function SidePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('lijst');
  const count = useGame((s) => s.presence.length);
  const mode = useGame((s) => s.mode);
  const tabs: [Tab, string][] = [
    ...(mode === 'simulatie' ? [['lijst', 'Kentekenlijst'] as [Tab, string]] : []),
    ['camera', 'Webcam'],
    ['binnen', `Gescand bij de ingang (${count})`],
    ['logboek', 'Logboek'],
    ['weer', 'Weer'],
    ['regels', 'Regels'],
  ];

  useEffect(() => {
    if (mode === 'zelf_rijden' && tab === 'lijst') setTab('camera');
  }, [mode, tab]);

  return (
    <aside className={`paneel lade${open ? ' open' : ''}`} aria-label="Overzicht" inert={!open}>
      <div className="lade-kop">
        <h2>Overzicht</h2>
        <button type="button" className="lade-sluit" onClick={onClose} aria-label="Sluit het overzicht">✕</button>
      </div>
      <div className="tabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      <div className="tab-inhoud">
        {tab === 'lijst' && <PermitList />}
        {tab === 'camera' && <WebcamScanner />}
        {tab === 'binnen' && <PresenceList />}
        {tab === 'logboek' && <LogList />}
        {tab === 'weer' && <WeatherStatus />}
        {tab === 'regels' && <Rules />}
      </div>
    </aside>
  );
}

function allowed(permit: Permit): string {
  if (permit.category === 'guest') return `${shortDate(permit.arrival!)} t/m ${shortDate(permit.departure!)}`;
  if (permit.window_start && permit.window_end) return `${permit.window_start.slice(0, 5)} tot ${permit.window_end.slice(0, 5)}`;
  return 'Altijd';
}

function PermitList() {
  const permits = useGame((s) => s.permits);
  const admin = useGame((s) => s.user?.role === 'beheerder');
  const playing = useGame((s) => s.phase === 'playing');
  const [search, setSearch] = useState('');
  const [custom, setCustom] = useState('');
  const [hint, setHint] = useState('');

  const needle = search.trim().toLowerCase();
  const shown = permits.filter((p) => !needle
    || `${p.holder} ${p.plate} ${p.pitch ?? ''}`.toLowerCase().includes(needle)
    || p.plate_key.toLowerCase().includes(needle.replace(/[^a-z0-9]/g, '')));

  async function remove(permit: Permit) {
    if (!window.confirm(`${permit.plate} van ${permit.holder} verwijderen uit de kentekenlijst?`)) return;
    try {
      await api.removePermit(permit.id);
      await reloadPermits();
    } catch (err) {
      setHint(err instanceof Error ? err.message : 'Verwijderen is niet gelukt.');
    }
  }

  function send(event: FormEvent) {
    event.preventDefault();
    const problem = sendCustom(custom);
    setHint(problem);
    if (!problem) setCustom('');
  }

  return (
    <>
      <label className="zoek">
        Zoek op naam, plek of kenteken
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="bijvoorbeeld Jansen of plek 7" />
      </label>
      <table>
        <thead><tr><th>Kenteken</th><th>Wie</th><th>Mag binnen</th>{admin && <th><span className="verborgen">Verwijderen</span></th>}</tr></thead>
        <tbody>
          {shown.map((p) => (
            <tr key={p.id}>
              <td><Plate plate={p.plate} country={p.country} /></td>
              <td>{p.holder}<small>{CATEGORY[p.category]}{p.pitch ? `, ${p.pitch}` : ''}</small></td>
              <td>{allowed(p)}</td>
              {admin && <td><button type="button" className="knop klein" onClick={() => void remove(p)} aria-label={`Verwijder ${p.plate}`}>Verwijder</button></td>}
            </tr>
          ))}
        </tbody>
      </table>
      {shown.length === 0 && <p className="leeg">Geen kenteken of reservering gevonden voor “{search}”.</p>}

      {playing && (
        <form className="blok" onSubmit={send}>
          <label>
            Stuur zelf een kenteken naar de slagboom
            <div className="rijtje">
              <input className="kenteken-invoer" value={custom} onChange={(e) => setCustom(cleanDutchPlateInput(e.target.value))} placeholder="N-264-GT" maxLength={14} />
              <button type="submit" className="knop">Laat aankomen</button>
            </div>
          </label>
        </form>
      )}
      {hint && <p className="fout">{hint}</p>}
      {admin ? <AddPermit /> : <p className="klein-tekst">Alleen de beheerder kan kentekens toevoegen of verwijderen.</p>}
    </>
  );
}

function AddPermit() {
  const minute = useGame((s) => s.minute);
  const [category, setCategory] = useState<NewPermit['category']>('supplier');
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = (name: string) => String(data.get(name) ?? '').trim();
    const permit: NewPermit = { plate: text('plate'), holder: text('holder'), category, vehicle_type: text('vehicle') as NewPermit['vehicle_type'] };
    if (category === 'guest') {
      Object.assign(permit, { pitch: text('pitch'), arrival: text('arrival'), departure: text('departure') });
    } else if (text('start') && text('end')) {
      Object.assign(permit, { window_start: text('start'), window_end: text('end') });
    }
    try {
      const saved = await api.addPermit(permit);
      await reloadPermits();
      form.reset();
      setMessage(`${saved.plate} is toegevoegd.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Toevoegen is niet gelukt.');
    }
  }

  return (
    <form className="blok nieuw" onSubmit={submit}>
      <h3>Kenteken toevoegen</h3>
      <label>Kenteken<input name="plate" className="kenteken-invoer" required maxLength={14} onInput={(event) => { event.currentTarget.value = cleanDutchPlateInput(event.currentTarget.value); }} /></label>
      <label>Naam<input name="holder" required minLength={2} maxLength={80} /></label>
      <label>Soort
        <select value={category} onChange={(e) => setCategory(e.target.value as NewPermit['category'])}>
          <option value="supplier">Leverancier</option>
          <option value="staff">Medewerker</option>
          <option value="guest">Gast</option>
        </select>
      </label>
      <label>Voertuig
        <select name="vehicle" defaultValue="auto">
          <option value="auto">Personenauto</option>
          <option value="camper">Camper</option>
          <option value="bestelbus">Bestelbus</option>
          <option value="vrachtwagen">Vrachtwagen</option>
        </select>
      </label>
      {category === 'guest' ? (
        <>
          <label>Plek<input name="pitch" required maxLength={40} placeholder="plek 12" /></label>
          <label>Aankomst<input name="arrival" type="date" required defaultValue={isoDate(minute)} /></label>
          <label>Vertrek<input name="departure" type="date" required defaultValue={isoDate(minute + 7 * 1440)} /></label>
        </>
      ) : (
        <>
          <label>Tijdvak van<input name="start" type="time" /></label>
          <label>Tijdvak tot<input name="end" type="time" /></label>
        </>
      )}
      <button type="submit" className="knop">Voeg toe</button>
      {message && <p className="klein-tekst" role="status">{message}</p>}
    </form>
  );
}

function PresenceList() {
  const presence = useGame((s) => s.presence);
  const minute = useGame((s) => s.minute);
  if (!presence.length) return <p className="leeg">Er staan nu geen gescande kentekens in het systeem.</p>;
  return (
    <>
      <div className="tab-kop">
        <p>Elk kenteken dat bij de ingang binnenrijdt, wordt geregistreerd. De uitgang leest geen kentekens, dus deze lijst zegt niet wie er nu op het terrein staat.</p>
      </div>
      <table>
      <thead><tr><th>Kenteken</th><th>Wie</th><th>Laatst binnengereden</th></tr></thead>
      <tbody>
        {presence.map((p) => (
          <tr key={p.id}>
            <td><Plate plate={p.plate} country={p.country} /></td>
            <td>{p.holder}<small>{CATEGORY[p.category] ?? p.category}{p.pitch ? `, ${p.pitch}` : ''}</small></td>
            <td>{momentLabel(p.entered_at, minute)}</td>
          </tr>
        ))}
      </tbody>
      </table>
    </>
  );
}

function LogList() {
  const log = useGame((s) => s.log);
  return (
    <>
      <div className="tab-kop">
        <p>Elke passage bij de ingang wordt vastgelegd in de PostgreSQL-database. De uitgang legt niets vast.</p>
      </div>
      {log.length === 0 ? <p className="leeg">Nog geen passages in deze dienst.</p> : (
        <table>
          <thead><tr><th>Tijd</th><th>Kenteken</th><th>Wie</th><th>Wat gebeurde er</th></tr></thead>
          <tbody>
            {log.map((p) => (
              <tr key={p.id}>
                <td>{timeOf(p.occurred_at)}</td>
                <td><Plate plate={p.plate} country={p.country} /></td>
                <td>{p.holder}<small>{CATEGORY[p.category] ?? p.category}</small></td>
                <td>
                  <span className={`uitslag ${p.outcome === 'granted' ? 'goed' : p.outcome === 'denied' ? 'fout' : ''}`}>
                    {p.outcome === 'pending' ? `Wacht op receptie: ${p.reason}` : p.outcome === 'granted' && !p.manual ? `Binnengereden. ${p.reason}` : p.reason}
                  </span>
                  {p.offline && <small>Zonder internet afgehandeld, later vastgelegd</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

/** Hoe de camera, de slagboom en de intercom er bij dit weer voor staan. */
function WeatherStatus() {
  const weather = useGame((s) => s.weather);
  const snowCm = useGame((s) => s.snowCm);
  const gateLock = useGame((s) => s.gateLock);
  const lastRead = useGame((s) => s.lastRead);
  const mode = useGame((s) => s.mode);
  const info = WEATHER[weather];
  return (
    <>
      <div className="tab-kop">
        <p>Kies het weer in de balk bovenaan. Hier zie je wat de apparatuur bij de slagboom ermee doet.</p>
      </div>
      <table>
        <tbody>
          <tr><th scope="row">Weer</th><td>{info.label}, {info.temperature} °C</td></tr>
          <tr>
            <th scope="row">Camera</th>
            <td>
              In bedrijf. Waterdicht (IP66).
              <small>Lensverwarming {heaterOn(weather) ? 'aan: geen condens of ijs op de lens' : 'uit: niet nodig bij dit weer'}</small>
            </td>
          </tr>
          <tr>
            <th scope="row">Laatste kenteken</th>
            <td>
              {!lastRead ? 'Nog geen voertuig gelezen.' : lastRead.read
                ? `Gelezen in ${seconds(lastRead.seconds)}`
                : `Niet gelezen binnen ${READ_LIMIT} seconden; afgehandeld via de intercom`}
              <small>Norm: binnen {READ_LIMIT} seconden, ook bij zware neerslag</small>
            </td>
          </tr>
          <tr>
            <th scope="row">Sneeuw bij de slagboom</th>
            <td>{snowCm} cm<small>Vanaf {SNOW_LOCK_CM} cm vergrendelt de slagboom</small></td>
          </tr>
          <tr>
            <th scope="row">Slagboom</th>
            <td>
              <span className={`uitslag ${gateLock ? 'fout' : 'goed'}`}>
                {gateLock ? `Vergrendeld door ${gateLock}` : 'Vrij'}
              </span>
              {gateLock && mode === 'simulatie' && <button type="button" className="knop klein" onClick={clearGate}>Vrijgemaakt: geef de slagboom vrij</button>}
            </td>
          </tr>
          <tr>
            <th scope="row">Intercom</th>
            <td>In bedrijf.<small>Filtert wind en neerslag weg, zodat het gesprek verstaanbaar blijft</small></td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

function Rules() {
  return (
    <div className="regels">
      <h3>Dit doet de slagboom zelf</h3>
      <ul>
        <li>Gasten met een reservering die vandaag geldig is, rijden door.</li>
        <li>Medewerkers en leveranciers rijden door binnen hun tijdvak.</li>
        <li>Hulpdiensten mogen altijd naar binnen.</li>
        <li>Elk kenteken dat bij de ingang binnenrijdt, wordt geregistreerd, met of zonder reservering.</li>
        <li>De camera leest ook bij regen, sneeuw, hagel en vorst, binnen 10 seconden. Lukt dat niet, dan gaat het via de intercom.</li>
        <li>Bij ijzel of te veel sneeuw bij de slagboom blijven de slagbomen dicht tot ze zijn vrijgemaakt.</li>
        <li>De uitgang gaat altijd open. Daar wordt geen kenteken gelezen.</li>
        <li>Wie binnen het verblijf even weg is geweest, rijdt bij terugkomst gewoon weer door.</li>
        <li>Een kenteken verdwijnt binnen 24 uur na het einde van de reservering uit het systeem. Zonder reservering is dat 24 uur na het scannen.</li>
      </ul>
      <h3>Dit beslis jij aan de intercom</h3>
      <ul>
        <li><strong>Bekend kenteken van een medewerker of leverancier, buiten het tijdvak:</strong> binnenlaten.</li>
        <li><strong>Onbekend kenteken dat een gast noemt</strong> (bezoek, leenauto): alleen binnenlaten als de naam en de plek kloppen met een reservering die vandaag geldig is. Zoek het op in de kentekenlijst.</li>
        <li><strong>Reservering begint later of is afgelopen:</strong> niet binnenlaten.</li>
        <li><strong>Kenteken niet gelezen door het weer:</strong> de bestuurder noemt het kenteken. Zoek het op in de kentekenlijst en open de slagboom handmatig als het klopt.</li>
        <li><strong>Bezorgers zonder afspraak:</strong> niet binnenlaten. De toegang wordt geweigerd.</li>
        <li><strong>Geen reservering en geen afspraak:</strong> niet binnenlaten. De toegang wordt geweigerd.</li>
      </ul>
    </div>
  );
}
