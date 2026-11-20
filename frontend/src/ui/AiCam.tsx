// Tijdens het rijden: het beeld van de AI-camera bij de ingang, met wat de kentekenherkenning doet. Een kader om
// de kentekenplaat, de tekens die gelezen worden en de stappen van voertuig zien tot boeking controleren.
import { useEffect, useRef, useState } from 'react';
import { feed, FEED_HEIGHT, FEED_WIDTH, type FeedPlate } from '../scene/feed';
import { useGame, type Readout } from '../sim/engine';
import { countryName } from '../sim/plates';
import { EMERGENCY_TYPES } from '../sim/rules';
import { seconds } from '../sim/weather';

type Phase = 'zoekt' | 'voertuig' | 'plaat' | 'lezen' | 'klaar';

/** Vanaf deze afstand (meters) is de plaat groot genoeg om te lezen. */
const READABLE = 16;

const matches = (readout: Readout | null, plate: FeedPlate | null): readout is Readout => Boolean(
  readout && plate && (readout.plate === plate.plate || readout.plate === 'ONBEKEND'),
);

function phaseOf(plate: FeedPlate | null, readout: Readout | null): Phase {
  if (!plate) return 'zoekt';
  if (matches(readout, plate)) return readout.status === 'reading' ? 'lezen' : 'klaar';
  return plate.distance < READABLE ? 'plaat' : 'voertuig';
}

export function AiCam() {
  const image = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>('zoekt');
  const readout = useGame((s) => s.readout);
  const online = useGame((s) => s.online);
  const latest = useRef(readout);
  latest.current = readout;

  // Meld het canvas aan bij de 3D-scène, die er dan het camerabeeld in tekent.
  useEffect(() => {
    feed.canvas = image.current;
    return () => { feed.canvas = null; feed.plate = null; };
  }, []);

  useEffect(() => {
    let frame = 0;
    let readingSince = 0;
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const ctx = overlay.current?.getContext('2d');
      if (!ctx) return;
      const plate = feed.plate;
      const current = latest.current;
      const next = phaseOf(plate, current);
      setPhase((old) => (old === next ? old : next));
      if (next === 'lezen' && !readingSince) readingSince = now;
      if (next !== 'lezen') readingSince = 0;

      ctx.clearRect(0, 0, FEED_WIDTH, FEED_HEIGHT);
      ctx.font = '600 11px "Barlow", sans-serif';
      ctx.textBaseline = 'bottom';
      if (!plate) {
        // Zoekt: een lijn die over het beeld veegt.
        const x = ((now / 1600) % 1) * FEED_WIDTH;
        ctx.fillStyle = 'rgba(79, 209, 197, .18)';
        ctx.fillRect(x - 24, 0, 24, FEED_HEIGHT);
        return;
      }

      // Het voertuig: een ruw kader rond de auto, met de plaat onderin.
      const carW = plate.w * 3.6;
      const carH = plate.h * 11;
      const carX = plate.x + plate.w / 2 - carW / 2;
      const carY = plate.y + plate.h * 2.2 - carH;
      ctx.strokeStyle = 'rgba(79, 209, 197, .75)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(carX, carY, carW, carH);
      ctx.setLineDash([]);
      label(ctx, `voertuig · ${Math.round(plate.distance)} m`, carX, carY, 'rgba(79, 209, 197, .9)');
      if (next === 'voertuig') return;

      // De plaat: geel tijdens het zoeken en lezen, groen of rood als de slagboom heeft beslist.
      const pad = Math.max(3, plate.w * 0.25);
      const box = { x: plate.x - pad, y: plate.y - pad, w: plate.w + 2 * pad, h: plate.h + 2 * pad };
      const color = next !== 'klaar' ? '#ffd21f' : current?.open ? '#3fd16b' : '#ff5a4d';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(box.x, box.y, box.w, box.h);
      if (next === 'lezen') {
        const t = ((now - readingSince) / 700) % 1;
        ctx.fillStyle = 'rgba(255, 210, 31, .35)';
        ctx.fillRect(box.x + t * box.w - 2, box.y, 4, box.h);
        // De tekens verschijnen een voor een, zoals de herkenning ze leest.
        const shown = Math.min(plate.plate.length, Math.floor((now - readingSince) / 160));
        label(ctx, plate.plate.slice(0, shown).padEnd(plate.plate.length, '·'), box.x, box.y, color);
      } else if (next === 'klaar' && current) {
        label(ctx, `${current.plate} · ${current.country}`, box.x, box.y, color);
      } else {
        label(ctx, 'kentekenplaat', box.x, box.y, color);
      }

      // Uitvergroting van de plaat rechtsonder, zoals de herkenning hem bekijkt.
      const source = image.current;
      if (source && plate.w > 10) {
        const zoomW = 120;
        const zoomH = Math.round((zoomW * box.h) / box.w);
        const zx = FEED_WIDTH - zoomW - 6;
        const zy = FEED_HEIGHT - zoomH - 6;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(source, box.x, box.y, box.w, box.h, zx, zy, zoomW, zoomH);
        ctx.strokeStyle = color;
        ctx.strokeRect(zx, zy, zoomW, zoomH);
      }
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  const plate = feed.plate;
  const done = phase === 'klaar' && readout;
  const seen = phase === 'lezen' || phase === 'klaar' ? readout : null;
  const steps: { label: string; detail?: string; state: 'klaar' | 'bezig' | 'wacht' }[] = [
    { label: phase === 'zoekt' ? 'Zoekt naar een voertuig' : 'Voertuig gedetecteerd', state: phase === 'zoekt' ? 'bezig' : 'klaar' },
    ...(seen && EMERGENCY_TYPES.includes(seen.type) ? [{
      label: seen.siren ? 'Zwaailicht en sirene gezien' : 'Geen zwaailicht of sirene',
      detail: seen.siren ? 'Hulpdienst met spoed: mag altijd door' : 'Gewone controle van het kenteken',
      state: 'klaar' as const,
    }] : []),
    { label: 'Kentekenplaat gevonden', state: phase === 'zoekt' ? 'wacht' : phase === 'voertuig' ? 'bezig' : 'klaar' },
    {
      label: 'Tekens lezen',
      detail: done ? `${readout.plate}${readout.readSeconds !== undefined ? `, in ${seconds(readout.readSeconds)}` : ''}` : undefined,
      state: phase === 'lezen' || phase === 'plaat' ? 'bezig' : done ? 'klaar' : 'wacht',
    },
    { label: 'Land bepalen', detail: done ? countryName(readout.country) : undefined, state: done ? 'klaar' : 'wacht' },
    {
      label: online ? 'Boeking controleren' : 'Lokale kentekenlijst controleren',
      detail: done ? `${readout.open ? 'Slagboom open' : 'Slagboom dicht'}${readout.reason ? `: ${readout.reason}` : ''}` : undefined,
      state: done ? 'klaar' : 'wacht',
    },
  ];

  return (
    <section className="ai-cam" aria-label="AI-camera bij de ingang">
      <p className="ai-cam-kop"><span className="ai-cam-rec" aria-hidden="true" /> AI-camera ingang{!online && <span className="ai-cam-net">Geen internet</span>}</p>
      <div className="ai-cam-beeld">
        <canvas ref={image} width={FEED_WIDTH} height={FEED_HEIGHT} />
        <canvas ref={overlay} width={FEED_WIDTH} height={FEED_HEIGHT} aria-hidden="true" />
      </div>
      <ol className="ai-cam-stappen">
        {steps.map((step) => (
          <li key={step.label} className={step.state}>
            <span aria-hidden="true">{step.state === 'klaar' ? '✓' : step.state === 'bezig' ? '…' : '·'}</span>
            {step.label}{step.detail ? <small>{step.detail}</small> : null}
          </li>
        ))}
      </ol>
      {!plate && <p className="ai-cam-hint">Rijd naar de slagboom: de camera kijkt naar de inrijbaan.</p>}
    </section>
  );
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  const width = ctx.measureText(text).width + 8;
  const top = Math.max(14, y);
  ctx.fillStyle = color;
  ctx.fillRect(x, top - 14, width, 14);
  ctx.fillStyle = '#081018';
  ctx.fillText(text, x + 4, top - 1);
}
