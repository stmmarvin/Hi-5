import { countryInfo } from '../sim/plates';
import type { Country } from '../types';

export function Plate({ plate, country, large }: { plate: string; country: Country; large?: boolean }) {
  return (
    // Geel in Nederland en Luxemburg, anders wit; Belgische letters zijn rood.
    <span
      className={`plaat land-${country}${large ? ' groot' : ''}`}
      style={{ background: countryInfo(country).yellow ? 'var(--geel)' : '#fff', color: countryInfo(country).ink ?? '#111' }}
      title={countryInfo(country).name}
    >
      <span className="band">{country}</span>
      <span className="nr">{plate}</span>
    </span>
  );
}

export const CATEGORY: Record<string, string> = {
  guest: 'Gast', staff: 'Medewerker', supplier: 'Leverancier', visitor: 'Bezoeker', emergency: 'Hulpdienst',
};
