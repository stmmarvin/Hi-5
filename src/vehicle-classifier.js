import { createWorker } from 'tesseract.js';

const MODEL_ID = 'Xenova/clip-vit-base-patch32';

const CANDIDATES = [
  { prompt: 'a Dutch police car with official blue and yellow markings and POLITIE lettering', category: 'Nederlandse politie', kind: 'dutch', service: 'politie', vehicle: true },
  { prompt: 'a Dutch ambulance with Dutch emergency service markings and AMBULANCE lettering', category: 'Nederlandse ambulance', kind: 'dutch', service: 'ambulance', vehicle: true },
  { prompt: 'a Dutch fire engine with red and white markings and BRANDWEER lettering', category: 'Nederlandse brandweer', kind: 'dutch', service: 'brandweer', vehicle: true },
  { prompt: 'a German Polizei patrol car with German police markings', category: 'Buitenlandse politie', kind: 'foreign', service: 'politie', vehicle: true },
  { prompt: 'a Belgian police car with Belgian police markings', category: 'Buitenlandse politie', kind: 'foreign', service: 'politie', vehicle: true },
  { prompt: 'an American police car with US police markings', category: 'Buitenlandse politie', kind: 'foreign', service: 'politie', vehicle: true },
  { prompt: 'a British police car with UK police markings', category: 'Buitenlandse politie', kind: 'foreign', service: 'politie', vehicle: true },
  { prompt: 'a German ambulance with German emergency markings', category: 'Buitenlandse ambulance', kind: 'foreign', service: 'ambulance', vehicle: true },
  { prompt: 'a Belgian ambulance with Belgian emergency markings', category: 'Buitenlandse ambulance', kind: 'foreign', service: 'ambulance', vehicle: true },
  { prompt: 'an American ambulance with US emergency markings', category: 'Buitenlandse ambulance', kind: 'foreign', service: 'ambulance', vehicle: true },
  { prompt: 'a British ambulance with UK emergency markings', category: 'Buitenlandse ambulance', kind: 'foreign', service: 'ambulance', vehicle: true },
  { prompt: 'a German Feuerwehr fire engine', category: 'Buitenlandse brandweer', kind: 'foreign', service: 'brandweer', vehicle: true },
  { prompt: 'an American fire truck with US fire service markings', category: 'Buitenlandse brandweer', kind: 'foreign', service: 'brandweer', vehicle: true },
  { prompt: 'a Belgian fire engine with Belgian fire service markings', category: 'Buitenlandse brandweer', kind: 'foreign', service: 'brandweer', vehicle: true },
  { prompt: 'a regular Dutch passenger car with no emergency markings', category: 'Personenauto', kind: 'ordinary', vehicle: true },
  { prompt: 'a regular passenger car with no emergency markings', category: 'Personenauto', kind: 'ordinary', vehicle: true },
  { prompt: 'a security company patrol vehicle, not a police car', category: 'Beveiligingsvoertuig', kind: 'ordinary', vehicle: true },
  { prompt: 'a delivery van or commercial truck', category: 'Bestelwagen of vrachtwagen', kind: 'ordinary', vehicle: true },
  { prompt: 'a bus or coach', category: 'Bus', kind: 'ordinary', vehicle: true },
  { prompt: 'a taxi', category: 'Taxi', kind: 'ordinary', vehicle: true },
  { prompt: 'a motorcycle', category: 'Motorfiets', kind: 'ordinary', vehicle: true },
  { prompt: 'a bicycle', category: 'Fiets', kind: 'ordinary', vehicle: false },
  { prompt: 'an animal', category: 'Dier', kind: 'object', vehicle: false },
  { prompt: 'a piece of household furniture', category: 'Huishoudelijk voorwerp', kind: 'object', vehicle: false },
  { prompt: 'a building', category: 'Gebouw', kind: 'object', vehicle: false },
  { prompt: 'an empty scene with no vehicle', category: 'Geen voertuig zichtbaar', kind: 'object', vehicle: false },
];

const MARKINGS = {
  politie: /\bPOLITIE\b/,
  brandweer: /\bBRANDWEER\b/,
  ambulance: /\bAMBULANCE\b/,
};

const AMBULANCE_REGION_MARKINGS = /\b(?:RAV|MKA|REGIONALE\s+AMBULANCE(?:VOORZIENING)?|VEILIGHEIDSREGIO)\b/;

let classifierPromise;
let ocrWorkerPromise;

export function loadClassifier(onProgress = () => {}) {
  if (!classifierPromise) {
    classifierPromise = import('@huggingface/transformers')
      .then(({ pipeline }) => pipeline('zero-shot-image-classification', MODEL_ID, {
        dtype: 'q4',
        progress_callback: onProgress,
      }))
      .catch((error) => {
        classifierPromise = undefined;
        throw error;
      });
  }
  return classifierPromise;
}

function loadOcrWorker(onProgress = () => {}) {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = createWorker('nld+eng', 1, {
      logger: (event) => onProgress(event),
    }).catch((error) => {
      ocrWorkerPromise = undefined;
      throw error;
    });
  }
  return ocrWorkerPromise;
}

export async function classifyImage(image, onProgress = () => {}) {
  const classifier = await loadClassifier(onProgress);
  const output = await classifier(image, CANDIDATES.map(({ prompt }) => prompt));
  const scores = output.map(({ label, score }) => {
    const candidate = CANDIDATES.find(({ prompt }) => prompt === label);
    if (!candidate) throw new Error(`Onbekende modelcategorie: ${label}`);
    return { ...candidate, score };
  }).sort((a, b) => b.score - a.score);

  if (scores.length !== CANDIDATES.length) {
    throw new Error('Het model leverde niet alle categoriescores aan.');
  }
  return scores;
}

export async function readDutchMarkings(image, onProgress = () => {}) {
  const worker = await loadOcrWorker(onProgress);
  const result = await worker.recognize(image, {}, { blocks: true });
  const recognizedWords = (result.data.blocks || [])
    .flatMap((block) => block.paragraphs)
    .flatMap((paragraph) => paragraph.lines)
    .flatMap((line) => line.words);
  const words = recognizedWords
    .filter(({ confidence }) => confidence >= 40)
    .map(({ text }) => text.toLocaleUpperCase('nl-NL').replace(/[^A-Z0-9]/g, ''));
  return {
    text: words.join(' '),
    words,
  };
}

function maxScore(scores, predicate) {
  return scores.filter(predicate).reduce((max, score) => Math.max(max, score.score), 0);
}

export function decideDutchAccess(scores, ocr, threshold, minimumMargin, ocrError = null) {
  const result = (outcome, category, reason, checks) => ({ outcome, category, reason, checks });
  const best = scores[0];
  if (!best || scores.length < 2) {
    return result('uncertain', 'Onzeker', 'Het model leverde onvoldoende bewijs.', { vehicle: 'ONZEKER', dutch: 'WACHT', marking: 'WACHT' });
  }

  const vehicleScore = maxScore(scores, (score) => score.vehicle);
  const nonVehicleScore = maxScore(scores, (score) => !score.vehicle);
  if (vehicleScore < 0.18 || nonVehicleScore - vehicleScore > 0.08) {
    const category = best.vehicle ? best.category : scores.find((score) => !score.vehicle)?.category || 'Geen voertuig';
    return result('denied', category, 'Geen herkenbaar motorvoertuig vastgesteld.', { vehicle: 'NEE', dutch: 'N.V.T.', marking: 'N.V.T.' });
  }
  if (vehicleScore - nonVehicleScore < 0.06) {
    return result('uncertain', 'Onzeker', 'Het is niet duidelijk of de afbeelding een voertuig bevat.', { vehicle: 'ONZEKER', dutch: 'WACHT', marking: 'WACHT' });
  }

  const dutch = scores.filter((score) => score.kind === 'dutch').sort((a, b) => b.score - a.score)[0];
  const foreign = scores.filter((score) => score.kind === 'foreign').sort((a, b) => b.score - a.score)[0];
  const ordinaryScore = maxScore(scores, (score) => score.kind === 'ordinary');
  if (!dutch || !foreign) {
    return result('uncertain', 'Onzeker', 'De vergelijking met buitenlandse voertuigen is niet beschikbaar.', { vehicle: 'JA', dutch: 'ONZEKER', marking: 'WACHT' });
  }

  if (foreign.score >= threshold && foreign.score > dutch.score) {
    return result('denied', foreign.category, 'Buitenlands hulpdienstvoertuig; alleen Nederlandse diensten zijn toegestaan.', { vehicle: 'JA', dutch: 'NEE', marking: 'N.V.T.' });
  }
  if (ordinaryScore >= threshold && ordinaryScore > dutch.score) {
    const ordinary = scores.filter((score) => score.kind === 'ordinary').sort((a, b) => b.score - a.score)[0];
    return result('denied', ordinary.category, 'Geen toegestaan Nederlands hulpdienstvoertuig.', { vehicle: 'JA', dutch: 'NEE', marking: 'N.V.T.' });
  }
  if (dutch.score < threshold) {
    return result('uncertain', dutch.category, 'Onvoldoende Nederlandse hulpdienstkenmerken.', { vehicle: 'JA', dutch: 'ONZEKER', marking: 'WACHT' });
  }
  if (dutch.score - foreign.score < minimumMargin) {
    return result('uncertain', dutch.category, 'Nederlandse en buitenlandse modellen komen te dicht bij elkaar.', { vehicle: 'JA', dutch: 'ONZEKER', marking: 'WACHT' });
  }
  if (dutch.score - ordinaryScore < minimumMargin) {
    return result('uncertain', dutch.category, 'Hulpdienst en gewoon voertuig zijn onvoldoende te onderscheiden.', { vehicle: 'JA', dutch: 'ONZEKER', marking: 'WACHT' });
  }
  if (ocrError) {
    return result('uncertain', dutch.category, `OCR-controle mislukt: ${ocrError}`, { vehicle: 'JA', dutch: 'JA', marking: 'FOUT' });
  }

  const marking = MARKINGS[dutch.service];
  const text = ocr?.text || '';
  const wordEvidence = ocr?.words?.some((word) => marking.test(word)) || marking.test(text);
  const regionalAmbulanceEvidence = dutch.service === 'ambulance' && AMBULANCE_REGION_MARKINGS.test(text);
  if (!wordEvidence || (dutch.service === 'ambulance' && !regionalAmbulanceEvidence)) {
    return result(
      'uncertain',
      dutch.category,
      dutch.service === 'ambulance'
        ? 'Geen leesbare Nederlandse ambulance- én regioaanduiding gevonden.'
        : 'De vereiste leesbare Nederlandse dienstmarkering ontbreekt.',
      { vehicle: 'JA', dutch: 'JA', marking: 'ONTBREEKT' },
    );
  }

  return {
    ...result('authorized', dutch.category, 'Nederlandse modelkenmerken, scoremarges en dienstmarkering komen overeen.', { vehicle: 'JA', dutch: 'JA', marking: 'BEVESTIGD' }),
    service: dutch.service,
  };
}

export function explainOcrProgress(event) {
  const labels = {
    loading: 'OCR-module laden…',
    loadLanguage: 'Nederlands taalmodel downloaden…',
    initialize: 'OCR voorbereiden…',
    recognize: 'Nederlandse dienstmarkeringen lezen…',
  };
  return labels[event.status] || 'Tekst op het voertuig controleren…';
}

export { MODEL_ID };
