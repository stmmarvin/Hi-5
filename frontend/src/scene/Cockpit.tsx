// De binnenkant van de auto. Interior is het interieur zelf (dashboard, stuur, tellers, stoelen); dat zie je
// ook van buiten door de ruiten. Cockpit is wat de bestuurder ziet zolang je "binnen" kijkt: het interieur
// met raamstijlen, spiegels en de motorkap, in plaats van de buitenkant.
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { CanvasTexture, DoubleSide, MeshPhysicalMaterial, MeshStandardMaterial, Quaternion, SRGBColorSpace, Vector3, type Group } from 'three';
import type { SimVehicle } from '../sim/engine';
import { cabinOf, SILL, specOf } from './Car';
import { chromeMaterial } from './parts';

const dash = new MeshStandardMaterial({ color: '#1b1d20', roughness: 0.85 });
const trim = new MeshStandardMaterial({ color: '#2a2d31', roughness: 0.7 });
const lining = new MeshStandardMaterial({ color: '#c9c6bd', roughness: 0.95 });
const leather = new MeshStandardMaterial({ color: '#15171a', roughness: 0.55 });
const seat = new MeshStandardMaterial({ color: '#7d6753', roughness: 0.7 });
const carpet = new MeshStandardMaterial({ color: '#1f2226', roughness: 0.95 });
const mirror = new MeshStandardMaterial({ color: '#8fa3b3', roughness: 0.05, metalness: 1 });
const sideGlass = new MeshStandardMaterial({ color: '#8fb6c9', transparent: true, opacity: 0.3, roughness: 0.05, metalness: 0.4, side: DoubleSide, depthWrite: false });
const glassEdge = new MeshStandardMaterial({ color: '#d7e6ee', roughness: 0.2 });
const indicatorOn = new MeshStandardMaterial({ color: '#2bd45a', emissive: '#2bd45a', emissiveIntensity: 2 });

/** Waar de ogen van de bestuurder zitten, in de coördinaten van de auto (links van het midden). */
export function eyeOf(model: string): [number, number, number] {
  const spec = specOf(model);
  return [0.37, spec.H - 0.27, spec.cowl - 1.02];
}

/** Balk tussen twee punten, voor de schuine raamstijlen. */
function Strut({ from, to, thickness }: { from: [number, number, number]; to: [number, number, number]; thickness: number }) {
  const { position, quaternion, length } = useMemo(() => {
    const a = new Vector3(...from);
    const b = new Vector3(...to);
    return {
      position: a.clone().add(b).multiplyScalar(0.5),
      quaternion: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize()),
      length: a.distanceTo(b),
    };
  }, [from, to]);
  return (
    <mesh position={position} quaternion={quaternion} material={trim}>
      <boxGeometry args={[thickness, length, thickness * 1.3]} />
    </mesh>
  );
}

function Seat({ at, width, backHeight }: { at: [number, number, number]; width: number; backHeight: number }) {
  return (
    <group position={at}>
      <mesh position={[0, 0.08, 0]} material={seat}><boxGeometry args={[width, 0.16, 0.5]} /></mesh>
      <mesh position={[0, 0.16 + backHeight / 2 - 0.02, -0.3]} rotation={[-0.2, 0, 0]} material={seat}><boxGeometry args={[width - 0.02, backHeight, 0.11]} /></mesh>
      <mesh position={[0, 0.16 + backHeight + 0.08, -0.4]} rotation={[-0.1, 0, 0]} material={seat}><boxGeometry args={[0.26, 0.19, 0.1]} /></mesh>
    </group>
  );
}

/**
 * Het interieur. Met `full` komen de vloer, de bekleding van de portieren, de stoelen en de achterbank erbij:
 * dat is nodig als je van buiten door de ruiten naar binnen kijkt.
 */
export function Interior({ vehicle, full = false }: { vehicle: SimVehicle; full?: boolean }) {
  const spec = specOf(vehicle.model);
  const wheel = useRef<Group>(null);
  const left = useRef<Group>(null);
  const right = useRef<Group>(null);
  const shown = useRef(-1);
  const gauge = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 192;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return { canvas, texture };
  }, []);

  useFrame(({ clock }) => {
    if (wheel.current) wheel.current.rotation.z = (vehicle.steer ?? 0) * 1.9;
    const blinking = Math.floor(clock.elapsedTime * 2) % 2 === 0;
    if (left.current) left.current.visible = vehicle.indicator === 'left' && blinking;
    if (right.current) right.current.visible = vehicle.indicator === 'right' && blinking;

    // De tellers worden alleen opnieuw getekend als de snelheid verandert.
    const kmh = Math.round(Math.abs(vehicle.speed ?? 0) * 3.6);
    if (kmh === shown.current) return;
    shown.current = kmh;
    const ctx = gauge.canvas.getContext('2d')!;
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, 512, 192);
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1d2733';
    ctx.beginPath(); ctx.arc(256, 150, 118, Math.PI, 2 * Math.PI); ctx.stroke();
    ctx.strokeStyle = kmh > 30 ? '#ff5a4d' : '#4fd1c5';
    ctx.beginPath(); ctx.arc(256, 150, 118, Math.PI, Math.PI * (1 + Math.min(1, kmh / 80))); ctx.stroke();
    ctx.fillStyle = '#f2f6fa';
    ctx.textAlign = 'center';
    ctx.font = '700 92px "Barlow Condensed", Arial, sans-serif';
    ctx.fillText(String(kmh), 256, 142);
    ctx.font = '500 30px "Barlow", Arial, sans-serif';
    ctx.fillStyle = '#9fb0c2';
    ctx.fillText('km/u', 256, 178);
    ctx.textAlign = 'left';
    ctx.fillText((vehicle.speed ?? 0) < -0.2 ? 'R' : 'D', 28, 178);
    gauge.texture.needsUpdate = true;
  });

  const half = spec.W / 2;
  const dashZ = spec.cowl - 0.28;      // midden van het dashboard
  const dashTop = spec.belt + 0.03;
  const wheelAt: [number, number, number] = [0.37, dashTop - 0.2, spec.cowl - 0.62];
  const cabin = cabinOf(spec);
  const inner = spec.W - 0.14;                 // breedte tussen de portieren
  const seatZ = spec.cowl - 1.04;              // de bestuurder zit hier (zie eyeOf)
  const seatTop = Math.min(1.19, spec.H - 0.26);
  const benchDepth = Math.max(0.16, Math.min(0.4, seatZ - 0.34 - cabin.archFront));
  const sideLength = cabin.front - cabin.rear;

  return (
    <group>
      {/* dashboard met kap boven de tellers */}
      <mesh position={[0, dashTop - 0.16, dashZ]} material={dash}><boxGeometry args={[spec.W - 0.24, 0.34, 0.6]} /></mesh>
      <mesh position={[0.37, dashTop + 0.03, dashZ - 0.1]} material={dash}><boxGeometry args={[0.46, 0.05, 0.3]} /></mesh>
      <mesh position={[0.37, dashTop - 0.07, dashZ - 0.305]} rotation={[0.25, Math.PI, 0]}>
        <planeGeometry args={[0.36, 0.135]} /><meshBasicMaterial map={gauge.texture} toneMapped={false} />
      </mesh>
      <group ref={right} position={[0.37 - 0.15, dashTop - 0.03, dashZ - 0.31]}><mesh material={indicatorOn}><boxGeometry args={[0.03, 0.02, 0.005]} /></mesh></group>
      <group ref={left} position={[0.37 + 0.15, dashTop - 0.03, dashZ - 0.31]}><mesh material={indicatorOn}><boxGeometry args={[0.03, 0.02, 0.005]} /></mesh></group>
      {/* middenscherm en middenconsole */}
      <mesh position={[0, dashTop - 0.08, dashZ - 0.31]} rotation={[0.15, Math.PI, 0]}>
        <planeGeometry args={[0.3, 0.17]} /><meshStandardMaterial color="#0c1620" emissive="#1c4a66" emissiveIntensity={0.35} roughness={0.2} />
      </mesh>
      <mesh position={[0, dashTop - 0.5, spec.cowl - 0.85]} material={trim}><boxGeometry args={[0.26, 0.3, 0.9]} /></mesh>

      {/* stuur: draait mee met de stuurstand */}
      <group position={wheelAt} rotation={[0.38, 0, 0]}>
        <mesh position={[0, 0, 0.14]} rotation={[Math.PI / 2, 0, 0]} material={trim}><cylinderGeometry args={[0.035, 0.045, 0.28, 10]} /></mesh>
        <group ref={wheel}>
          <mesh material={leather}><torusGeometry args={[0.185, 0.019, 10, 36]} /></mesh>
          <mesh material={leather}><boxGeometry args={[0.36, 0.04, 0.025]} /></mesh>
          <mesh position={[0, -0.09, 0]} material={leather}><boxGeometry args={[0.04, 0.18, 0.025]} /></mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} material={trim}><cylinderGeometry args={[0.055, 0.055, 0.04, 16]} /></mesh>
          <mesh position={[0, 0, -0.022]} rotation={[Math.PI / 2, 0, 0]} material={chromeMaterial}><cylinderGeometry args={[0.02, 0.02, 0.005, 12]} /></mesh>
        </group>
      </group>

      {full ? (
        <>
          {/* vloer, schot naar de motorruimte en de bekleding van de portieren */}
          <mesh position={[0, SILL + 0.06, (cabin.rear + cabin.firewall) / 2]} material={carpet}><boxGeometry args={[inner, 0.1, cabin.firewall - cabin.rear]} /></mesh>
          <mesh position={[0, (SILL + spec.belt) / 2, cabin.firewall]} material={carpet}><boxGeometry args={[inner, spec.belt - SILL - 0.02, 0.06]} /></mesh>
          <mesh position={[0, (SILL + spec.belt) / 2, cabin.rear + 0.03]} material={carpet}><boxGeometry args={[inner, spec.belt - SILL - 0.02, 0.06]} /></mesh>
          {[-1, 1].map((side) => (
            <group key={side}>
              <mesh position={[side * (half - 0.12), (SILL + spec.belt) / 2, (cabin.front + cabin.rear) / 2]} material={trim}>
                <boxGeometry args={[0.1, spec.belt - SILL - 0.02, sideLength]} />
              </mesh>
              <mesh position={[side * (half - 0.2), spec.belt - 0.2, spec.cowl - 1]} material={dash}><boxGeometry args={[0.07, 0.06, 0.6]} /></mesh>
              <Seat at={[side * 0.37, 0.3, seatZ]} width={0.48} backHeight={seatTop - 0.56} />
            </group>
          ))}
          {/* achterste wielkasten, achterbank en hoedenplank */}
          <mesh position={[0, (SILL + cabin.archTop) / 2, (cabin.rear + cabin.archFront) / 2]} material={carpet}>
            <boxGeometry args={[inner, cabin.archTop - SILL, cabin.archFront - cabin.rear]} />
          </mesh>
          <mesh position={[0, 0.38, cabin.archFront + benchDepth / 2]} material={seat}><boxGeometry args={[inner - 0.3, 0.16, benchDepth]} /></mesh>
          <mesh position={[0, (0.44 + spec.belt + 0.2) / 2, cabin.archFront - 0.02]} rotation={[-0.16, 0, 0]} material={seat}>
            <boxGeometry args={[inner - 0.3, spec.belt + 0.2 - 0.44, 0.12]} />
          </mesh>
          <mesh position={[0, spec.belt - 0.07, (cabin.rear + cabin.archFront) / 2 - 0.06]} material={carpet}>
            <boxGeometry args={[inner, 0.03, Math.max(0.05, cabin.archFront - cabin.rear - 0.12)]} />
          </mesh>
        </>
      ) : [-1, 1].map((side) => (
        <group key={side}>
          {/* portier met armsteun */}
          <mesh position={[side * (half - 0.1), spec.belt - 0.26, spec.cowl - 0.95]} material={trim}><boxGeometry args={[0.1, 0.56, 2]} /></mesh>
          <mesh position={[side * (half - 0.17), spec.belt - 0.2, spec.cowl - 1]} material={dash}><boxGeometry args={[0.08, 0.06, 0.6]} /></mesh>
        </group>
      ))}
      {/* hemel en binnenspiegel */}
      <mesh position={[0, spec.H - 0.07, (spec.roofFront + spec.roofRear) / 2]} material={lining}>
        <boxGeometry args={[spec.W - (full ? 0.64 : 0.46), 0.03, spec.roofFront - spec.roofRear]} />
      </mesh>
      <mesh position={[0, spec.H - 0.17, spec.roofFront - 0.1]} material={trim}><boxGeometry args={[0.24, 0.075, 0.03]} /></mesh>
      <mesh position={[0, spec.H - 0.17, spec.roofFront - 0.117]} rotation={[0, Math.PI, 0]} material={mirror}><planeGeometry args={[0.22, 0.06]} /></mesh>
    </group>
  );
}

export function Cockpit({ vehicle }: { vehicle: SimVehicle }) {
  const spec = specOf(vehicle.model);
  const panes = useRef<(Group | null)[]>([]);
  const paint = useMemo(() => new MeshPhysicalMaterial({ color: vehicle.color, roughness: 0.38, metalness: 0.55, clearcoat: 1 }), [vehicle.color]);

  useFrame((_, delta) => {
    // Zijruiten zakken in de deur als het raam open staat.
    const drop = vehicle.windowsOpen ? -(spec.H - spec.belt) + 0.04 : 0;
    for (const pane of panes.current) {
      if (pane) pane.position.y += (drop - pane.position.y) * Math.min(1, delta * 3);
    }
  });

  const half = spec.W / 2;
  const frontLength = spec.L / 2 - spec.cowl;

  return (
    <group>
      {/* motorkap, loopt af naar de neus */}
      <mesh position={[0, (spec.belt + spec.hood) / 2 - 0.03, spec.cowl + frontLength / 2]} rotation={[Math.atan2(spec.belt - spec.hood, frontLength), 0, 0]} material={paint}>
        <boxGeometry args={[spec.W - 0.14, 0.06, frontLength + 0.05]} />
      </mesh>
      <Interior vehicle={vehicle} />

      {/* raamstijlen en dakrand */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <Strut from={[side * (half - 0.14), spec.belt, spec.cowl + 0.02]} to={[side * (half - 0.25), spec.H - 0.05, spec.roofFront]} thickness={0.055} />
          {/* zijruit: licht getint, met een zichtbare bovenrand zodat je hem ziet zakken */}
          <group ref={(group) => { panes.current[side < 0 ? 0 : 1] = group; }}>
            <mesh position={[side * (half - 0.16), (spec.belt + spec.H) / 2 - 0.06, spec.cowl - 0.95]} rotation={[0, Math.PI / 2, 0]} material={sideGlass}>
              <planeGeometry args={[1.7, spec.H - spec.belt - 0.12]} />
            </mesh>
            <mesh position={[side * (half - 0.16), spec.H - 0.12, spec.cowl - 0.95]} material={glassEdge}><boxGeometry args={[0.012, 0.012, 1.7]} /></mesh>
          </group>
          {/* buitenspiegel */}
          <mesh position={[side * (half + 0.03), spec.belt + 0.08, spec.cowl - 0.3]} material={paint}><boxGeometry args={[0.2, 0.12, 0.07]} /></mesh>
          <mesh position={[side * (half + 0.03), spec.belt + 0.08, spec.cowl - 0.337]} rotation={[0, Math.PI, 0]} material={mirror}><planeGeometry args={[0.17, 0.09]} /></mesh>
        </group>
      ))}
      <mesh position={[0, spec.H - 0.05, spec.roofFront - 0.02]} material={trim}><boxGeometry args={[spec.W - 0.44, 0.07, 0.12]} /></mesh>
    </group>
  );
}
