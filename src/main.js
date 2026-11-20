import { classifyImage, decideDutchAccess, explainOcrProgress, MODEL_ID, readDutchMarkings } from './vehicle-classifier.js';
import { getCameraErrorMessage, getCameraUnavailableMessage } from './camera-errors.js';
import { createCampingScene } from './camping-scene.js';
import { createGateController } from './gate-controller.js';
import './style.css';

const $ = (id) => document.getElementById(id);
const video = $('camera-video');
const preview = $('image-preview');
const sceneVideo = $('scene-feed-video');
const sceneImage = $('scene-feed-image');
const sceneFeedEmpty = $('scene-feed-empty');
const cameraMessage = $('camera-message');
const modelIndicator = $('model-indicator');
const progress = $('model-progress');
const history = [];
const testImages = new Map();
let cameraStream;
let pendingCameraStream;
let selectedBlob;
let selectedName = '';
let previewUrl;
let scanning = false;
let gateBusy = false;

const campingScene = createCampingScene($('three-canvas'), (message) => {
  $('scene-error').textContent = message;
  $('scene-error').hidden = false;
});

const gate = createGateController({
  sceneStatus: $('scene-recognition-status'),
  gateOpenText: $('gate-open-text'),
  gateOpenLabel: $('gate-open-text').parentElement,
  accessStatus: $('gate-access-status'),
  category: $('gate-category'),
  accessIcon: $('gate-access-icon'),
  statusIndicator: $('gate-status-indicator'),
  decisionBanner: $('decision-banner'),
  decisionText: $('decision-text'),
}, campingScene, (busy) => {
  gateBusy = busy;
  updateScanAvailability();
});

function setCameraMessage(message, isError = false) {
  cameraMessage.textContent = message;
  cameraMessage.classList.toggle('message-error', isError);
}

function updateScanAvailability() {
  $('scan-image').disabled = !selectedBlob || scanning || gateBusy;
  document.querySelectorAll('.test-case button').forEach((button) => {
    button.disabled = !testImages.has(button.closest('.test-case').dataset.testCase) || scanning;
  });
}

function updateVerificationSteps(checks = {}) {
  $('vehicle-check-status').textContent = checks.vehicle || 'WACHT';
  $('dutch-check-status').textContent = checks.dutch || 'WACHT';
  $('ocr-check-status').textContent = checks.marking || 'WACHT';
}

function clearPreviewUrl() {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = undefined;
  }
}

function setSceneImage(blobUrl) {
  sceneVideo.pause();
  sceneVideo.srcObject = null;
  sceneVideo.hidden = true;
  sceneImage.hidden = !blobUrl;
  sceneImage.src = blobUrl || '';
  sceneFeedEmpty.hidden = Boolean(blobUrl);
}

function showImage(blob, name, label) {
  clearPreviewUrl();
  selectedBlob = blob;
  selectedName = name;
  previewUrl = URL.createObjectURL(blob);
  preview.src = previewUrl;
  $('preview-label').textContent = label;
  $('image-preview-wrap').hidden = false;
  $('camera-placeholder').hidden = true;
  $('camera-view').classList.add('has-preview');
  $('camera-view').classList.remove('camera-live');
  setSceneImage(previewUrl);
  $('scene-camera-state').textContent = 'BEELD GEKOZEN';
  updateScanAvailability();
  setCameraMessage(`${name} staat klaar voor controle.`);
}

function resetProgress() {
  progress.hidden = true;
  $('progress-fill').style.width = '0%';
  $('progress-value').textContent = '0%';
}

function updateModelProgress(item) {
  progress.hidden = false;
  if (item.status === 'progress' && Number.isFinite(item.progress)) {
    const percent = Math.max(0, Math.min(100, Math.round(item.progress)));
    $('progress-message').textContent = item.file ? `Modelbestand laden: ${item.file}` : 'AI-model downloaden…';
    $('progress-value').textContent = `${percent}%`;
    $('progress-fill').style.width = `${percent}%`;
  } else if (item.status === 'done') {
    $('progress-message').textContent = 'AI-modelbestand gereed';
  } else if (item.status === 'initiate') {
    $('progress-message').textContent = `Voorbereiden: ${item.file || 'AI-model'}…`;
  } else if (item.status === 'ready') {
    $('progress-message').textContent = 'AI-model gereed';
    $('progress-value').textContent = '100%';
    $('progress-fill').style.width = '100%';
  }
}

function updateOcrProgress(event) {
  progress.hidden = false;
  $('progress-message').textContent = explainOcrProgress(event);
  if (Number.isFinite(event.progress)) {
    const percent = Math.max(0, Math.min(99, Math.round(event.progress * 100)));
    $('progress-value').textContent = `${percent}%`;
    $('progress-fill').style.width = `${percent}%`;
  }
}

function renderScores(scores) {
  const scoreList = $('score-list');
  scoreList.replaceChildren();
  scores.slice(0, 7).forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'score-row';
    const label = document.createElement('span');
    label.className = 'score-category';
    label.textContent = item.category;
    const track = document.createElement('span');
    track.className = 'score-track';
    const fill = document.createElement('span');
    fill.className = `score-fill${item.kind === 'dutch' ? ' score-emergency' : ''}`;
    fill.style.width = `${Math.max(1, item.score * 100)}%`;
    track.append(fill);
    const value = document.createElement('strong');
    value.className = 'score-value';
    value.textContent = `${(item.score * 100).toFixed(1)}%`;
    if (index === 0) row.classList.add('top-score');
    row.append(label, track, value);
    scoreList.append(row);
  });
}

function addHistory(decision, scores) {
  history.unshift({
    time: new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' }).format(new Date()),
    category: decision.category,
    outcome: decision.outcome,
    score: scores[0]?.score ?? 0,
  });
  history.splice(8);
  $('history-count').textContent = `${history.length} / 8`;
  const list = $('history-list');
  list.replaceChildren();
  history.forEach((scan) => {
    const item = document.createElement('li');
    item.className = 'history-item';
    const icon = document.createElement('span');
    icon.className = `history-status history-${scan.outcome}`;
    icon.textContent = scan.outcome === 'authorized' ? '✓' : scan.outcome === 'denied' ? '×' : '?';
    const info = document.createElement('span');
    info.className = 'history-info';
    const category = document.createElement('strong');
    category.textContent = scan.category;
    const meta = document.createElement('small');
    meta.textContent = `${scan.time} · ${(scan.score * 100).toFixed(1)}% hoogste overeenkomst`;
    info.append(category, meta);
    const status = document.createElement('span');
    status.className = `history-outcome outcome-${scan.outcome}`;
    status.textContent = scan.outcome === 'authorized' ? 'VERLEEND' : scan.outcome === 'denied' ? 'GEWEIGERD' : 'ONZEKER';
    item.append(icon, info, status);
    list.append(item);
  });
}

async function analyzeImage(blob) {
  const scores = await classifyImage(blob, updateModelProgress);
  let ocr;
  let ocrError;
  try {
    ocr = await readDutchMarkings(blob, updateOcrProgress);
  } catch (error) {
    ocrError = error.message || 'Onbekende OCR-fout.';
    console.error('Nederlandse OCR-controle is mislukt:', error);
  }
  const decision = decideDutchAccess(
    scores,
    ocr,
    Number($('confidence-threshold').value) / 100,
    Number($('score-margin').value) / 100,
    ocrError,
  );
  return { scores, decision, ocr, ocrError };
}

async function startCamera() {
  if (!window.isSecureContext) {
    setCameraMessage(getCameraUnavailableMessage(false), true);
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    setCameraMessage(getCameraUnavailableMessage(true), true);
    return;
  }
  try {
    $('start-camera').disabled = true;
    setCameraMessage('Wacht op toestemming voor cameragebruik…');
    pendingCameraStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    video.srcObject = pendingCameraStream;
    await video.play();
    cameraStream = pendingCameraStream;
    pendingCameraStream = undefined;
    selectedBlob = undefined;
    selectedName = '';
    clearPreviewUrl();
    $('camera-placeholder').hidden = true;
    $('image-preview-wrap').hidden = true;
    $('camera-view').classList.add('camera-live');
    $('camera-view').classList.remove('has-preview');
    sceneImage.hidden = true;
    sceneVideo.srcObject = cameraStream;
    sceneVideo.hidden = false;
    sceneVideo.play().catch((error) => console.warn('AI-camera voorbeeld kon niet starten:', error));
    sceneFeedEmpty.hidden = true;
    $('scene-camera-state').textContent = 'CAMERA LIVE';
    $('capture-image').disabled = false;
    $('stop-camera').disabled = false;
    $('camera-badge').classList.add('visible');
    updateScanAvailability();
    setCameraMessage('Camera is actief. Houd een voertuigfoto stil en maak een foto.');
  } catch (error) {
    pendingCameraStream?.getTracks().forEach((track) => track.stop());
    pendingCameraStream = undefined;
    cameraStream?.getTracks().forEach((track) => track.stop());
    cameraStream = undefined;
    video.pause();
    video.srcObject = null;
    $('start-camera').disabled = false;
    $('capture-image').disabled = true;
    $('stop-camera').disabled = true;
    setCameraMessage(getCameraErrorMessage(error, window.isSecureContext), true);
  }
}

function stopCamera() {
  cameraStream?.getTracks().forEach((track) => track.stop());
  pendingCameraStream?.getTracks().forEach((track) => track.stop());
  cameraStream = undefined;
  pendingCameraStream = undefined;
  video.srcObject = null;
  sceneVideo.pause();
  sceneVideo.srcObject = null;
  sceneVideo.hidden = true;
  $('camera-view').classList.remove('camera-live');
  $('camera-badge').classList.remove('visible');
  $('capture-image').disabled = true;
  $('stop-camera').disabled = true;
  $('start-camera').disabled = false;
  if (!selectedBlob) {
    $('camera-placeholder').hidden = false;
    sceneFeedEmpty.hidden = false;
    $('scene-camera-state').textContent = 'STAND-BY';
  }
  setCameraMessage(selectedBlob ? `${selectedName} staat klaar voor controle.` : 'Camera gestopt.');
}

async function captureImage() {
  if (!video.videoWidth || !video.videoHeight) {
    setCameraMessage('Camera is nog niet klaar. Wacht tot het livebeeld verschijnt.', true);
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d');
  if (!context) {
    setCameraMessage('De browser kan geen foto maken. Probeer opnieuw of upload een afbeelding.', true);
    return;
  }
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) {
    setCameraMessage('De browser kon geen foto maken. Probeer het opnieuw.', true);
    return;
  }
  showImage(blob, `Camerafoto · ${new Date().toLocaleTimeString('nl-NL')}`, 'CAMERAFOTO');
}

async function uploadImage(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (scanning) {
    setCameraMessage('Wacht tot de huidige scan is afgerond.', true);
    return;
  }
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const allowedExtension = /\.(jpe?g|png|webp)$/i.test(file.name);
  if (!(allowedTypes.includes(file.type) || (!file.type && allowedExtension))) {
    setCameraMessage('Bestandstype niet ondersteund. Kies JPG, PNG of WebP.', true);
    return;
  }
  if (file.size > 15 * 1024 * 1024) {
    setCameraMessage('Afbeelding groter dan 15 MB. Kies een kleiner bestand.', true);
    return;
  }
  try {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
    } finally {
      URL.revokeObjectURL(url);
    }
    showImage(file, file.name, 'UPLOADVOORBEELD');
  } catch {
    setCameraMessage('Afbeelding kon niet worden geopend. Kies een andere afbeelding.', true);
  }
}

function renderAnalysis({ scores, decision, ocrError }) {
  renderScores(scores);
  $('detected-category').textContent = decision.category;
  $('detection-summary').textContent = decision.reason;
  $('result-symbol').textContent = decision.outcome === 'authorized' ? '✓' : decision.outcome === 'denied' ? '×' : '?';
  $('scene-recognition-status').textContent = decision.outcome === 'authorized'
    ? 'NEDERLANDS HULPDIENSTVOERTUIG HERKEND'
    : decision.outcome === 'denied'
      ? `TOEGANG GEWEIGERD · ${decision.category}`
      : 'VOERTUIG NIET GEVERIFIEERD';
  updateVerificationSteps(decision.checks);
  if (ocrError) setCameraMessage(`Nederlandse tekstcontrole niet beschikbaar: ${ocrError}. Toegang blijft gesloten.`, true);
}

async function scanImage() {
  if (!selectedBlob || scanning || gate.isBusy()) return;
  if (!gate.reset()) return;
  scanning = true;
  updateScanAvailability();
  $('scan-button-label').textContent = 'Controleren…';
  $('scan-image').classList.add('is-scanning');
  $('capture-image').disabled = true;
  $('start-camera').disabled = true;
  $('scene-camera-state').textContent = 'ANALYSE BEZIG';
  $('scene-feed-scan').classList.add('is-visible');
  modelIndicator.textContent = 'AI-MODEL LADEN';
  $('detected-category').textContent = 'Afbeelding analyseren…';
  $('detection-summary').textContent = 'Voertuig, landkenmerken en dienstmarkering worden gecontroleerd.';
  $('result-symbol').textContent = '…';
  updateVerificationSteps({ vehicle: 'BEZIG', dutch: 'BEZIG', marking: 'BEZIG' });
  $('decision-banner').className = 'decision-banner decision-scanning';
  $('decision-text').textContent = 'NEDERLANDSE HULPDIENST CONTROLEREN';
  resetProgress();
  try {
    const result = await analyzeImage(selectedBlob);
    renderAnalysis(result);
    gate.applyDecision(result.decision);
    addHistory(result.decision, result.scores);
    modelIndicator.textContent = 'AI-MODEL GEREED';
    $('scene-camera-state').textContent = 'SCAN GEREED';
    $('progress-message').textContent = 'Voertuig- en tekstherkenning voltooid op dit apparaat.';
    $('progress-value').textContent = '100%';
    $('progress-fill').style.width = '100%';
  } catch (error) {
    modelIndicator.textContent = 'AI-MODEL FOUT';
    $('detected-category').textContent = 'Controle mislukt';
    $('detection-summary').textContent = error.message || 'De afbeelding kon niet worden geanalyseerd.';
    $('result-symbol').textContent = '!';
    $('decision-banner').className = 'decision-banner decision-uncertain';
    $('decision-text').textContent = 'VOERTUIG NIET GEVERIFIEERD';
    $('score-list').replaceChildren(Object.assign(document.createElement('p'), {
      className: 'empty-scores',
      textContent: 'Geen modelscore beschikbaar; de slagboom blijft gesloten.',
    }));
    updateVerificationSteps({ vehicle: 'FOUT', dutch: 'WACHT', marking: 'WACHT' });
    gate.applyDecision({ outcome: 'uncertain', category: 'Onzeker', reason: error.message });
    $('scene-camera-state').textContent = 'CONTROLE MISLUKT';
    setCameraMessage(`AI-controle mislukt: ${error.message}. De afbeelding is niet naar een herkennings-API verstuurd.`, true);
    $('progress-message').textContent = 'Model of herkenningscontrole kon niet worden geladen.';
    $('progress-value').textContent = 'FOUT';
  } finally {
    scanning = false;
    $('scan-button-label').textContent = 'Voertuig scannen';
    $('scan-image').classList.remove('is-scanning');
    $('scene-feed-scan').classList.remove('is-visible');
    $('capture-image').disabled = !cameraStream;
    $('start-camera').disabled = !!cameraStream;
    updateScanAvailability();
  }
}

async function runTest(testCase) {
  if (scanning) return;
  const image = testImages.get(testCase.dataset.testCase);
  if (!image) return;
  scanning = true;
  updateScanAvailability();
  const output = testCase.querySelector('output');
  output.className = 'test-running';
  output.textContent = 'Model en OCR analyseren…';
  modelIndicator.textContent = 'TESTMODEL LADEN';
  resetProgress();
  try {
    const result = await analyzeImage(image);
    const expected = testCase.dataset.expected;
    const passed = expected === 'rejected'
      ? result.decision.outcome !== 'authorized'
      : result.decision.outcome === expected;
    output.dataset.result = passed ? 'passed' : result.decision.outcome === 'uncertain' ? 'uncertain' : 'failed';
    output.className = passed ? 'test-passed' : result.decision.outcome === 'uncertain' ? 'test-uncertain' : 'test-failed';
    output.title = result.decision.reason;
    output.textContent = `${passed ? 'PASS' : result.decision.outcome === 'uncertain' ? 'ONZEKER' : 'AFWIJKEND'} · ${result.decision.category} (${(result.scores[0]?.score * 100 || 0).toFixed(1)}%) · ${result.decision.reason}`;
    modelIndicator.textContent = 'AI-MODEL GEREED';
  } catch (error) {
    output.dataset.result = 'error';
    output.className = 'test-failed';
    output.textContent = `FOUT · ${error.message}`;
    modelIndicator.textContent = 'AI-MODEL FOUT';
  } finally {
    scanning = false;
    updateScanAvailability();
    const cases = [...document.querySelectorAll('.test-case')];
    const finished = cases.filter((item) => item.querySelector('output').dataset.result);
    const passed = finished.filter((item) => item.querySelector('output').dataset.result === 'passed').length;
    const mismatched = finished.filter((item) => item.querySelector('output').dataset.result === 'failed').length;
    const uncertain = finished.filter((item) => item.querySelector('output').dataset.result === 'uncertain').length;
    const errors = finished.filter((item) => item.querySelector('output').dataset.result === 'error').length;
    $('test-report').textContent = `Uitgevoerd: ${passed} volgens verwachting · ${mismatched} afwijkend · ${uncertain} onzeker · ${errors} fout · ${cases.length - finished.length} nog niet getest.`;
  }
}

$('start-camera').addEventListener('click', startCamera);
$('capture-image').addEventListener('click', captureImage);
$('stop-camera').addEventListener('click', stopCamera);
$('scan-image').addEventListener('click', scanImage);
$('image-upload').addEventListener('change', uploadImage);
$('confidence-threshold').addEventListener('input', (event) => {
  $('threshold-value').textContent = `${event.target.value}%`;
});
$('score-margin').addEventListener('input', (event) => {
  $('margin-value').textContent = `${event.target.value}%`;
});

document.querySelectorAll('.view-button').forEach((button) => {
  button.addEventListener('click', () => {
    campingScene.setView(button.dataset.view);
    document.querySelectorAll('.view-button').forEach((item) => item.classList.toggle('is-active', item === button));
  });
});

document.querySelectorAll('.test-case').forEach((testCase) => {
  const input = testCase.querySelector('input');
  const button = testCase.querySelector('button');
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    const validType = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
      || (!file.type && /\.(jpe?g|png|webp)$/i.test(file.name));
    if (!validType || file.size > 15 * 1024 * 1024) {
      testCase.querySelector('output').textContent = 'Kies JPG, PNG of WebP (max. 15 MB).';
      testCase.querySelector('output').className = 'test-failed';
      input.value = '';
      return;
    }
    testImages.set(testCase.dataset.testCase, file);
    testCase.querySelector('output').textContent = `${file.name} · klaar om te testen`;
    testCase.querySelector('output').className = '';
    delete testCase.querySelector('output').dataset.result;
    updateScanAvailability();
  });
  button.addEventListener('click', () => runTest(testCase));
});

window.addEventListener('beforeunload', () => {
  stopCamera();
  clearPreviewUrl();
  campingScene.dispose();
});

console.info(`Beeldmodel: ${MODEL_ID}`);
