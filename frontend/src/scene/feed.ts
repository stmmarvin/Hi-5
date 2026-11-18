// Het beeld van de AI-camera bij de ingang. De 3D-scène tekent hierin zodra het scherm een canvas aanmeldt,
// en zet erbij waar het kenteken van de naderende auto in dat beeld staat.
export const FEED_WIDTH = 384;
export const FEED_HEIGHT = 216;

export interface FeedPlate {
  /** Waar de kentekenplaat in het camerabeeld staat, in pixels van het beeld. */
  x: number;
  y: number;
  w: number;
  h: number;
  plate: string;
  country: string;
  /** Afstand van de plaat tot de camera, in meters. */
  distance: number;
  player: boolean;
}

export const feed: { canvas: HTMLCanvasElement | null; plate: FeedPlate | null } = { canvas: null, plate: null };

/**
 * Lagen in de 3D-wereld. Zit je binnen in de auto, dan zie jij het dashboard (laag 2) en ziet de camera bij de
 * slagboom de buitenkant van je auto (laag 1). Al het andere staat op laag 0 en is voor beide zichtbaar.
 */
export const LAYER = { onlyGateCamera: 1, onlyDriver: 2 } as const;
