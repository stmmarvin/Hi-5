const RAISE_MS = 1400;
const OPEN_MS = 5000;
const LOWER_MS = 1400;

export function createGateController(elements, scene, onBusyChange = () => {}) {
  let openTimer;
  let closedTimer;
  let busyUntil = 0;

  function setOpen(isOpen) {
    scene.setGateOpen(isOpen);
    elements.gateOpenText.textContent = isOpen ? 'SLAGBOOM OPEN' : 'SLAGBOOM GESLOTEN';
    elements.gateOpenLabel.classList.toggle('gate-open', isOpen);
  }

  function isBusy() {
    return Date.now() < busyUntil;
  }

  function reset() {
    if (isBusy()) return false;
    window.clearTimeout(openTimer);
    window.clearTimeout(closedTimer);
    setOpen(false);
    elements.accessIcon.className = 'gate-access-icon';
    elements.accessIcon.textContent = '⊘';
    elements.statusIndicator.className = 'gate-status-indicator';
    elements.accessStatus.textContent = 'KLAAR VOOR SCAN';
    elements.category.textContent = 'Nog geen voertuig gecontroleerd';
    elements.sceneStatus.textContent = 'WACHT OP SCAN';
    elements.decisionBanner.className = 'decision-banner decision-idle';
    elements.decisionText.textContent = 'WACHT OP VOERTUIG';
    return true;
  }

  function applyDecision(decision) {
    if (isBusy()) return false;
    window.clearTimeout(openTimer);
    window.clearTimeout(closedTimer);
    setOpen(false);
    elements.accessIcon.className = 'gate-access-icon';
    elements.statusIndicator.className = 'gate-status-indicator';
    elements.category.textContent = decision.reason
      ? `${decision.category} · ${decision.reason}`
      : decision.category;

    if (decision.outcome === 'authorized') {
      busyUntil = Date.now() + RAISE_MS + OPEN_MS + LOWER_MS;
      onBusyChange(true);
      elements.accessStatus.textContent = 'TOEGANG VERLEEND';
      elements.accessIcon.classList.add('is-authorized');
      elements.accessIcon.textContent = '✓';
      elements.statusIndicator.classList.add('is-authorized');
      elements.sceneStatus.textContent = decision.service?.toUpperCase() || decision.category.toUpperCase();
      elements.decisionBanner.className = 'decision-banner decision-authorized';
      elements.decisionText.textContent = 'NEDERLANDS HULPDIENSTVOERTUIG HERKEND';
      setOpen(true);
      openTimer = window.setTimeout(() => {
        setOpen(false);
        elements.accessStatus.textContent = 'SLAGBOOM SLUIT';
        elements.sceneStatus.textContent = 'SLAGBOOM SLUIT';
        closedTimer = window.setTimeout(() => {
          elements.accessStatus.textContent = 'KLAAR VOOR SCAN';
          elements.sceneStatus.textContent = 'WACHT OP SCAN';
          busyUntil = 0;
          onBusyChange(false);
        }, LOWER_MS);
      }, RAISE_MS + OPEN_MS);
    } else if (decision.outcome === 'denied') {
      busyUntil = 0;
      elements.accessIcon.classList.add('is-denied');
      elements.accessIcon.textContent = '×';
      elements.statusIndicator.classList.add('is-denied');
      elements.accessStatus.textContent = 'TOEGANG GEWEIGERD';
      elements.sceneStatus.textContent = 'TOEGANG GEWEIGERD';
      elements.decisionBanner.className = 'decision-banner decision-denied';
      elements.decisionText.textContent = 'TOEGANG GEWEIGERD';
    } else {
      busyUntil = 0;
      elements.accessIcon.classList.add('is-uncertain');
      elements.accessIcon.textContent = '?';
      elements.statusIndicator.classList.add('is-uncertain');
      elements.accessStatus.textContent = 'VOERTUIG NIET GEVERIFIEERD';
      elements.sceneStatus.textContent = 'NIET GEVERIFIEERD';
      elements.decisionBanner.className = 'decision-banner decision-uncertain';
      elements.decisionText.textContent = 'VOERTUIG NIET GEVERIFIEERD';
    }
    return true;
  }

  return { reset, applyDecision, isBusy };
}
