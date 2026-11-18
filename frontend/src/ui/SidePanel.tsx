// Het overzicht bij de automatische kentekenherkenning: kentekenlijst, gescande kentekens, logboek, webcam,
// weer en regels. Opent vanuit de navbar; links een menu, rechts de inhoud, bovenin de belangrijkste tellers.
import { useState, type FormEvent, type ReactNode } from 'react';
import { api } from '../api';
import { isoDate, momentLabel, shortDate, timeOf } from '../sim/clock';
import { clearGate, reloadPermits, sendCustom, useGame } from '../sim/engine';
import { cleanPlateInput, COUNTRIES, dutchPlateProblem, formatPlate } from '../sim/plates';
import { decideLocal } from '../sim/rules';
import { heaterOn, READ_LIMIT, seconds, SNOW_LOCK_CM, WEATHER } from '../sim/weather';
import type { NewPermit, PassageRow, Permit } from '../types';
import { CATEGORY, Plate } from './Plate';
import { WebcamScanner } from './Webcam';

type Tab = 'lijst' | 'binnen' | 'logboek' | 'camera' | 'weer' | 'regels';
type Tone = 'goed' | 'let-op' | 'fout' | 'stil';

export function SidePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('lijst');
  const permits = useGame((s) => s.permits.length);
  const presence = useGame((s) => s.presence.length);
  const log = useGame((s) => s.log);
  const waiting = log.filter((p) => p.outcome === 'pending').length;

  const menu: { id: Tab; label: string; count?: number }[] = [
    { id: 'lijst', label: 'Kentekenlijst', count: permits },
    { id: 'binnen', label: 'Gescand bij de ingang', count: presence },
    { id: 'logboek', label: 'Logboek', count: log.length },
    { id: 'camera', label: 'Webcam' },
    { id: 'weer', label: 'Weer en apparatuur' },
    { id: 'regels', label: 'Regels' },
  ];

  return (
    <aside className={`overzicht${open ? ' open' : ''}`} aria-label="Overzicht" inert={!open}>
      <header className="ov-kop">
        <h2>Overzicht</h2>
        <dl className="ov-tellers">
          <Counter label="In de kentekenlijst" value={permits} onClick={() => setTab('lijst')} />
          <Counter label="Gescand bij de ingang" value={presence} onClick={() => setTab('binnen')} />
          <Counter label="Passages deze dienst" value={log.length} onClick={() => setTab('logboek')} />
          <Counter label="Wacht op receptie" value={waiting} tone={waiting ? 'let-op' : undefined} onClick={() => setTab('logboek')} />
        </dl>
        <button type="button" className="ov-sluit" onClick={onClose} aria-label="Sluit het overzicht">✕</button>
      </header>

      <nav className="ov-menu" role="tablist" aria-label="Onderdelen">
        {menu.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>
            <span>{item.label}</span>
            {item.count !== undefined && <span className="ov-aantal">{item.count}</span>}
          </button>
        ))}
      </nav>

      <div className="ov-inhoud" role="tabpanel">
        {tab === 'lijst' && <PermitList />}
        {tab === 'binnen' && <PresenceList />}
        {tab === 'logboek' && <LogList />}
        {tab === 'camera' && <WebcamScanner />}
        {tab === 'weer' && <WeatherStatus />}
        {tab === 'regels' && <Rules />}
      </div>
    </aside>
  );
}

function Counter({ label, value, tone, onClick }: { label: string; value: number; tone?: Tone; onClick: () => void }) {
  return (
    <button type="button" className={`ov-teller${tone ? ` ${tone}` : ''}`} onClick={onClick}>
      <dd>{value}</dd>
      <dt>{label}</dt>
    </button>
  );
}

function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`ov-label ${tone}`}>{children}</span>;
}

/** Filterknoppen boven een lijst, met het aantal per keuze. */
function Filters<T extends string>({ value, options, onChange }: {
  value: T; options: { id: T; label: string; count: number }[]; onChange: (id: T) => void;
}) {
  return (
    <div className="ov-filters" role="group" aria-label="Filter">
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label} <span>{o.count}</span>
        </button>
      ))}
    </div>
  );
}

function Section({ title, intro, children, actions }: { title: string; intro?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <>
      <div className="ov-sectie-kop">
        <div>
          <h3>{title}</h3>
          {intro && <p>{intro}</p>}
        </div>
        {actions}
      </div>
      {children}
    </>
  );
}

// ---------- kentekenlijst ----------

function allowed(permit: Permit): string {
  if (permit.category === 'guest') return `${shortDate(permit.arrival!)} t/m ${shortDate(permit.departure!)}`;
  if (permit.window_start && permit.window_end) return `${permit.window_start.slice(0, 5)} tot ${permit.window_end.slice(0, 5)}`;
  return 'Altijd';
}

/** Mag dit kenteken nu naar binnen? Met dezelfde regels als de slagboom, op de tijd van de simulatie. */
function status(permit: Permit, minute: number): { tone: Tone; text: string } {
  const decision = decideLocal([permit], { plate: permit.plate, type: permit.vehicle_type }, minute);
  if (decision.open) return { tone: 'goed', text: 'Mag nu binnen' };
  if (decision.code === 'too_early') return { tone: 'let-op', text: 'Komt later' };
  if (decision.code === 'outside_window') return { tone: 'let-op', text: 'Buiten tijdvak' };
  return { tone: 'stil', text: 'Afgelopen' };
}

type CategoryFilter = 'alles' | Permit['category'];

function PermitList() {
  const permits = useGame((s) => s.permits);
  const minute = useGame((s) => s.minute);
  const admin = useGame((s) => s.user?.role === 'beheerder');
  const playing = useGame((s) => s.phase === 'playing');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('alles');
  const [adding, setAdding] = useState(false);
  const [hint, setHint] = useState('');

  const needle = search.trim().toLowerCase();
  const found = permits.filter((p) => !needle
    || `${p.holder} ${p.plate} ${p.pitch ?? ''}`.toLowerCase().includes(needle)
    || p.plate_key.toLowerCase().includes(needle.replace(/[^a-z0-9]/g, '')));
  const shown = found.filter((p) => category === 'alles' || p.category === category);
  const count = (c: Permit['category']) => found.filter((p) => p.category === c).length;

  async function remove(permit: Permit) {
    if (!window.confirm(`${permit.plate} van ${permit.holder} verwijderen uit de kentekenlijst?`)) return;
    try {
      await api.removePermit(permit.id);
      await reloadPermits();
    } catch (err) {
      setHint(err instanceof Error ? err.message : 'Verwijderen is niet gelukt.');
    }
  }

  return (
    <Section
      title="Kentekenlijst"
      intro="Wie mag wanneer naar binnen. De status geldt voor de tijd in de simulatie."
      actions={admin && (
        <button type="button" className={`knop klein${adding ? '' : ' accent'}`} aria-expanded={adding} onClick={() => setAdding(!adding)}>
          {adding ? 'Sluit formulier' : '+ Kenteken toevoegen'}
        </button>
      )}
    >
      {adding && admin && <AddPermit onDone={() => setAdding(false)} />}

      <div className="ov-balk">
        <input
          type="search" className="ov-zoek" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Zoek op naam, plek of kenteken" aria-label="Zoek op naam, plek of kenteken"
        />
        <Filters<CategoryFilter>
          value={category} onChange={setCategory}
          options={[
            { id: 'alles', label: 'Alles', count: found.length },
            { id: 'guest', label: 'Gasten', count: count('guest') },
            { id: 'staff', label: 'Medewerkers', count: count('staff') },
            { id: 'supplier', label: 'Leveranciers', count: count('supplier') },
          ]}
        />
      </div>

      {shown.length === 0 ? <p className="leeg">Geen kenteken of reservering gevonden.</p> : (
        <ul className="ov-lijst">
          {shown.map((p) => {
            const now = status(p, minute);
            return (
              <li key={p.id} className="ov-rij">
                <Plate plate={p.plate} country={p.country} />
                <div className="ov-wie">
                  <strong>{p.holder}</strong>
                  <small>{CATEGORY[p.category]}{p.pitch ? ` · ${p.pitch}` : ''}</small>
                </div>
                <div className="ov-wanneer"><small>Mag binnen</small>{allowed(p)}</div>
                <Badge tone={now.tone}>{now.text}</Badge>
                {admin && (
                  <button type="button" className="ov-weg" onClick={() => void remove(p)} aria-label={`Verwijder ${p.plate}`} title="Verwijder">✕</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {hint && <p className="fout">{hint}</p>}
      {!admin && <p className="klein-tekst">Alleen de beheerder kan kentekens toevoegen of verwijderen.</p>}
      {playing && <SendPlate />}
    </Section>
  );
}

/** Laat een zelf gekozen kenteken naar de slagboom rijden. */
function SendPlate() {
  const [custom, setCustom] = useState('');
  const [hint, setHint] = useState('');
  function send(event: FormEvent) {
    event.preventDefault();
    const problem = sendCustom(custom);
    setHint(problem);
    if (!problem) setCustom('');
  }
  return (
    <form className="ov-kaart" onSubmit={send}>
      <h4>Stuur zelf een kenteken naar de slagboom</h4>
      <div className="rijtje">
        <input className="kenteken-invoer" value={custom} onChange={(e) => setCustom(cleanPlateInput(e.target.value))} placeholder="N-264-GT" maxLength={14} aria-label="Kenteken" />
        <button type="submit" className="knop">Laat aankomen</button>
      </div>
      {hint && <p className="fout">{hint}</p>}
    </form>
  );
}

function AddPermit({ onDone }: { onDone: () => void }) {
  const minute = useGame((s) => s.minute);
  const [category, setCategory] = useState<NewPermit['category']>('guest');
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = (name: string) => String(data.get(name) ?? '').trim();
    const country = text('country') || 'NL';
    // Een Nederlands kenteken moet voldoen aan de regels van de RDW (geen klinkers, C of Q, een geldige zijcode).
    const problem = country === 'NL' ? dutchPlateProblem(text('plate')) : null;
    if (problem) {
      setMessage(problem);
      return;
    }
    const permit: NewPermit = {
      plate: formatPlate(text('plate'), country), country, holder: text('holder'), category, vehicle_type: text('vehicle') as NewPermit['vehicle_type'],
    };
    if (category === 'guest') {
      Object.assign(permit, { pitch: text('pitch'), arrival: text('arrival'), departure: text('departure') });
    } else if (text('start') && text('end')) {
      Object.assign(permit, { window_start: text('start'), window_end: text('end') });
    }
    try {
      await api.addPermit(permit);
      await reloadPermits();
      form.reset();
      onDone();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Toevoegen is niet gelukt.');
    }
  }

  return (
    <form className="ov-kaart ov-formulier" onSubmit={submit}>
      <h4>Nieuw kenteken</h4>
      <div className="ov-soort" role="group" aria-label="Soort">
        {(['guest', 'staff', 'supplier'] as const).map((c) => (
          <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)}>{CATEGORY[c]}</button>
        ))}
      </div>
      <label>Kenteken<input name="plate" className="kenteken-invoer" required maxLength={14} onInput={(event) => { event.currentTarget.value = cleanPlateInput(event.currentTarget.value); }} /></label>
      <label>Land
        <select name="country" defaultValue="NL">
          {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
        </select>
      </label>
      <label>Naam<input name="holder" required minLength={2} maxLength={80} placeholder={category === 'guest' ? 'Familie Jansen' : 'Bakkerij Van Dijk'} /></label>
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
          <span />
          <label>Aankomst<input name="arrival" type="date" required defaultValue={isoDate(minute)} /></label>
          <label>Vertrek<input name="departure" type="date" required defaultValue={isoDate(minute + 7 * 1440)} /></label>
        </>
      ) : (
        <>
          <label>Tijdvak van<input name="start" type="time" /></label>
          <label>Tijdvak tot<input name="end" type="time" /></label>
          <p className="klein-tekst">Laat het tijdvak leeg als dit voertuig altijd naar binnen mag.</p>
        </>
      )}
      <div className="rijtje">
        <button type="submit" className="knop accent">Voeg toe</button>
        <button type="button" className="knop" onClick={onDone}>Annuleer</button>
      </div>
      {message && <p className="fout" role="status">{message}</p>}
    </form>
  );
}

// ---------- gescand bij de ingang ----------

function PresenceList() {
  const presence = useGame((s) => s.presence);
  const minute = useGame((s) => s.minute);
  return (
    <Section
      title="Gescand bij de ingang"
      intro="Elk kenteken dat binnenrijdt, wordt geregistreerd. De uitgang leest niets, dus dit zegt niet wie er nu op het terrein staat."
    >
      {!presence.length ? <p className="leeg">Er staan nu geen gescande kentekens in het systeem.</p> : (
        <ul className="ov-lijst">
          {presence.map((p) => (
            <li key={p.id} className="ov-rij drie">
              <Plate plate={p.plate} country={p.country} />
              <div className="ov-wie">
                <strong>{p.holder}</strong>
                <small>{CATEGORY[p.category] ?? p.category}{p.pitch ? ` · ${p.pitch}` : ''}</small>
              </div>
              <div className="ov-wanneer"><small>Laatst binnengereden</small>{momentLabel(p.entered_at, minute)}</div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ---------- logboek ----------

type LogFilter = 'alles' | PassageRow['outcome'];

function outcome(p: PassageRow): { tone: Tone; text: string } {
  if (p.outcome === 'pending') return { tone: 'let-op', text: 'Wacht op receptie' };
  if (p.outcome === 'denied') return { tone: 'fout', text: 'Geweigerd' };
  return { tone: 'goed', text: p.manual ? 'Binnengelaten' : 'Binnengereden' };
}

function LogList() {
  const log = useGame((s) => s.log);
  const [filter, setFilter] = useState<LogFilter>('alles');
  const count = (o: PassageRow['outcome']) => log.filter((p) => p.outcome === o).length;
  const shown = log.filter((p) => filter === 'alles' || p.outcome === filter);
  return (
    <Section title="Logboek" intro="Wie binnenrijdt, wordt vastgelegd in de database. Geweigerde kentekens worden niet bewaard (AVG). De uitgang legt niets vast.">
      <Filters<LogFilter>
        value={filter} onChange={setFilter}
        options={[
          { id: 'alles', label: 'Alles', count: log.length },
          { id: 'granted', label: 'Binnen', count: count('granted') },
          { id: 'pending', label: 'Wacht op receptie', count: count('pending') },
        ]}
      />
      {shown.length === 0 ? <p className="leeg">{log.length ? 'Geen passages bij dit filter.' : 'Nog geen passages in deze dienst.'}</p> : (
        <ul className="ov-lijst">
          {shown.map((p) => {
            const result = outcome(p);
            return (
              <li key={p.id} className={`ov-rij log ${result.tone}`}>
                <time className="ov-tijd">{timeOf(p.occurred_at)}</time>
                <Plate plate={p.plate} country={p.country} />
                <div className="ov-wie">
                  <strong>{p.holder}</strong>
                  <small>{p.reason}{p.offline ? ' · zonder internet afgehandeld, later vastgelegd' : ''}</small>
                </div>
                <Badge tone={result.tone}>{result.text}</Badge>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

// ---------- weer en apparatuur ----------

function Tile({ label, value, note, tone, children }: { label: string; value: string; note?: string; tone: Tone; children?: ReactNode }) {
  return (
    <div className={`ov-tegel ${tone}`}>
      <small>{label}</small>
      <strong>{value}</strong>
      {note && <p>{note}</p>}
      {children}
    </div>
  );
}

function WeatherStatus() {
  const weather = useGame((s) => s.weather);
  const snowCm = useGame((s) => s.snowCm);
  const gateLock = useGame((s) => s.gateLock);
  const lastRead = useGame((s) => s.lastRead);
  const power = useGame((s) => s.power);
  const battery = useGame((s) => s.battery);
  const gateDefect = useGame((s) => s.gateDefect);
  const info = WEATHER[weather];
  return (
    <Section title="Weer en apparatuur" intro="Kies het weer in de navbar. Hier zie je wat de apparatuur bij de slagboom ermee doet.">
      <div className="ov-tegels">
        <Tile label="Weer" value={`${info.label}, ${info.temperature} °C`} tone="stil" />
        <Tile
          label="Camera" value="In bedrijf" tone="goed"
          note={`Waterdicht (IP66). Lensverwarming ${heaterOn(weather) ? 'aan tegen condens en ijs' : 'uit, niet nodig'}.`}
        />
        <Tile
          label="Laatste kenteken"
          value={!lastRead ? 'Nog niets gelezen' : lastRead.read ? `Gelezen in ${seconds(lastRead.seconds)}` : 'Via de intercom'}
          tone={!lastRead ? 'stil' : lastRead.read ? 'goed' : 'let-op'}
          note={`Norm: binnen ${READ_LIMIT} seconden, ook bij zware neerslag.`}
        />
        <Tile
          label="Sneeuw bij de slagboom" value={`${snowCm} cm`} tone={snowCm >= SNOW_LOCK_CM ? 'fout' : snowCm > 0 ? 'let-op' : 'stil'}
          note={`Vanaf ${SNOW_LOCK_CM} cm vergrendelt de slagboom.`}
        />
        <Tile label="Slagboom" value={gateLock ? `Vergrendeld door ${gateLock}` : 'Vrij'} tone={gateLock ? 'fout' : 'goed'}>
          {gateLock && <button type="button" className="knop klein" onClick={clearGate}>Vrijgemaakt: geef vrij</button>}
        </Tile>
        <Tile
          label="Stroom" value={power === 'net' ? 'Normaal' : power === 'accu' ? `Noodaccu, nog ${Math.ceil(battery)} min` : 'Uit'}
          tone={power === 'net' ? 'goed' : power === 'accu' ? 'let-op' : 'fout'}
          note="Bij uitval werkt alles door op de noodaccu; daarna opent een medewerker met de hand."
        />
        <Tile label="Slagboom-aandrijving" value={gateDefect ? 'Defect' : 'In orde'} tone={gateDefect ? 'fout' : 'goed'} note="Bij een defect gaat de uitgang open en bedient een medewerker de ingang." />
        <Tile label="Intercom" value={power === 'uit' ? 'Uit' : 'In bedrijf'} tone="goed" note="Filtert wind en neerslag weg, zodat het gesprek verstaanbaar blijft." />
      </div>
    </Section>
  );
}

// ---------- regels ----------

function Rules() {
  return (
    <Section title="Regels" intro="Wat de slagboom zelf beslist, en wat de receptie aan de intercom beslist.">
      <div className="ov-regels">
        <div className="ov-kaart">
          <h4>De slagboom beslist zelf</h4>
          <ul>
            <li>Gasten met een reservering die vandaag geldig is, rijden door.</li>
            <li>Medewerkers en leveranciers rijden door binnen hun tijdvak.</li>
            <li>Hulpdiensten mogen altijd naar binnen.</li>
            <li>Er is één slagboom. Daarachter parkeren bezoekers en leveranciers op de grote parkeerplaats links van de weg; gasten rijden door naar de camping.</li>
            <li>Bij stroomuitval werkt alles door op de noodaccu. Is die leeg of de slagboom defect, dan staat de uitgang open en opent een medewerker de ingang met de hand.</li>
            <li>Elk kenteken dat bij de ingang binnenrijdt, wordt geregistreerd, met of zonder reservering.</li>
            <li>Een kenteken dat wordt geweigerd, wordt niet bewaard (AVG). Een oproep die niemand beantwoordt, verdwijnt na 24 uur.</li>
            <li>Er worden geen camerabeelden of foto's van kentekens bewaard, alleen het gelezen kenteken. Het logboek gaat 28 dagen terug.</li>
            <li>De camera leest ook bij regen, sneeuw, hagel en vorst, binnen 10 seconden. Lukt dat niet, dan gaat het via de intercom.</li>
            <li>Bij ijzel of te veel sneeuw bij de slagboom blijven de slagbomen dicht tot ze zijn vrijgemaakt.</li>
            <li>De uitgang gaat altijd open. Daar wordt geen kenteken gelezen.</li>
            <li>Wie binnen het verblijf even weg is geweest, rijdt bij terugkomst gewoon weer door.</li>
            <li>Een kenteken verdwijnt binnen 24 uur na het einde van de reservering uit het systeem. Zonder reservering is dat 24 uur na het scannen.</li>
          </ul>
        </div>
        <div className="ov-kaart">
          <h4>Jij beslist aan de intercom</h4>
          <ul>
            <li><strong>Medewerker of leverancier buiten het tijdvak:</strong> binnenlaten.</li>
            <li><strong>Onbekend kenteken dat een gast noemt</strong> (bezoek, leenauto): alleen als naam en plek kloppen met een reservering die vandaag geldig is.</li>
            <li><strong>Reservering begint later of is afgelopen:</strong> niet binnenlaten.</li>
            <li><strong>Kenteken niet gelezen door het weer:</strong> de bestuurder noemt het kenteken. Klopt het met de kentekenlijst, open dan handmatig.</li>
            <li><strong>Bezorgers zonder afspraak:</strong> niet binnenlaten.</li>
            <li><strong>Geen reservering en geen afspraak:</strong> niet binnenlaten.</li>
          </ul>
        </div>
      </div>
    </Section>
  );
}
