// Het overzichtsportaal: een eigen pagina naast de simulatie. De planning laat zien wanneer gasten,
// medewerkers en leveranciers komen; verder de kentekenlijst, wie er gescand is, het logboek, de webcam en de regels.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api } from '../api';
import { isoDate, momentLabel, shortDate, SHIFT_START, timeOf } from '../sim/clock';
import { refresh, reloadPermits, sendCustom, useGame } from '../sim/engine';
import { cleanPlateInput, COUNTRIES, dutchPlateProblem, formatPlate } from '../sim/plates';
import type { NewPermit, PassageRow, Permit } from '../types';
import { CATEGORY, Plate } from './Plate';
import { WebcamScanner } from './Webcam';

type Tab = 'planning' | 'lijst' | 'binnen' | 'logboek' | 'camera' | 'regels';
type Tone = 'goed' | 'let-op' | 'fout' | 'stil';

const TABS: { id: Tab; label: string }[] = [
  { id: 'planning', label: 'Planning' },
  { id: 'lijst', label: 'Kentekenlijst' },
  { id: 'binnen', label: 'Gescand bij de ingang' },
  { id: 'logboek', label: 'Logboek' },
  { id: 'camera', label: 'Webcam' },
  { id: 'regels', label: 'Regels' },
];

/** Het overzichtsportaal: los van de simulatie, voor de planning en de administratie van de slagboom. */
export function Portal() {
  const [tab, setTab] = useState<Tab>('planning');
  const permits = useGame((s) => s.permits.length);
  const presence = useGame((s) => s.presence.length);
  const log = useGame((s) => s.log.length);
  const counts: Partial<Record<Tab, number>> = { lijst: permits, binnen: presence, logboek: log };

  useEffect(() => { void refresh(); }, []);

  return (
    <main className="portaal">
      <header className="pt-kop">
        <div>
          <p className="pt-boven">Camping De Groene Weide</p>
          <h2>Overzichtsportaal</h2>
          <p className="pt-uitleg">Wanneer gasten, medewerkers en leveranciers komen, en wie er bij de slagboom is geweest. Los van de simulatie.</p>
        </div>
      </header>
      <nav className="pt-tabs" role="tablist" aria-label="Onderdelen">
        {TABS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>
            {item.label}
            {counts[item.id] !== undefined && <span className="ov-aantal">{counts[item.id]}</span>}
          </button>
        ))}
      </nav>
      <div className="pt-inhoud ov-inhoud" role="tabpanel">
        {tab === 'planning' && <Planning />}
        {tab === 'lijst' && <PermitList />}
        {tab === 'binnen' && <PresenceList />}
        {tab === 'logboek' && <LogList />}
        {tab === 'camera' && <WebcamScanner />}
        {tab === 'regels' && <Rules />}
      </div>
    </main>
  );
}

// ---------- planning ----------

const DAY_START = 6 * 60;
const DAY_END = 22 * 60;
const HOURS = Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, i) => DAY_START / 60 + i);

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86400000);
const longDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const dayHead = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric' });
const percent = (minute: number) => `${((Math.min(DAY_END, Math.max(DAY_START, minute)) - DAY_START) / (DAY_END - DAY_START)) * 100}%`;

/** De dag van de simulatie: daar begint de planning. */
const TODAY = isoDate(SHIFT_START);

function Planning() {
  const permits = useGame((s) => s.permits);
  const [day, setDay] = useState(TODAY);
  const [view, setView] = useState<'dag' | 'week'>('dag');

  const guests = permits.filter((p) => p.category === 'guest' && p.arrival && p.departure);
  const arriving = guests.filter((p) => p.arrival === day);
  const leaving = guests.filter((p) => p.departure === day);
  const staying = guests.filter((p) => p.arrival! < day && p.departure! > day);
  const staff = permits.filter((p) => p.category === 'staff');
  const suppliers = permits.filter((p) => p.category === 'supplier');
  const step = view === 'week' ? 7 : 1;

  return (
    <>
      <div className="pt-datum">
        <div className="rijtje">
          <button type="button" className="knop klein" onClick={() => setDay(addDays(day, -step))} aria-label={view === 'week' ? 'Vorige week' : 'Vorige dag'}>◀</button>
          <h3>{view === 'week' ? `Vanaf ${longDate(day)}` : longDate(day)}</h3>
          <button type="button" className="knop klein" onClick={() => setDay(addDays(day, step))} aria-label={view === 'week' ? 'Volgende week' : 'Volgende dag'}>▶</button>
          {day !== TODAY && <button type="button" className="knop klein" onClick={() => setDay(TODAY)}>Dag van de simulatie</button>}
        </div>
        <div className="ov-filters" role="group" aria-label="Weergave">
          <button type="button" aria-pressed={view === 'dag'} onClick={() => setView('dag')}>Dag</button>
          <button type="button" aria-pressed={view === 'week'} onClick={() => setView('week')}>Twee weken</button>
        </div>
      </div>

      {view === 'dag' ? (
        <>
          <dl className="pt-tellers">
            <div className="pt-teller gast"><dt>Gasten komen aan</dt><dd>{arriving.length}</dd></div>
            <div className="pt-teller gast"><dt>Gasten vertrekken</dt><dd>{leaving.length}</dd></div>
            <div className="pt-teller medewerker"><dt>Medewerkers</dt><dd>{staff.length}</dd></div>
            <div className="pt-teller leverancier"><dt>Leveranciers</dt><dd>{suppliers.length}</dd></div>
          </dl>

          <section className="ov-kaart">
            <h4>Wanneer medewerkers en leveranciers komen</h4>
            <p className="klein-tekst">Elke balk is het tijdvak waarin de slagboom vanzelf opengaat. Daarbuiten belt iemand aan bij Boer Bert.</p>
            <div className="pt-tijdlijn">
              <div className="pt-rij pt-uren-rij" aria-hidden="true">
                <span />
                <div className="pt-uren">
                  {HOURS.map((hour) => <span key={hour} style={{ left: percent(hour * 60) }}>{String(hour).padStart(2, '0')}</span>)}
                </div>
              </div>
              <TimeRows title="Leveranciers" tone="leverancier" items={suppliers} />
              <TimeRows title="Medewerkers" tone="medewerker" items={staff} />
            </div>
          </section>

          <div className="pt-twee">
            <GuestList title="Komen aan" empty="Op deze dag komen er geen gasten aan." items={arriving} note={(p) => `${daysBetween(p.arrival!, p.departure!)} nachten, tot ${shortDate(p.departure!)}`} />
            <GuestList title="Vertrekken" empty="Op deze dag vertrekken er geen gasten." items={leaving} note={(p) => `sinds ${shortDate(p.arrival!)}`} />
          </div>
          <p className="klein-tekst">Verder verblijven er {staying.length} gasten op de camping. Gasten rijden vanaf de dag van aankomst tot en met de dag van vertrek vanzelf in en uit.</p>
        </>
      ) : <Week from={day} guests={guests} />}
    </>
  );
}

function TimeRows({ title, tone, items }: { title: string; tone: string; items: Permit[] }) {
  return (
    <div className="pt-groep">
      <p className="pt-groep-kop">{title}</p>
      {items.map((p) => {
        const always = !p.window_start || !p.window_end;
        const start = always ? DAY_START : toMinutes(p.window_start!);
        const end = always ? DAY_END : toMinutes(p.window_end!);
        return (
          <div key={p.id} className="pt-rij">
            <div className="pt-naam"><strong>{p.holder}</strong><small>{p.plate} · {p.vehicle_type}</small></div>
            <div className="pt-baan">
              <span className={`pt-balk ${tone}${always ? ' altijd' : ''}`} style={{ left: percent(start), right: `calc(100% - ${percent(end)})` }}>
                {always ? 'Altijd' : `${p.window_start!.slice(0, 5)} – ${p.window_end!.slice(0, 5)}`}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GuestList({ title, empty, items, note }: { title: string; empty: string; items: Permit[]; note: (p: Permit) => string }) {
  return (
    <section className="ov-kaart">
      <h4>Gasten: {title.toLowerCase()} <span className="ov-aantal">{items.length}</span></h4>
      {!items.length ? <p className="leeg">{empty}</p> : (
        <ul className="pt-gasten">
          {items.map((p) => (
            <li key={p.id}>
              <Plate plate={p.plate} country={p.country} />
              <div className="ov-wie"><strong>{p.holder}</strong><small>{p.pitch} · {p.vehicle_type} · {note(p)}</small></div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Twee weken vooruit: van elke gast een balk van aankomst tot en met vertrek. */
function Week({ from, guests }: { from: string; guests: Permit[] }) {
  const DAYS = 14;
  const days = Array.from({ length: DAYS }, (_, i) => addDays(from, i));
  const last = days[DAYS - 1];
  const shown = guests.filter((p) => p.arrival! <= last && p.departure! >= from).sort((a, b) => a.arrival!.localeCompare(b.arrival!));
  const column = (iso: string) => Math.max(0, Math.min(DAYS - 1, daysBetween(from, iso)));
  return (
    <section className="ov-kaart">
      <h4>Gasten in deze twee weken</h4>
      <p className="klein-tekst">Een balk loopt van de dag van aankomst tot en met de dag van vertrek. Medewerkers en leveranciers komen elke dag in hetzelfde tijdvak (zie Dag).</p>
      <div className="pt-week">
        <div className="pt-week-rij kop">
          <span />
          <div className="pt-week-baan">
            {days.map((iso) => <span key={iso} className={iso === TODAY ? 'vandaag' : ''}>{dayHead(iso)}</span>)}
          </div>
        </div>
        {!shown.length && <p className="leeg">Geen gasten in deze twee weken.</p>}
        {shown.map((p) => (
          <div key={p.id} className="pt-week-rij">
            <div className="pt-naam"><strong>{p.holder}</strong><small>{p.pitch}</small></div>
            <div className="pt-week-baan">
              <span
                className="pt-balk gast"
                style={{ gridColumn: `${column(p.arrival!) + 1} / ${column(p.departure!) + 2}` }}
                title={`${p.holder}: ${shortDate(p.arrival!)} t/m ${shortDate(p.departure!)}`}
              >
                {shortDate(p.arrival!)} – {shortDate(p.departure!)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
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

/** Hoe het er op de dag van de simulatie voor staat. */
function status(permit: Permit): { tone: Tone; text: string } {
  if (permit.category !== 'guest') return permit.window_start ? { tone: 'stil', text: 'Vast tijdvak' } : { tone: 'goed', text: 'Altijd' };
  if (permit.arrival! > TODAY) return { tone: 'let-op', text: 'Komt later' };
  if (permit.departure! < TODAY) return { tone: 'stil', text: 'Afgelopen' };
  return { tone: 'goed', text: 'Verblijft nu' };
}

type CategoryFilter = 'alles' | Permit['category'];

function PermitList() {
  const permits = useGame((s) => s.permits);
  const admin = useGame((s) => s.user?.role === 'beheerder');
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
      intro="Wie mag wanneer naar binnen. De status geldt voor de dag van de simulatie."
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
            const now = status(p);
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
    </Section>
  );
}

/** Laat een zelf gekozen kenteken naar de slagboom rijden. */
export function SendPlate() {
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
