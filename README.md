# Slagboom De Groene Weide

An in-place update of the existing Vite camera and CLIP app. It keeps webcam capture and image upload, adds a cautious Dutch-service verification stage, and replaces the CSS gate drawing with an original Three.js campground entrance. The entrance is a virtual simulation only.

## Install and start

Requirements: Node.js 18+, npm, a recent browser with WebGL support, and internet access on first use to fetch model and OCR language files.

```sh
npm install
npm run dev
```

Open the localhost URL. Allow webcam access or upload a JPG, PNG, or WebP, then choose **Voertuig scannen**. Camera access requires a secure browser context: `http://localhost`/`http://127.0.0.1` works on the development computer, while other devices require HTTPS. A LAN address such as `http://192.168.x.x:5173` can display the site but browsers block camera access from it. In Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm`.

Build and preview:

```sh
npm run build
npm run preview
```

## Dutch-only decision policy

`Xenova/clip-vit-base-patch32` is a general-purpose CLIP model, not a model trained or validated to certify Dutch emergency-service identity. Its scores are relative similarities among prompts, not probabilities. This app therefore does **not** treat a Dutch-sounding prompt or emergency color as proof.

The browser compares Dutch, German, Belgian, US, and British emergency vehicle prompts with civilian/security vehicles and non-vehicle scenes. Access is fail-closed and requires:

1. A clear motor-vehicle match over non-vehicle content.
2. A Dutch emergency-service candidate above the configurable score threshold and ahead of foreign and ordinary-vehicle candidates by the configured margin.
3. High-confidence OCR of the appropriate `POLITIE` or `BRANDWEER` marking. An ambulance additionally needs an OCR-read `RAV`, `MKA`, `Regionale Ambulance(voorziening)`, or `Veiligheidsregio` marker as well as `AMBULANCE`.

If a stage is missing, OCR cannot load, or scores are close, the result is **VOERTUIG NIET GEVERIFIEERD** and the virtual barrier remains closed. The strict OCR checks intentionally trade missed valid vehicles for fewer unsupported approvals. They are additional evidence, not proof of authenticity: labels can be spoofed, OCR and CLIP can be wrong, and this prototype is not suitable for a real access-control or safety-critical decision.

The app does not include a Dutch-specific fine-tuned model or a labeled Dutch/foreign training set. Reliable national-service recognition would require a properly licensed, representative dataset of Dutch police, ambulance, and fire vehicles; foreign lookalikes; ordinary vehicles; and no-vehicle images, with vehicle- and service-level labels. A dedicated detector/classifier should be trained and independently calibrated against held-out regions, vehicle types, weather, views, and image quality before any operational use. Changing prompt wording alone cannot provide that guarantee.

Transformers.js uses a quantized CLIP model; Tesseract.js loads the Dutch and English OCR language data when needed. After downloading, both inference stages run in the browser. The uploaded/captured image is not sent to an image-recognition API.

## Interface and test screen

- **Three.js entrance:** original procedural geometry for the road, two striped barriers, control boxes, Dutch entrance boards, CCTV, traffic lights, fences, trees, bushes, flowers, reception, and caravans. Use the Overzicht, Ingang, Zijkant, and Slagboom buttons to change camera angle.
- **Camera and upload:** keeps start/stop, capture, JPG/PNG/WebP upload, preview, progress, and local AI scan.
- **Verification and log:** shows vehicle, Dutch-service, and OCR checks; relative model scores; threshold and margin controls; and the last eight scans.
- **Testset:** choose a labeled image for each Dutch/foreign/ordinary/object/unclear case, then run the same actual model and OCR flow. Results compare actual outcomes to test expectations; file names are not used in inference.

### Real-model smoke tests (2026-11-19)

Ran the actual browser CLIP + OCR flow on six temporary public image examples; none of those files are bundled. These are individual smoke tests, not an accuracy benchmark:

| Example image | Actual top match | Actual outcome |
| --- | --- | --- |
| German police car with visible `POLIZEI` markings | Buitenlandse politie, 99.5% | Denied |
| Ambulance image with country not established | Nederlandse ambulance, 68.0% | Onzeker; required regional Dutch marking was not confirmed |
| Fire-engine image with partly visible American fire-department lettering | Buitenlandse brandweer, 89.5% | Denied |
| Ordinary sports-car image (not independently established as Dutch) | Beveiligingsvoertuig, 41.5% | Denied |
| Tiger image | Dier, 99.3% | Denied; no motor vehicle |
| Blank scene | Fiets, 25.0% | Denied; no motor vehicle |

No labeled Dutch police, Dutch ambulance, Dutch fire-service, Belgian ambulance, or clearly ambiguous emergency-vehicle photographs were supplied. Consequently, Dutch positive recognition and those specific foreign classes remain **untested**, and no acceptance accuracy is claimed. In particular, the generic ambulance example was not accepted. Use verified, labeled local images in the test screen to measure those cases.

`npm test` covers the decision and gate-timing logic; it does not claim model accuracy.

## Changed files

- `index.html` — Dutch dashboard, retained camera controls, model results, test cases, and Three.js canvas.
- `src/main.js` — webcam/upload flow, secure-context checks, camera cleanup, image-local inference, OCR status, scan history, test-set actions, and camera-angle controls.
- `src/camera-errors.js` — Dutch camera permission, device, in-use, and secure-context messages.
- `src/vehicle-classifier.js` — Dutch/foreign/negative prompts, vehicle and jurisdiction score comparisons, Tesseract OCR, and fail-closed decisions.
- `src/camping-scene.js` — new procedural Three.js campsite, boom animation controls, traffic lights, and camera presets.
- `src/gate-controller.js` — Dutch virtual-gate messages, fail-closed states, and a non-interruptible open/hold/close cycle.
- `src/style.css` — screenshot-inspired dashboard and responsive 3D-scene overlays.
- `src/vehicle-classifier.test.js` — focused tests for Dutch-marking requirements, foreign/ordinary/object rejection, ambiguity, and OCR failure.
- `package.json` / `package-lock.json` — add Three.js and Tesseract.js dependencies.
