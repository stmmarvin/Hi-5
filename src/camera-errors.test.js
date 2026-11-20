import test from 'node:test';
import assert from 'node:assert/strict';
import { getCameraErrorMessage, getCameraUnavailableMessage } from './camera-errors.js';

test('explains that camera access needs a secure context', () => {
  assert.match(getCameraUnavailableMessage(false), /HTTPS/);
  assert.match(getCameraUnavailableMessage(true), /Chrome of Edge/);
  assert.match(getCameraErrorMessage({ name: 'SecurityError' }, true), /HTTPS/);
});

test('maps browser camera errors to clear Dutch guidance', () => {
  assert.match(getCameraErrorMessage({ name: 'NotAllowedError' }, true), /toestemming geweigerd/i);
  assert.match(getCameraErrorMessage({ name: 'NotFoundError' }, true), /Geen camera gevonden/);
  assert.match(getCameraErrorMessage({ name: 'NotReadableError' }, true), /al in gebruik/);
});

test('does not authorize access based on a camera error', () => {
  assert.match(getCameraErrorMessage({ name: 'AbortError', message: 'gestopt' }, true), /Camera kon niet starten/);
});
