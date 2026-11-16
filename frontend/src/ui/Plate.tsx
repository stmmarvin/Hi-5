import type { Country } from '../types';

export function Plate({ plate, country, large }: { plate: string; country: Country; large?: boolean }) {
  return (
    <span className={`plaat land-${country}${large ? ' groot' : ''}`}>
      <span className="band">{country}</span>
      <span className="nr">{plate}</span>
    </span>
  );
}

export const CATEGORY: Record<string, string> = {
  guest: 'Gast', staff: 'Medewerker', supplier: 'Leverancier', visitor: 'Bezoeker', emergency: 'Hulpdienst',
};
