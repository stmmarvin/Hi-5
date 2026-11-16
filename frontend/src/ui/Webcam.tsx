import { useEffect, useRef, useState } from 'react';
import { checkPlate, cleanDutchPlateInput, sendCustom, useGame } from '../sim/engine';
import { plateKey } from '../sim/rules';
import { Plate } from './Plate';
import { readPlate } from './ocr';

const GUIDE_WIDTH = 0.72;   // deel van de beeldbreedte
const GUIDE_ASPECT = 4.2;   // breedte : hoogte van een kentekenplaat (met wat marge)
const SCAN_EVERY = 1400;    // milliseconden tussen twee automatische lezingen
const SAME_PLATE_PAUSE = 25000; // zo lang wordt hetzelfde kenteken niet opnieuw doorgestuurd

/** Een lezing telt alleen als kenteken als er letters en cijfers in staan. */
const looksLikePlate = (key: string) => key.length >= 4 && key.length <= 8 && /[A-Z]/.test(key) && /[0-9]/.test(key);

interface Check {
  plate: string;
  booked: boolean;
  title: string;
  text: string;
}

/** Zoekt het gelezen kenteken op in de boekingen en zegt wat de slagboom ermee doet. */
function checkBooking(plate: string): Check {
  const result = checkPlate(plate);
  if (result.open) {
    return {
      plate, booked: true, title: `Geboekt: ${result.holder}`,
      text: `${result.reason}. De slagboom gaat vanzelf open.`,
    };
  }
  if (result.code === 'unknown') {
    return {
      plate, booked: false, title: 'Niet geboekt',
      text: 'Dit kenteken staat niet in de boekingen. De slagboom blijft dicht en de bestuurder belt aan via de intercom: "Mag ik naar binnen?"',
    };
  }
  return {
    plate, booked: false, title: `Geen geldige toegang: ${result.holder}`,
    text: `${result.reason}. De slagboom blijft dicht en de bestuurder belt aan via de intercom.`,
  };
}

function cameraProblem(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError') return 'De camera is geblokkeerd. Sta de camera toe via het slotje in de adresbalk en probeer het opnieuw.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Er is geen camera gevonden op deze computer.';
  if (name === 'NotReadableError') return 'De camera is al in gebruik door een ander programma. Sluit dat en probeer het opnieuw.';
  return 'De camera kon niet worden gestart.';
}

/** Houd een echt of geprint kenteken voor de webcam; de simulatie leest het en laat die auto aankomen. */
export function WebcamScanner() {
  const permits = useGame((s) => s.permits);
  const playing = useGame((s) => s.phase === 'playing');
  const [auto, setAuto] = useState(true);
  const [check, setCheck] = useState<Check | null>(null);
  const candidate = useRef('');
  const sent = useRef(new Map<string, number>());
  const scanning = useRef(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aspect, setAspect] = useState(16 / 9);
  const [plate, setPlate] = useState('');
  const [unreadable, setUnreadable] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [resolution, setResolution] = useState('1280');
  const [mirror, setMirror] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function stop() {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setLive(false);
  }

  useEffect(() => stop, []);

  async function refreshDevices() {
    const all = await navigator.mediaDevices.enumerateDevices();
    const cameras = all.filter((device) => device.kind === 'videoinput');
    setDevices(cameras);
    if (!deviceId && cameras[0]) setDeviceId(cameras[0].deviceId);
  }

  async function start() {
    setError('');
    setMessage('');
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
      setLive(true); // het videobeeld verschijnt nu; het effect hieronder koppelt de stream eraan
      await refreshDevices();
    } catch (err) {
      stop();
      setError(cameraProblem(err));
    }
  }

  // Het <video>-element bestaat pas als de camera aan staat; koppel de stream zodra het er is.
  useEffect(() => {
    const element = video.current;
    if (!live || !element || !stream.current) return;
    element.srcObject = stream.current;
    const ready = () => { if (element.videoWidth) setAspect(element.videoWidth / element.videoHeight); };
    element.addEventListener('loadedmetadata', ready);
    element.play().catch(() => setError('Het camerabeeld kon niet worden afgespeeld. Klik nog eens op "Zet de webcam aan".'));
    return () => element.removeEventListener('loadedmetadata', ready);
  }, [live]);

  async function applySettings() {
    if (live) stop();
    await start();
  }

  /** Leest het kenteken binnen het kader. Automatisch lezen blijft stil als er niets te zien is. */
  async function scan(manual: boolean) {
    const element = video.current;
    if (!element?.videoWidth || scanning.current) return;
    scanning.current = true;
    if (manual) {
      setBusy(true);
      setError('');
      setMessage('Kenteken lezen…');
    }
    try {
      // Alleen het stuk binnen het kader wordt gelezen.
      const width = element.videoWidth * GUIDE_WIDTH;
      const height = width / GUIDE_ASPECT;
      const crop = document.createElement('canvas');
      crop.width = Math.round(width);
      crop.height = Math.round(height);
      crop.getContext('2d')!.drawImage(
        element, (element.videoWidth - width) / 2, (element.videoHeight - height) / 2, width, height, 0, 0, crop.width, crop.height,
      );
      const result = await readPlate(crop, permits);
      const key = plateKey(result.plate);
      if (!result.plate || !(result.permit || looksLikePlate(key))) {
        candidate.current = '';
        if (manual) {
          setMessage('');
          setUnreadable(true);
          setError('Geen kenteken gevonden. Houd de plaat recht en scherp binnen het kader, met genoeg licht.');
        }
        return;
      }
      // Automatisch: pas doorgaan als twee lezingen achter elkaar hetzelfde kenteken geven.
      const stable = manual || candidate.current === key;
      candidate.current = key;
      if (!stable) return;

      setUnreadable(false);
      setError('');
      setPlate(result.plate);
      setCheck(checkBooking(result.plate));
      if (manual || !auto) {
        setMessage(`Gelezen: ${result.plate}. Klopt het niet, verbeter het dan hieronder.`);
        return;
      }
      const last = sent.current.get(key) ?? 0;
      if (Date.now() - last < SAME_PLATE_PAUSE) return;
      const problem = sendCustom(result.plate);
      if (problem) {
        setMessage(problem);
        return;
      }
      sent.current.set(key, Date.now());
      setMessage(`${result.plate} is herkend en rijdt naar de slagboom.`);
    } catch {
      if (manual || !error) {
        setMessage('');
        setError('De tekstherkenning kon niet worden geladen. Start de site opnieuw met "npm run dev" of bouw de container opnieuw.');
      }
    } finally {
      scanning.current = false;
      if (manual) setBusy(false);
    }
  }

  // De nieuwste versie van scan(), zodat de timer nooit met oude instellingen werkt.
  const latestScan = useRef(scan);
  latestScan.current = scan;
  useEffect(() => {
    if (!live || !auto) return;
    const timer = window.setInterval(() => void latestScan.current(false), SCAN_EVERY);
    return () => window.clearInterval(timer);
  }, [live, auto]);

  function send() {
    const problem = sendCustom(plate);
    if (problem) {
      setError(problem);
      return;
    }
    sent.current.set(plateKey(plate), Date.now());
    setError('');
    setMessage(`${plate.toUpperCase()} rijdt naar de slagboom.`);
    setPlate('');
    setCheck(null);
    setUnreadable(false);
  }

  function changePlate(value: string) {
    const cleaned = cleanDutchPlateInput(value);
    setPlate(cleaned);
    setCheck(cleaned.trim().length >= 4 ? checkBooking(cleaned.trim()) : null);
  }

  function callIntercomForUnreadable() {
    const problem = sendCustom('ONBEKEND');
    if (problem) {
      setError(problem);
      return;
    }
    setMessage('Het kenteken is door modder of regen niet leesbaar. De bestuurder belt aan via de intercom.');
    setUnreadable(false);
  }

  return (
    <div className="blok webcam">
      <h3>Scan een kenteken met je webcam</h3>
      {!live ? (
        <>
          <p className="klein-tekst">
            Houd een echt of geprint kenteken voor de camera van je laptop. Het kenteken wordt gelezen en opgezocht
            in de boekingen: is er geboekt, dan gaat de slagboom open; zo niet, dan belt de bestuurder aan via de
            intercom. Het beeld blijft op deze computer: er wordt niets verstuurd of opgeslagen.
          </p>
          <div className="camera-instellingen">
            <label>Camera
              <select value={deviceId} onChange={(event) => setDeviceId(event.target.value)} onFocus={() => void refreshDevices()}>
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
          <button type="button" className="knop" onClick={() => void start()}>Zet de webcam aan</button>
        </>
      ) : (
        <>
          <div className="webcam-beeld" style={{ aspectRatio: aspect }}>
            <video ref={video} muted playsInline autoPlay style={{ transform: mirror ? 'scaleX(-1)' : undefined }} />
            <span className="kader" style={{ width: `${GUIDE_WIDTH * 100}%`, aspectRatio: GUIDE_ASPECT }} />
          </div>
          <p className="klein-tekst">
            Houd het kenteken recht binnen het gele kader.
            {auto ? ' De camera leest vanzelf mee.' : ''}
            {!playing ? ' Start een simulatie om herkende kentekens naar de slagboom te sturen.' : ''}
          </p>
          <label className="schakel licht">
            <input type="checkbox" checked={auto} onChange={(event) => setAuto(event.target.checked)} />
            Automatisch lezen en naar de slagboom sturen
          </label>
          <div className="camera-instellingen">
            <label>Camera
              <select value={deviceId} onChange={(event) => setDeviceId(event.target.value)}>
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
          <div className="rijtje">
            <button type="button" className="knop primair" onClick={() => void scan(true)} disabled={busy}>
              {busy ? 'Bezig…' : 'Lees kenteken nu'}
            </button>
            <button type="button" className="knop" onClick={() => void applySettings()}>Instellingen toepassen</button>
            <button type="button" className="knop" onClick={stop}>Zet de webcam uit</button>
          </div>
        </>
      )}
      {check && (
        <div className={`boeking ${check.booked ? 'goed' : 'fout'}`} role="status">
          <Plate plate={check.plate} country="NL" />
          <strong>{check.title}</strong>
          <p>{check.text}</p>
        </div>
      )}
      {plate && (
        <label>
          Gelezen kenteken
          <div className="rijtje">
            <input className="kenteken-invoer" value={plate} onChange={(e) => changePlate(e.target.value)} maxLength={14} />
            <button type="button" className="knop" onClick={send}>Laat aankomen</button>
          </div>
        </label>
      )}
      {unreadable && (
        <button type="button" className="knop primair" onClick={callIntercomForUnreadable}>Bel intercom zonder leesbaar kenteken</button>
      )}
      {message && <p className="klein-tekst" role="status">{message}</p>}
      {error && <p className="fout" role="alert">{error}</p>}
    </div>
  );
}
