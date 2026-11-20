import test from 'node:test';
import assert from 'node:assert/strict';
import { decideDutchAccess } from './vehicle-classifier.js';

const settings = { threshold: 0.35, margin: 0.12 };

function scores(dutch, foreign, ordinary, object = 0.02) {
  return [
    { category: 'Nederlandse politie', kind: 'dutch', service: 'politie', vehicle: true, score: dutch },
    { category: 'Buitenlandse politie', kind: 'foreign', service: 'politie', vehicle: true, score: foreign },
    { category: 'Personenauto', kind: 'ordinary', vehicle: true, score: ordinary },
    { category: 'Dier', kind: 'object', vehicle: false, score: object },
  ].sort((a, b) => b.score - a.score);
}

test('grants access only when Dutch vehicle scores, margins, and marking all agree', () => {
  const result = decideDutchAccess(
    scores(0.62, 0.12, 0.1),
    { text: 'POLITIE', words: ['POLITIE'] },
    settings.threshold,
    settings.margin,
  );

  assert.equal(result.outcome, 'authorized');
  assert.equal(result.category, 'Nederlandse politie');
  assert.deepEqual(result.checks, { vehicle: 'JA', dutch: 'JA', marking: 'BEVESTIGD' });
});

test('rejects a foreign emergency vehicle even if OCR sees a generic service word', () => {
  const result = decideDutchAccess(
    scores(0.18, 0.55, 0.08),
    { text: 'POLITIE', words: ['POLITIE'] },
    settings.threshold,
    settings.margin,
  );

  assert.equal(result.outcome, 'denied');
  assert.match(result.reason, /Buitenlands/);
});

test('rejects an ordinary vehicle and an image without a motor vehicle', () => {
  const ordinary = decideDutchAccess(
    scores(0.12, 0.08, 0.6),
    { text: '', words: [] },
    settings.threshold,
    settings.margin,
  );
  const object = decideDutchAccess(
    scores(0.01, 0.02, 0.03, 0.8),
    { text: '', words: [] },
    settings.threshold,
    settings.margin,
  );

  assert.equal(ordinary.outcome, 'denied');
  assert.equal(ordinary.category, 'Personenauto');
  assert.equal(object.outcome, 'denied');
  assert.equal(object.checks.vehicle, 'NEE');
});

test('requires a Dutch regional marker as well as AMBULANCE OCR', () => {
  const ambulanceScores = [
    { category: 'Nederlandse ambulance', kind: 'dutch', service: 'ambulance', vehicle: true, score: 0.58 },
    { category: 'Buitenlandse ambulance', kind: 'foreign', service: 'ambulance', vehicle: true, score: 0.14 },
    { category: 'Bestelwagen of vrachtwagen', kind: 'ordinary', vehicle: true, score: 0.1 },
    { category: 'Gebouw', kind: 'object', vehicle: false, score: 0.02 },
  ];
  const withoutRegion = decideDutchAccess(
    ambulanceScores,
    { text: 'AMBULANCE', words: ['AMBULANCE'] },
    settings.threshold,
    settings.margin,
  );
  const withRegion = decideDutchAccess(
    ambulanceScores,
    { text: 'AMBULANCE RAV', words: ['AMBULANCE', 'RAV'] },
    settings.threshold,
    settings.margin,
  );

  assert.equal(withoutRegion.outcome, 'uncertain');
  assert.match(withoutRegion.reason, /regioaanduiding/);
  assert.equal(withRegion.outcome, 'authorized');
});

test('requires BRANDWEER OCR for a Dutch fire-service match', () => {
  const fireScores = [
    { category: 'Nederlandse brandweer', kind: 'dutch', service: 'brandweer', vehicle: true, score: 0.57 },
    { category: 'Buitenlandse brandweer', kind: 'foreign', service: 'brandweer', vehicle: true, score: 0.14 },
    { category: 'Bestelwagen of vrachtwagen', kind: 'ordinary', vehicle: true, score: 0.11 },
    { category: 'Gebouw', kind: 'object', vehicle: false, score: 0.02 },
  ];
  const withoutMarking = decideDutchAccess(
    fireScores,
    { text: 'BRANDWEERACHTIG', words: ['BRANDWEERACHTIG'] },
    settings.threshold,
    settings.margin,
  );
  const withMarking = decideDutchAccess(
    fireScores,
    { text: 'BRANDWEER', words: ['BRANDWEER'] },
    settings.threshold,
    settings.margin,
  );

  assert.equal(withoutMarking.outcome, 'uncertain');
  assert.equal(withMarking.outcome, 'authorized');
});

test('fails closed on close scores, missing service text, or OCR failure', () => {
  const closeScores = decideDutchAccess(
    scores(0.42, 0.34, 0.08),
    { text: 'POLITIE', words: ['POLITIE'] },
    settings.threshold,
    settings.margin,
  );
  const missingMarking = decideDutchAccess(
    scores(0.62, 0.12, 0.1),
    { text: 'HULPDIENST', words: ['HULPDIENST'] },
    settings.threshold,
    settings.margin,
  );
  const ocrFailure = decideDutchAccess(
    scores(0.62, 0.12, 0.1),
    undefined,
    settings.threshold,
    settings.margin,
    'OCR engine unavailable',
  );

  assert.equal(closeScores.outcome, 'uncertain');
  assert.equal(missingMarking.outcome, 'uncertain');
  assert.equal(ocrFailure.outcome, 'uncertain');
  assert.match(ocrFailure.reason, /OCR-controle mislukt/);
});

test('returns uncertainty when there are insufficient model scores', () => {
  assert.equal(decideDutchAccess([], undefined, 0.35, 0.12).outcome, 'uncertain');
});
