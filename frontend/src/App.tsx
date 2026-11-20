import { useEffect } from 'react';
import { Scene } from './scene/Scene';
import { boot, useGame } from './sim/engine';
import { GateCards, Overlay, TopBar } from './ui/Hud';
import { Login } from './ui/Login';
import { Portal } from './ui/Portal';

export function App() {
  const phase = useGame((s) => s.phase);
  const portal = useGame((s) => s.portal);

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

  if (phase === 'loading') return <p className="laden">Bezig met laden…</p>;
  if (phase === 'login') return <Login />;

  return (
    <div className="app">
      <TopBar />
      {/* Het overzichtsportaal is een eigen pagina. De simulatie blijft eronder staan, gepauzeerd. */}
      {portal && <Portal />}
      <main className="werkblad" hidden={portal}>
        <section className="terrein" aria-label="3D-beeld van de oprit">
          <Scene />
          <GateCards />
          <Overlay />
        </section>
      </main>
    </div>
  );
}
