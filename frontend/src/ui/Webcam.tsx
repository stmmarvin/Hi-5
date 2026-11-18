// De webcam als camera bij de ingang. Zodra het tabblad open is gaat de camera aan en leest hij doorlopend wat in
// de kentekenbalk staat, uit elk Europees land. Een herkend kenteken wordt zonder klikken opgezocht in de
// boekingen en naar de slagboom gestuurd.
import { useEffect, useRef, useState } from 'react';
import { checkPlate, sendCustom, useGame } from '../sim/engine';
import { cleanPlateInput, COUNTRIES, countryName, formatPlate, plateKeyOf } from '../sim/plates';
import { Plate } from './Plate';
import { scanFrame, warmUp, type Detection } from './ocr';

const PAUSE_BETWEEN_SCANS = 120;   // milliseconden rust tussen twee zoekrondes
const SAME_PLATE_PAUSE = 25000;    // zo lang wordt hetzelfde kenteken niet opnieuw naar de slagboom gestuurd
const SHOW_FOUND = 2500;           // zo lang blijft de balk groen na een gelezen kenteken
const GUIDE_WIDTH = 0.72;          // breedte van de kentekenbalk, als deel van het beeld
const GUIDE_ASPECT = 4.2;          // breedte : hoogte van de balk (een Europese plaat met wat ruimte)
/** Er wordt iets ruimer gelezen dan de balk, zodat een plaat die niet precies past ook telt. */
const READ_MARGIN = { x: 0.12, y: 0.9 };

interface Check {
  plate: string;
  country: string;
  booked: boolean;
  title: string;
  text: string;
}

/** Zoekt het gelezen kenteken op in de boekingen en zegt wat de slagboom ermee doet. */
function checkBooking(plate: string, country: string): Check {
  const result = checkPlate(plate);
  if (result.open) {
    return { plate, country, booked: true, title: `Geboekt: ${result.holder}`, text: `${result.reason}. De slagboom gaat vanzelf open.` };
  }
  if (result.code === 'unknown') {
    return {
      plate, country, booked: false, title: 'Niet geboekt',
      text: 'Dit kenteken staat niet in de boekingen. De slagboom blijft dicht en de bestuurder belt aan via de intercom.',
    };
  }
  return {
    plate, country, booked: false, title: `Geen geldige toegang: ${result.holder}`,
    text: `${result.reason}. De slagboom blijft dicht en de bestuurder belt aan via de intercom.`,
  };
}

function cameraProblem(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError') return 'De camera is geblokkeerd. Sta de camera toe via het slotje in de adresbalk; daarna start hij vanzelf.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Er is geen camera gevonden op deze computer.';
  if (name === 'NotReadableError') return 'De camera is al in gebruik door een ander programma. Sluit dat programma.';
  return 'De camera kon niet worden gestart.';
}

const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

export function WebcamScanner() {
  const permits = useGame((s) => s.permits);
  const playing = useGame((s) => s.phase === 'playing');
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const sent = useRef(new Map<string, number>());
  const previous = useRef('');
  const [live, setLive] = useState(false);
  /** De gebruiker heeft de camera zelf uitgezet: dan gaat hij niet vanzelf weer aan. */
  const [off, setOff] = useState(false);
  const [aspect, setAspect] = useState(16 / 9);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [resolution, setResolution] = useState('1280');
  const [mirror, setMirror] = useState(false);
  const [status, setStatus] = useState('De camera wordt gestart…');
  /** zoekt: geel en knipperend; gevonden: groen, het kenteken is gelezen. */
  const [bar, setBar] = useState<'zoekt' | 'gevonden'>('zoekt');
  const [check, setCheck] = useState<Check | null>(null);
  const [error, setError] = useState('');
  const [plate, setPlate] = useState('');
  const [country, setCountry] = useState('NL');

  function stopCamera() {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setLive(false);
  }

  async function refreshDevices() {
    const all = await navigator.mediaDevices.enumerateDevices();
    setDevices(all.filter((device) => device.kind === 'videoinput'));
  }

  async function startCamera() {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('De camera werkt alleen via localhost of een https-adres.');
      return;
    }
    const size = { width: { ideal: Number(resolution) }, height: { ideal: Number(resolution) * 9 / 16 } };
    try {
      let media: MediaStream;
      try {
        media = await navigator.mediaDevices.getUserMedia({
          audio: false, video: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), ...size },
        });
      } catch (err) {
        // De gekozen camera of resolutie bestaat niet (meer): probeer het met de standaardcamera.
        if (!(err instanceof DOMException) || (err.name !== 'OverconstrainedError' && err.name !== 'NotFoundError')) throw err;
        media = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      }
      stream.current = media;
      setLive(true);
      setStatus('Scannen… houd een kenteken in de balk.');
      await refreshDevices();
    } catch (err) {
      stopCamera();
      setError(cameraProblem(err));
    }
  }

  // De camera gaat vanzelf aan zodra dit tabblad open is, en weer uit als je het verlaat.
  useEffect(() => {
    warmUp();
    if (!off) void startCamera();
    return stopCamera;
    // Opnieuw starten gebeurt alleen bij een andere camera, resolutie of na zelf aan- of uitzetten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [off, deviceId, resolution]);

  // Is de camera eerder geweigerd en daarna toch toegestaan, dan start hij vanzelf.
  useEffect(() => {
    if (!navigator.permissions || off) return;
    let state: PermissionStatus | null = null;
    const retry = () => { if (state?.state === 'granted' && !stream.current) void startCamera(); };
    navigator.permissions.query({ name: 'camera' as PermissionName }).then((result) => {
      state = result;
      result.addEventListener('change', retry);
    }).catch(() => undefined);
    return () => state?.removeEventListener('change', retry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [off]);

  // Het <video>-element bestaat pas als de camera aan staat; koppel de stream zodra het er is.
  useEffect(() => {
    const element = video.current;
    if (!live || !element || !stream.current) return;
    element.srcObject = stream.current;
    const ready = () => { if (element.videoWidth) setAspect(element.videoWidth / element.videoHeight); };
    element.addEventListener('loadedmetadata', ready);
    element.play().catch(() => setError('Het camerabeeld kon niet worden afgespeeld.'));
    return () => element.removeEventListener('loadedmetadata', ready);
  }, [live]);

  /** Een kenteken is twee keer achter elkaar hetzelfde gelezen: opzoeken en naar de slagboom sturen. */
  function handle(found: Detection) {
    setCheck(checkBooking(found.plate, found.country));
    setPlate(found.plate);
    setCountry(found.country);
    const land = countryName(found.country) + (found.basis === 'vorm' && found.alternatives.length ? ' (afgeleid uit de vorm)' : '');
    if (useGame.getState().phase !== 'playing') {
      setStatus(`Herkend: ${found.plate}, ${land}. Start een simulatie om het naar de slagboom te sturen.`);
      return;
    }
    // Bij zelf rijden rijd alleen jij; de webcam laat dan alleen zien of het kenteken geboekt is.
    if (useGame.getState().mode !== 'simulatie') {
      setStatus(`Herkend: ${found.plate}, ${land}. Bij zelf rijden wordt er geen auto naar de slagboom gestuurd.`);
      return;
    }
    const last = sent.current.get(found.key) ?? 0;
    if (Date.now() - last < SAME_PLATE_PAUSE) {
      setStatus(`Herkend: ${found.plate}, ${land}. Dit kenteken is net al naar de slagboom gestuurd.`);
      return;
    }
    const problem = sendCustom(found.plate, found.country);
    if (problem) {
      setError(problem);
      return;
    }
    sent.current.set(found.key, Date.now());
    setError('');
    setStatus(`Herkend: ${found.plate}, ${land}. De auto rijdt naar de slagboom.`);
  }

  // Doorlopend zoeken zolang de camera aan staat: geen knop nodig.
  const latestPermits = useRef(permits);
  latestPermits.current = permits;
  const latestHandle = useRef(handle);
  latestHandle.current = handle;
  useEffect(() => {
    if (!live) return;
    let running = true;
    let foundUntil = 0;
    const frame = document.createElement('canvas');
    (async () => {
      while (running) {
        const element = video.current;
        if (!element?.videoWidth || document.hidden) {
          await pause(400);
          continue;
        }
        // Alleen het stuk rond de kentekenbalk wordt gelezen.
        const barWidth = element.videoWidth * GUIDE_WIDTH;
        const barHeight = barWidth / GUIDE_ASPECT;
        const width = Math.min(element.videoWidth, barWidth * (1 + 2 * READ_MARGIN.x));
        const height = Math.min(element.videoHeight, barHeight * (1 + 2 * READ_MARGIN.y));
        frame.width = Math.round(width);
        frame.height = Math.round(height);
        frame.getContext('2d', { willReadFrequently: true })!.drawImage(
          element, (element.videoWidth - width) / 2, (element.videoHeight - height) / 2, width, height, 0, 0, frame.width, frame.height,
        );
        try {
          const { detection } = await scanFrame(frame, latestPermits.current);
          if (!running) break;
          if (detection) {
            // Pas doorgaan als twee rondes achter elkaar hetzelfde kenteken lezen: zo telt een misser niet.
            if (previous.current === detection.key) {
              foundUntil = Date.now() + SHOW_FOUND;
              setBar('gevonden');
              latestHandle.current(detection);
            } else setStatus(`Kenteken gevonden: ${detection.plate}. Even stilhouden…`);
            previous.current = detection.key;
          } else {
            previous.current = '';
            if (Date.now() > foundUntil) {
              setBar('zoekt');
              setStatus('Scannen… houd een kenteken in de balk.');
            }
          }
        } catch {
          setError('De tekstherkenning kon niet worden geladen. Start de site opnieuw met "npm run dev" of bouw de container opnieuw.');
          await pause(3000);
        }
        await pause(PAUSE_BETWEEN_SCANS);
      }
    })();
    return () => { running = false; };
  }, [live]);

  /** Verkeerd gelezen? De receptie verbetert het kenteken of het land en stuurt het alsnog. */
  function sendCorrection() {
    const problem = sendCustom(plate, country);
    if (problem) {
      setError(problem);
      return;
    }
    sent.current.set(plateKeyOf(plate), Date.now());
    setError('');
    setStatus(`${plate} rijdt naar de slagboom.`);
  }

  function changePlate(value: string) {
    const cleaned = cleanPlateInput(value);
    setPlate(cleaned);
    setCheck(cleaned.trim().length >= 4 ? checkBooking(cleaned.trim(), country) : null);
  }

  function callIntercomForUnreadable() {
    const problem = sendCustom('ONBEKEND');
    if (problem) {
      setError(problem);
      return;
    }
    setStatus('Het kenteken is niet leesbaar (modder, sneeuw of schade). De bestuurder belt aan via de intercom.');
  }

  return (
    <div className="blok webcam">
      <h3>Camera bij de ingang (webcam)</h3>
      {off ? (
        <>
          <p className="klein-tekst">De camera staat uit. Er wordt niets gelezen.</p>
          <button type="button" className="knop" onClick={() => setOff(false)}>Zet de camera weer aan</button>
        </>
      ) : (
        <>
          <div className="webcam-beeld" style={{ aspectRatio: aspect }}>
            {live && <video ref={video} muted playsInline autoPlay style={{ transform: mirror ? 'scaleX(-1)' : undefined }} />}
            <span className={`kader ${bar}`} style={{ width: `${GUIDE_WIDTH * 100}%`, aspectRatio: GUIDE_ASPECT }} aria-hidden="true" />
          </div>
          <p className="camera-status" role="status">{status}</p>
          <p className="klein-tekst">
            Houd een kenteken uit een Europees land in de balk. De camera scant vanzelf tot hij het kenteken heeft,
            zoekt het op in de boekingen en stuurt de auto naar de slagboom. Het beeld blijft op deze computer.
          </p>
        </>
      )}

      {check && (
        <div className={`boeking ${check.booked ? 'goed' : 'fout'}`}>
          <Plate plate={check.plate} country={check.country} />
          <strong>{check.title}</strong>
          <p>{check.text}</p>
        </div>
      )}
      {error && <p className="fout" role="alert">{error}</p>}

      <details className="camera-meer">
        <summary>Verkeerd gelezen, camera-instellingen of onleesbaar kenteken</summary>
        <label>
          Kenteken verbeteren
          <div className="rijtje">
            <input className="kenteken-invoer" value={plate} onChange={(e) => changePlate(e.target.value)} placeholder="bijvoorbeeld K XM 2291" maxLength={14} />
            <select value={country} onChange={(e) => { setCountry(e.target.value); setPlate((p) => formatPlate(p, e.target.value)); }} aria-label="Land">
              {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
            </select>
          </div>
        </label>
        <div className="rijtje">
          <button type="button" className="knop" onClick={sendCorrection} disabled={!plate}>Stuur verbeterd kenteken</button>
          <button type="button" className="knop" onClick={callIntercomForUnreadable}>Kenteken onleesbaar: bel aan</button>
        </div>
        <div className="camera-instellingen">
          <label>Camera
            <select value={deviceId} onChange={(event) => setDeviceId(event.target.value)}>
              <option value="">Standaardcamera</option>
              {devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}
            </select>
          </label>
          <label>Resolutie
            <select value={resolution} onChange={(event) => setResolution(event.target.value)}>
              <option value="640">640 × 360</option>
              <option value="1280">1280 × 720</option>
              <option value="1920">1920 × 1080</option>
            </select>
          </label>
          <label className="schakel licht">
            <input type="checkbox" checked={mirror} onChange={(event) => setMirror(event.target.checked)} />
            Spiegelbeeld
          </label>
        </div>
        {!off && <button type="button" className="knop" onClick={() => setOff(true)}>Zet de camera uit</button>}
        {!playing && <p className="klein-tekst">Start een simulatie om herkende kentekens naar de slagboom te sturen.</p>}
      </details>
    </div>
  );
}
