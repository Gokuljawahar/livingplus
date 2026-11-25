# LivingPlus — Hybrid AI Maintenance & Private Roommate Matching (#BuildHybridAI 2026)

## Elevator Pitch / Tagline
Offline-first PG hostel maintenance triage and privacy-preserving roommate matching powered by Firebase AI Logic (Gemini Nano on-device + Cloud Gemini fallback).

## Inspiration
Living in a paying-guest (PG) hostel in Indian cities like Chennai or Bengaluru comes with a practical irony: the exact places where maintenance emergencies happen — basement parking, concrete interior bedrooms, water-heater corners, and stairwells — are dead zones with one bar of mobile signal. At the same time, students sharing 2- or 3-bed rooms are hesitant to share candid notes about late-night study schedules or sensitivity to noise if raw text sits on a third-party server.

We wanted **on-device AI** to solve the instant, private, signal-free half of PG living, while **cloud AI** handles heavy multi-ticket reasoning across dozens of rooms for the owner.

## What It Does
1. **Snap & Triage (`PREFER_ON_DEVICE`):** In the Resident Portal (`/stay/<pg>/maintenance`), a resident snaps a photo of a leak, broken fan, or sparking socket (or types a short note). LivingPlus downscales the photo in the browser to `<=1024px` JPEG and runs single-turn structured inference through **Firebase AI Logic (`firebase/ai`)** to auto-fill category, priority (`LOW | NORMAL | HIGH | URGENT`), title, description, and an actionable resident safety tip. If `safetyRisk: true` is detected (exposed wires, gas smell, active flooding), LivingPlus displays an immediate safety alert and forces `URGENT` priority. Every prediction transparently shows `"Analysed on your device 🔒"` or `"Analysed in the cloud ☁️"` plus millisecond latency.
2. **Offline Outbox with Cloud Firestore:** If signal drops, submitting a triaged ticket stores the payload and compressed JPEG in Cloud Firestore with `persistentLocalCache()` under `outbox/{firebaseUid}/tickets/{id}`, immediately showing *"Queued, will send when you're back online"*. As soon as connectivity returns, LivingPlus uploads the photo, creates the ticket via the backend API, deletes the outbox doc, and toasts *"N offline report(s) sent"*.
3. **Private On-Device VibeCheck (`ONLY_ON_DEVICE`):** Prospective roommates can describe their daily routine in plain English (*"I study past 1 am, keep my desk neat, headphones after 10 pm"*). Gemini Nano converts those words directly in Chrome into 8 numeric lifestyle habit indices so **the raw text never leaves the resident's device** (`"Your words stay on this device. Only your habits are shared for matching."`). When Chrome Prompt API isn't present, it clearly informs the user and falls back to the cloud endpoint.
4. **Owner Cross-Ticket Digest (`ONLY_IN_CLOUD`):** In the Owner Operations console (`/owner/maintenance`), clicking **"Summarise today's open tickets"** invokes Firebase AI Logic in `ONLY_IN_CLOUD` mode to produce a 3-bullet operational summary and highlight repeated issues across rooms (such as multiple rooms on the same floor losing water pressure).
5. **Firebase Remote Config & App Check + `?debug=ai`:** Remote Config governs `triage_inference_mode`, `triage_prompt_version`, `vibe_on_device_enabled`, and `cloud_model_name`, while App Check protects Cloud Gemini calls (with `VITE_APPCHECK_DEBUG` debug-token support for judges).

## Built With What During Nov 11 – Nov 30, 2026 (Existing-App Disclosure)
LivingPlus is built atop an existing PG marketplace, booking, rent ledger, and operations web app. During the **#BuildHybridAI 2026 submission window (Nov 11 – Nov 30, 2026)**, we specifically engineered and shipped:
- **`Project/frontend/src/ai/` module:** Firebase AI Logic client (`getAI`, `GoogleAIBackend`, `getGenerativeModel`, `InferenceMode`, `InferenceSource`, `Schema`, `initializeDeviceModel`), App Check integration (`firebase/app-check`), Remote Config bootstrap & live override store (`firebase/remote-config`), Chrome Prompt API availability hook (`useOnDeviceAI`), client-side canvas image downscaler, and interactive `?debug=ai` diagnostic panel.
- **Snap & Triage + Firestore Offline Outbox:** Full Resident Portal maintenance upgrade in `ResidentMaintenanceView.tsx`, `outbox.ts` (`persistentLocalCache()` + `firestore.rules` + Anonymous Auth), and backend support for resident ticket `priority` and `imageUrl` in `Project/backend/src/controllers/pg/maintenance.controller.ts`.
- **On-Device VibeCheck Privacy Path:** `ONLY_ON_DEVICE` text-to-habits extractor in `VibeProfileBuilder.tsx`.
- **Owner Open-Ticket Cloud Digest:** `ONLY_IN_CLOUD` summary generator in `OperationsViews.tsx`.
- **Repository Hygiene & Tests:** Root `LICENSE` (Apache-2.0), `Project/frontend/.env.example`, Vitest unit suites (`ai.test.ts`, `outbox.test.ts`, `VibeProfileBuilder.test.tsx`), and documentation.

## Judge Testing Guide
1. **Environment:** Clone the repo, copy `Project/backend/.env.example` and `Project/frontend/.env.example`, start backend + frontend (`npm run seed` populates demo PG data in Chennai).
2. **Debug Inspector:** Append `?debug=ai` to any URL (for example `http://localhost:5173/stay/green-park-pg/maintenance?debug=ai`). The floating **Hybrid AI debug** drawer lets you inspect Gemini Nano status, trigger `initializeDeviceModel()` via click, switch `InferenceMode` between `PREFER_ON_DEVICE` and `ONLY_IN_CLOUD`, and observe real-time `inferenceSource` and latency.
3. **Offline Outbox Check:** Open DevTools → Network → Offline, click **Report an issue**, run **Triage**, click **Queue offline report**, then go back online to observe automatic Firestore outbox sync.

## Built-With Tags
`firebase`, `firebase-ai-logic`, `gemini-nano`, `gemini`, `cloud-firestore`, `firebase-app-check`, `firebase-remote-config`, `firebase-auth`, `react`, `typescript`, `chrome-built-in-ai`
