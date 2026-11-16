import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { honk, pressPlayerIntercom, sayToReception, stepPlayer, toggleIndicator, toggleMute, toggleView, toggleWindows, useGame } from '../sim/engine';
import { held } from '../sim/input';
import { tick, updateEngine } from '../sim/sound';

const DRIVE_KEYS = ['w', 'a', 's', 'd', 'e', ' ', 'z', 'c', 'r', 'h', 'v', 'm', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];

/** Wie in een invoerveld typt, bestuurt de auto niet. */
function typing(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  return Boolean(target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)));
}

/** Verbindt het toetsenbord met de zelf bestuurde auto, zonder de 3D-scène opnieuw te tekenen. */
export function DrivingControls() {
  const active = useGame((s) => Boolean(s.playerVehicle));
  const keys = useRef(held);
  const blink = useRef(false);

  useEffect(() => {
    if (!active) {
      keys.current.clear();
      return;
    }
    const down = (event: KeyboardEvent) => {
      if (typing(event) || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      // Tijdens het gesprek met de receptie kies je een antwoord met de cijfertoetsen.
      const options = useGame.getState().chat?.options ?? [];
      if (/^[1-9]$/.test(key) && Number(key) <= options.length) {
        event.preventDefault();
        sayToReception(Number(key) - 1);
        return;
      }
      if (!DRIVE_KEYS.includes(key)) return;
      event.preventDefault();
      if (event.repeat) return;
      keys.current.add(key);
      if (key === 'e') pressPlayerIntercom();
      if (key === 'z') toggleIndicator('left');
      if (key === 'c') toggleIndicator('right');
      if (key === 'r') toggleWindows();
      if (key === 'h') honk();
      if (key === 'v') toggleView();
      if (key === 'm') toggleMute();
    };
    const up = (event: KeyboardEvent) => keys.current.delete(event.key.toLowerCase());
    const clear = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, [active]);

  useFrame(({ clock }, delta) => {
    const vehicle = useGame.getState().playerVehicle;
    if (!vehicle) return;
    const has = (...names: string[]) => names.some((name) => keys.current.has(name));
    const throttle = (has('w', 'arrowup') ? 1 : 0) - (has('s', 'arrowdown') ? 1 : 0);
    const steer = (has('d', 'arrowright') ? 1 : 0) - (has('a', 'arrowleft') ? 1 : 0);
    stepPlayer(delta, { throttle, steer, brake: has(' ') });
    updateEngine(vehicle.speed ?? 0, throttle);

    const on = Boolean(vehicle.indicator) && Math.floor(clock.elapsedTime * 2) % 2 === 0;
    if (vehicle.indicator && on !== blink.current) tick(on);
    blink.current = on;
  });

  return null;
}
