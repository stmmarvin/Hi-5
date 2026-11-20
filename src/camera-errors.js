const insecureContextMessage = 'Cameratoegang vereist HTTPS. Op deze computer kunt u http://localhost of http://127.0.0.1 gebruiken; op een telefoon is voor cameratoegang een HTTPS-adres nodig.';

export function getCameraUnavailableMessage(isSecureContext) {
  if (!isSecureContext) return insecureContextMessage;
  return 'Camera-API niet beschikbaar. Gebruik een recente versie van Chrome of Edge en controleer de camerainstellingen.';
}

export function getCameraErrorMessage(error, isSecureContext) {
  if (!isSecureContext || error?.name === 'SecurityError') return insecureContextMessage;

  switch (error?.name) {
    case 'NotAllowedError':
      return 'Cameratoestemming geweigerd of geblokkeerd. Sta cameragebruik toe in de browser- en Windows-instellingen.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'Geen camera gevonden. Sluit een camera aan of controleer of deze is ingeschakeld.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Camera is al in gebruik of niet beschikbaar. Sluit andere camera-apps, zoals Teams, en probeer opnieuw.';
    case 'OverconstrainedError':
      return 'Geen geschikte camera beschikbaar. Controleer de aangesloten camera en probeer opnieuw.';
    default:
      return `Camera kon niet starten: ${error?.message || 'onbekende fout'}.`;
  }
}
