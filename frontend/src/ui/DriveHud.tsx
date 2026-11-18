import { useState, type PointerEvent } from 'react';
import { backToMenu, honk, pressPlayerIntercom, speedLimit, toggleIndicator, toggleMute, toggleSiren, toggleView, toggleWindows, useGame } from '../sim/engine';
import { EMERGENCY_TYPES } from '../sim/rules';
import { held } from '../sim/input';
import { AiCam } from './AiCam';
import { MiniMap } from './MiniMap';

/** Knop die een rijtoets vasthoudt zolang je hem ingedrukt houdt (voor telefoon en tablet). */
function Pedal({ hold, label, children }: { hold: string; label: string; children: string }) {
  const press = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    held.add(hold);
  };
  const release = () => held.delete(hold);
  return (
    <button
      type="button" className="pedaal" aria-label={label}
      onPointerDown={press} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
      onContextMenu={(event) => event.preventDefault()}
    >{children}</button>
  );
}

/** Smalle balk onderin tijdens het rijden: het beeld blijft vrij, de uitleg zit achter "Hulp". */
export function DriveHud() {
  const [help, setHelp] = useState(false);
  const vehicle = useGame((s) => s.playerVehicle);
  const view = useGame((s) => s.view);
  const muted = useGame((s) => s.muted);
  const speedKmh = useGame((s) => s.speedKmh);
  const message = useGame((s) => s.driveMessage);
  const needsIntercom = useGame((s) => s.playerNeedsIntercom);
  useGame((s) => s.controls); // opnieuw tekenen na een knop in de auto
  if (!vehicle) return null;
  const emergency = EMERGENCY_TYPES.includes(vehicle.type);
  const limit = speedLimit(vehicle.z, vehicle.type);

  return (
    <>
      {/* Rechts: hoe de camera bij de ingang je kenteken herkent, en waar je rijdt. */}
      <div className="rij-zijkant">
        <AiCam />
        <MiniMap />
      </div>

      {(message || needsIntercom) && (
        <div className="rij-melding" role="status">
          {message && <p>{message}</p>}
          {needsIntercom && <button type="button" className="knop primair" onClick={pressPlayerIntercom}>Bel intercom (E)</button>}
        </div>
      )}

      {help && (
        <div className="rij-hulp" role="dialog" aria-label="Besturing">
          <p><kbd>W</kbd> gas</p>
          <p><kbd>S</kbd> rem en achteruit</p>
          <p><kbd>A</kbd><kbd>D</kbd> sturen</p>
          <p><kbd>spatie</kbd> hard remmen</p>
          <p><kbd>Z</kbd><kbd>C</kbd> richting aangeven</p>
          <p><kbd>V</kbd> camera binnen of buiten</p>
          <p><kbd>slepen</kbd> sturen (camera binnen), rondkijken (camera buiten)</p>
          <p><kbd>scrollen</kbd> in- en uitzoomen (camera buiten)</p>
          <p><kbd>R</kbd> raam</p>
          <p><kbd>H</kbd> claxon</p>
          {emergency && <p><kbd>L</kbd> zwaailicht en sirene</p>}
          <p><kbd>E</kbd> intercom</p>
          <p><kbd>M</kbd> geluid</p>
          <button type="button" className="knop klein" onClick={() => setHelp(false)}>Sluit</button>
        </div>
      )}

      <div className="rij-pedalen links" aria-label="Sturen">
        <Pedal hold="a" label="Stuur naar links">◄</Pedal>
        <Pedal hold="d" label="Stuur naar rechts">►</Pedal>
      </div>
      <div className="rij-pedalen rechts" aria-label="Gas en rem">
        <Pedal hold="s" label="Rem en achteruit">Rem</Pedal>
        <Pedal hold="w" label="Gas">Gas</Pedal>
      </div>

      <div className="rij-hud" aria-label="Autobediening">
        <button type="button" className={`rij-knop pijl${vehicle.indicator === 'left' ? ' knippert' : ''}`} aria-pressed={vehicle.indicator === 'left'} aria-label="Richting links (Z)" title="Richting links (Z)" onClick={() => toggleIndicator('left')}>◄</button>
        <p className="rij-snelheid"><strong>{speedKmh}</strong><span>km/u</span></p>
        {limit !== null && <span className="rij-limiet" title={`Maximaal ${limit} km/u`} aria-label={`Maximaal ${limit} km/u`}>{limit}</span>}
        <button type="button" className={`rij-knop pijl${vehicle.indicator === 'right' ? ' knippert' : ''}`} aria-pressed={vehicle.indicator === 'right'} aria-label="Richting rechts (C)" title="Richting rechts (C)" onClick={() => toggleIndicator('right')}>►</button>
        <span className="rij-streep" aria-hidden="true" />
        <button type="button" className="rij-knop" title="Wissel camera (V)" onClick={toggleView}>{view === 'binnen' ? 'Buiten' : 'Binnen'}</button>
        <button type="button" className="rij-knop" title="Raam (R)" aria-pressed={Boolean(vehicle.windowsOpen)} onClick={toggleWindows}>Raam</button>
        <button type="button" className="rij-knop" title="Claxon (H)" onClick={honk}>Toeter</button>
        {emergency && <button type="button" className="rij-knop sirene" title="Zwaailicht en sirene (L)" aria-pressed={Boolean(vehicle.siren)} onClick={toggleSiren}>Sirene</button>}
        <button type="button" className="rij-knop" title="Geluid (M)" aria-pressed={!muted} onClick={toggleMute}>{muted ? 'Geluid uit' : 'Geluid aan'}</button>
        <button type="button" className="rij-knop" aria-expanded={help} onClick={() => setHelp((value) => !value)}>Hulp</button>
        <button type="button" className="rij-knop stop" onClick={backToMenu}>Stop</button>
      </div>
    </>
  );
}
