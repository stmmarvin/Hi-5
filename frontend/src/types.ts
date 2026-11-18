export type VehicleType = 'auto' | 'camper' | 'bestelbus' | 'vrachtwagen' | 'ambulance' | 'brandweer' | 'politie';
/** Landcode van de blauwe band, bijvoorbeeld NL, D of PL. De lijst staat in sim/plates.ts. */
export type Country = string;
export type Direction = 'in' | 'out';

export interface User {
  id: number;
  username: string;
  display_name: string;
  role: 'beheerder' | 'receptie';
}

export interface Permit {
  id: number;
  plate: string;
  plate_key: string;
  country: Country;
  holder: string;
  category: 'guest' | 'staff' | 'supplier';
  vehicle_type: VehicleType;
  pitch: string | null;
  arrival: string | null;
  departure: string | null;
  window_start: string | null;
  window_end: string | null;
}

export interface PresenceRow {
  id: number;
  plate: string;
  plate_key: string;
  country: Country;
  vehicle_type: string;
  holder: string;
  category: string;
  pitch: string | null;
  entered_at: string;
}

export interface PassageRow {
  id: number;
  occurred_at: string;
  direction: Direction;
  plate: string;
  country: Country;
  vehicle_type: string;
  holder: string;
  category: string;
  outcome: 'granted' | 'denied' | 'pending';
  manual: boolean;
  offline: boolean;
  reason: string;
}

export interface ScanResult {
  passage_id: number | null;
  open: boolean;
  code: string;
  reason: string;
  holder: string;
  category: string;
  pitch?: string | null;
}

export interface SyncItem {
  plate: string;
  country: Country;
  vehicle_type: VehicleType;
  at: string;
  open: boolean;
  manual: boolean;
  reason: string;
}

export interface NewPermit {
  plate: string;
  country?: Country;
  holder: string;
  category: 'guest' | 'staff' | 'supplier';
  vehicle_type: VehicleType;
  pitch?: string;
  arrival?: string;
  departure?: string;
  window_start?: string;
  window_end?: string;
}
