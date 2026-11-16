import { useState } from 'react';
import { checkPlate, cleanDutchPlateInput, startDriving, useGame } from '../sim/engine';
import { CAR_COLORS } from '../sim/scenarios';
import { CATEGORY } from './Plate';

/** De auto's waaruit je kiest, met de motor die je straks hoort. */
const CARS = [
  { model: 'Volkswagen Golf', engine: 'viercilinder turbo' },
  { model: 'BMW M2', engine: 'zes-in-lijn' },
  { model: 'Audi RS4 Avant', engine: 'V6 biturbo' },
  { model: 'Opel Corsa F', engine: 'driecilinder' },
  { model: 'Tesla Model 3', engine: 'elektrisch' },
];

/** Vóór de rit: kies je auto, de kleur en een kenteken (uit de database of zelf ingevuld). */
export function DriveSetup() {
  const permits = useGame((s) => s.permits);
  const message = useGame((s) => s.driveMessage);
  useGame((s) => s.minute); // de controle hieronder hangt af van de tijd
  const [model, setModel] = useState(CARS[0].model);
  const [color, setColor] = useState(CAR_COLORS[0]);
  const [source, setSource] = useState<'lijst' | 'zelf'>('lijst');
  const [listed, setListed] = useState('');
  const [typed, setTyped] = useState('');

  const chosen = source === 'lijst' ? (listed || permits[0]?.plate || '') : typed;
  const result = chosen.replace(/[^A-Z0-9]/gi, '').length >= 3 ? checkPlate(chosen) : null;

  return (
    <section className="kaart rijden" aria-label="Zelf rijden">
      <p className="kaart-kop">Zelf rijden</p>

      <p className="veld-kop">Kies je auto</p>
      <div className="auto-keuze">
        {CARS.map((car) => (
          <button key={car.model} type="button" aria-pressed={model === car.model} onClick={() => setModel(car.model)}>
            <strong>{car.model}</strong>
            <span>{car.engine}</span>
          </button>
        ))}
      </div>
      <div className="kleur-keuze" aria-label="Kleur">
        {CAR_COLORS.map((option) => (
          <button key={option} type="button" style={{ background: option }} aria-pressed={color === option} aria-label={`Kleur ${option}`} onClick={() => setColor(option)} />
        ))}
      </div>

      <p className="veld-kop">Kenteken</p>
      <div className="keuze-tabs">
        <button type="button" aria-pressed={source === 'lijst'} onClick={() => setSource('lijst')}>Uit de database</button>
        <button type="button" aria-pressed={source === 'zelf'} onClick={() => setSource('zelf')}>Zelf invoeren</button>
      </div>
      {source === 'lijst' ? (
        <label>Kenteken uit de kentekenlijst
          <select value={listed || permits[0]?.plate || ''} onChange={(event) => setListed(event.target.value)}>
            {permits.map((permit) => (
              <option key={permit.id} value={permit.plate}>
                {permit.plate} · {permit.holder} ({CATEGORY[permit.category]})
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label>Eigen kenteken
          <input className="kenteken-invoer" value={typed} onChange={(event) => setTyped(cleanDutchPlateInput(event.target.value))} placeholder="bijvoorbeeld K-123-BB" maxLength={10} />
        </label>
      )}
      {result && (
        <div className={`boeking ${result.open ? 'goed' : 'fout'}`} role="status">
          <strong>{result.open ? `Slagboom gaat open: ${result.holder}` : 'Slagboom blijft dicht: je belt aan bij de intercom'}</strong>
          <p>{result.reason}</p>
        </div>
      )}

      <button type="button" className="knop primair" onClick={() => startDriving(chosen, model, color)}>Start de motor</button>
      {message && <p className="kaart-sub">{message}</p>}
    </section>
  );
}
