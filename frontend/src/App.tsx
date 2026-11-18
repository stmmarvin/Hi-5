import { useEffect, useState } from 'react';
import { Scene } from './scene/Scene';
import { boot, useGame } from './sim/engine';
import { GateCards, Overlay, TopBar } from './ui/Hud';
import { Login } from './ui/Login';
import { SidePanel } from './ui/SidePanel';

export function App() {
  const phase = useGame((s) => s.phase);
  const mode = useGame((s) => s.mode);
  const [open, setPanel] = useState(false);
  // Het overzicht hoort bij de automatische kentekenherkenning; bij zelf rijden is het er niet.
  const overview = phase === 'playing' && mode === 'simulatie';
  const panel = open && overview;

  useEffect(() => {
    void boot();
  }, []);

  // Een knop waarop met de muis is geklikt houdt de focus niet vast. Anders drukt de spatiebalk (de rem)
  // die knop opnieuw in en verschijnt er een focuskader omheen.
  useEffect(() => {
    const release = (event: MouseEvent) => {
      if (event.detail === 0) return; // bediend met het toetsenbord: focus laten staan
      (event.target as HTMLElement | null)?.closest('button')?.blur();
    };
    window.addEventListener('click', release);
    return () => window.removeEventListener('click', release);
  }, []);

  // Escape sluit het overzicht.
  useEffect(() => {
    if (!panel) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setPanel(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [panel]);

  if (phase === 'loading') return <p className="laden">Bezig met laden…</p>;
  if (phase === 'login') return <Login />;

  return (
    <div className="app">
      <TopBar overview={overview} overviewOpen={panel} onOverview={() => setPanel(!panel)} />
      <main className="werkblad">
        <section className="terrein" aria-label="3D-beeld van de oprit">
          <Scene />
          <GateCards />
          <Overlay />
        </section>
        {overview && <SidePanel open={panel} onClose={() => setPanel(false)} />}
      </main>
    </div>
  );
}
