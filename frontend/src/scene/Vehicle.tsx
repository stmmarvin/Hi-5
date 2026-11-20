import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { CanvasTexture, SRGBColorSpace, type Group, type MeshStandardMaterial } from 'three';
import { hasCarBody, playerPose, useGame, VEHICLE_LENGTH, type SimVehicle } from '../sim/engine';
import { Cockpit, Interior } from './Cockpit';
import { LAYER } from './feed';
import { Car, specOf } from './Car';
import { glassMaterial, headlightMaterial, Plates, taillightMaterial, TurnSignals, Wheels } from './parts';

const LANE_X = { in: 3.3, out: -3.3 };

function Lights({ width, length, y }: { width: number; length: number; y: number }) {
  return (
    <>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * (width / 2 - 0.28), y, length / 2 + 0.01]} material={headlightMaterial}>
            <boxGeometry args={[0.34, 0.16, 0.04]} />
          </mesh>
          <mesh position={[side * (width / 2 - 0.26), y, -length / 2 - 0.01]} material={taillightMaterial}>
            <boxGeometry args={[0.3, 0.14, 0.04]} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/** Zwaailichten: twee helften die om en om knipperen. Alleen als zwaailicht en sirene aan staan. */
function Beacon({ vehicle, at, width }: { vehicle: SimVehicle; at: [number, number, number]; width: number }) {
  const left = useRef<MeshStandardMaterial>(null);
  const right = useRef<MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    const active = Boolean(vehicle.siren);
    const flash = Math.sin(clock.elapsedTime * 14) > 0;
    if (left.current) left.current.emissiveIntensity = active && flash ? 3.5 : 0.08;
    if (right.current) right.current.emissiveIntensity = active && !flash ? 3.5 : 0.08;
  });
  return (
    <group position={at}>
      <mesh position={[0, -0.07, 0]}><boxGeometry args={[width + 0.08, 0.05, 0.34]} /><meshStandardMaterial color="#20242a" /></mesh>
      <mesh position={[-width / 4, 0.03, 0]}><boxGeometry args={[width / 2 - 0.02, 0.15, 0.28]} /><meshStandardMaterial ref={left} color="#2b6fe0" emissive="#3d8bff" /></mesh>
      <mesh position={[width / 4, 0.03, 0]}><boxGeometry args={[width / 2 - 0.02, 0.15, 0.28]} /><meshStandardMaterial ref={right} color="#2b6fe0" emissive="#3d8bff" /></mesh>
    </group>
  );
}

/** Naam van de hulpdienst op beide zijkanten. */
function SideLabel({ text, x, y, z, width, height, background, ink, bands }: {
  text: string; x: number; y: number; z: number; width: number; height: number; background: string; ink: string; bands?: string[];
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = Math.round((512 * height) / width);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Schuine blokken in de kleuren van de dienst, aan beide uiteinden.
    (bands ?? []).forEach((color, i) => {
      ctx.fillStyle = color;
      for (const start of [i * 34, canvas.width - 34 * (i + 1)]) ctx.fillRect(start, 0, 26, canvas.height);
    });
    ctx.fillStyle = ink;
    ctx.font = `700 ${Math.round(canvas.height * 0.62)}px "Barlow", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const made = new CanvasTexture(canvas);
    made.colorSpace = SRGBColorSpace;
    return made;
  }, [text, width, height, background, ink, bands]);
  return (
    <>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * x, y, z]} rotation={[0, (side * Math.PI) / 2, 0]}>
          <planeGeometry args={[width, height]} />
          <meshStandardMaterial map={texture} roughness={0.5} />
        </mesh>
      ))}
    </>
  );
}

const POLICE_BANDS = ['#123a8c', '#f07d00'];

/** Striping en lichtbalk op de politieauto. */
function PoliceKit({ vehicle }: { vehicle: SimVehicle }) {
  const spec = specOf(vehicle.model);
  return (
    <>
      <SideLabel text="POLITIE" x={spec.W / 2 + 0.012} y={0.6} z={0} width={spec.wb - 2 * spec.wheel - 0.2} height={0.24} background="#f2f4f5" ink="#123a8c" bands={POLICE_BANDS} />
      <Beacon vehicle={vehicle} at={[0, spec.H + 0.08, spec.roofFront - 0.5]} width={1} />
    </>
  );
}

function Boxy({ vehicle }: { vehicle: SimVehicle }) {
  const length = VEHICLE_LENGTH[vehicle.type];
  const fire = vehicle.type === 'brandweer';
  const truck = vehicle.type === 'vrachtwagen' || fire;
  const ambulance = vehicle.type === 'ambulance';
  const width = truck ? 2.4 : 2.05;
  const cabLength = truck ? 2 : 1.5;
  const boxHeight = fire ? 2.3 : truck ? 2.7 : vehicle.type === 'camper' ? 2.3 : 1.9;
  const boxLength = length - cabLength - 0.1;
  const body = fire ? '#c8201c' : ambulance ? '#f4d21f' : truck ? '#d9dce0' : '#f4f3ec';
  const cab = fire ? body : truck ? '#2f5d8a' : body;
  const stripe = fire ? '#f4d21f' : ambulance ? '#c8281e' : vehicle.type === 'camper' ? '#5aa0c8' : truck ? '#2f5d8a' : '#c9772b';
  const service = fire ? 'BRANDWEER' : ambulance ? 'AMBULANCE' : '';

  return (
    <>
      {/* laadruimte */}
      <mesh position={[0, 0.5 + boxHeight / 2, -cabLength / 2]} castShadow>
        <boxGeometry args={[width, boxHeight, boxLength]} />
        <meshStandardMaterial color={body} roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.25, -cabLength / 2]}>
        <boxGeometry args={[width + 0.02, 0.22, boxLength - 0.3]} />
        <meshStandardMaterial color={stripe} roughness={0.6} />
      </mesh>
      {/* cabine */}
      <mesh position={[0, 0.5 + (truck ? 1.05 : 0.8), length / 2 - cabLength / 2]} castShadow>
        <boxGeometry args={[width - 0.1, truck ? 2.1 : 1.6, cabLength]} />
        <meshStandardMaterial color={cab} roughness={0.5} metalness={0.15} />
      </mesh>
      <mesh position={[0, truck ? 2 : 1.65, length / 2 - 0.02]} scale={[1, vehicle.windowsOpen ? 0.7 : 1, 1]} material={glassMaterial}>
        <boxGeometry args={[width - 0.4, 0.6, 0.1]} />
      </mesh>
      {service && (
        <>
          <Beacon vehicle={vehicle} at={[0, 0.5 + boxHeight + 0.1, boxLength / 2 - cabLength / 2 - 0.4]} width={1.1} />
          <SideLabel text={service} x={width / 2 + 0.012} y={1.72} z={-cabLength / 2} width={Math.min(3, boxLength - 0.5)} height={0.42} background={body} ink={fire ? '#fff' : '#123a8c'} />
        </>
      )}
      {fire && (
        // ladder op het dak
        <group position={[0, 0.5 + boxHeight + 0.1, -cabLength / 2 - 0.5]}>
          {[-0.28, 0.28].map((x) => <mesh key={x} position={[x, 0, 0]}><boxGeometry args={[0.06, 0.06, 3.6]} /><meshStandardMaterial color="#c9ced4" metalness={0.5} roughness={0.4} /></mesh>)}
          {Array.from({ length: 10 }, (_, i) => <mesh key={i} position={[0, 0, -1.62 + i * 0.36]}><boxGeometry args={[0.56, 0.04, 0.04]} /><meshStandardMaterial color="#c9ced4" metalness={0.5} roughness={0.4} /></mesh>)}
        </group>
      )}
      <Wheels track={width - 0.2} front={length / 2 - 1} rear={-length / 2 + 1.3} radius={truck ? 0.5 : 0.4} width={0.3} vehicle={vehicle} />
      <Lights width={width - 0.1} length={length} y={0.82} />
      <TurnSignals vehicle={vehicle} width={width - 0.1} front={length / 2 + 0.02} rear={-length / 2 - 0.02} y={0.84} />
      <Plates plate={vehicle.plate} country={vehicle.country} front={length / 2 + 0.03} rear={-length / 2 - 0.03} y={0.52} />
    </>
  );
}

/** Zet alles in deze groep op één laag (alleen de bestuurder of alleen de slagboomcamera ziet het). */
function OnLayer({ layer, children }: { layer: number; children: ReactNode }) {
  const group = useRef<Group>(null);
  useLayoutEffect(() => {
    group.current?.traverse((object) => object.layers.set(layer));
  });
  return <group ref={group}>{children}</group>;
}

/** De buitenkant: een personenauto (de politie met striping en lichtbalk) of een groot voertuig. */
function Exterior({ vehicle, open }: { vehicle: SimVehicle; open?: boolean }) {
  if (!hasCarBody(vehicle.type)) return <Boxy vehicle={vehicle} />;
  return (
    <>
      <Car vehicle={vehicle} open={open} />
      {vehicle.type === 'politie' && <PoliceKit vehicle={vehicle} />}
    </>
  );
}

export function Vehicle({ vehicle }: { vehicle: SimVehicle }) {
  const group = useRef<Group>(null);
  const inside = useGame((s) => s.view === 'binnen' && s.playerVehicle === vehicle);
  useFrame(({ clock }) => {
    if (!group.current) return;
    if (vehicle.player) {
      // De gebruiker stuurt zelf: plek en richting komen uit de rijsimulatie.
      const pose = playerPose(vehicle);
      group.current.position.set(pose.x, 0, pose.z);
      group.current.rotation.y = Math.PI + pose.heading;
      group.current.rotation.z = (vehicle.steer ?? 0) * (vehicle.speed ?? 0) * 0.003;
      return;
    }
    // Op de parkeerplaats rijdt een voertuig vrij over het terrein en staat het daarna in een vak.
    if (vehicle.pose) {
      group.current.position.set(vehicle.pose.x, 0, vehicle.pose.z);
      group.current.rotation.y = vehicle.pose.heading;
      group.current.rotation.z = vehicle.parked ? 0 : Math.sin(clock.elapsedTime * 10 + vehicle.id) * 0.004;
      return;
    }
    // Is de parkeerplaats vol, dan draait een voertuig van de weg af.
    group.current.position.x = LANE_X[vehicle.lane] + (vehicle.offset ?? 0);
    group.current.position.z = vehicle.z;
    group.current.rotation.y = (vehicle.lane === 'in' ? Math.PI : 0) + (vehicle.heading ?? 0);
    group.current.rotation.z = Math.sin(clock.elapsedTime * 10 + vehicle.id) * 0.004;
  });
  return (
    // De modellen wijzen naar +z; inrijdende voertuigen rijden richting -z.
    <group ref={group} position={[LANE_X[vehicle.lane] + (vehicle.offset ?? 0), 0, vehicle.z]} rotation={[0, vehicle.lane === 'in' ? Math.PI : 0, 0]}>
      {inside ? (
        // Binnen zie jij het dashboard; de camera bij de slagboom ziet de buitenkant van je auto.
        <>
          <OnLayer layer={LAYER.onlyDriver}><Cockpit vehicle={vehicle} /></OnLayer>
          <OnLayer layer={LAYER.onlyGateCamera}><Exterior vehicle={vehicle} /></OnLayer>
        </>
      ) : hasCarBody(vehicle.type) && vehicle.player ? (
        // Je eigen auto heeft heldere ruiten: van buiten zie je het interieur.
        <>
          <Exterior vehicle={vehicle} open />
          <Interior vehicle={vehicle} full />
        </>
      ) : <Exterior vehicle={vehicle} />}
    </group>
  );
}
