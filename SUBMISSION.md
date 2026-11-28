# LivingPlus — Prototype Overview & Technical Architecture

## Elevator Pitch
Vernacular, offline-first AI infrastructure for India's urban PG & co-living housing: on-device Gemini Nano safety triage and private roommate matching for residents, paired with a Google ADK copilot, Gemini Live Indic voice, and Cloud Gemini cross-ticket intelligence for owners.

## Live Prototype
- **Production URL (Google Cloud Run):** https://livingplus-pfpdmrspea-el.a.run.app
- **Hybrid AI Debug Inspector:** Append `?debug=ai` to any route (for example `https://livingplus-pfpdmrspea-el.a.run.app/?debug=ai`) to inspect Chrome Gemini Nano status, trigger `initializeDeviceModel()`, switch `InferenceMode` (`PREFER_ON_DEVICE` vs `ONLY_IN_CLOUD`), and view millisecond latency telemetry.

## Core Capabilities
1. **Offline-First Snap & Triage (`InferenceMode.PREFER_ON_DEVICE`):** In the Resident Portal (`/stay/<pg>/maintenance`), residents snap a photo of a leak, broken fan, or sparking switch (or record a vernacular voice note). LivingPlus downscales photos to `<=1024px` JPEG in-browser and runs structured Firebase AI Logic (`firebase/ai`) inference on-device via Chrome's Gemini Nano Prompt API. Electrical/safety hazards automatically lock priority to `URGENT` with immediate resident safety advice.
2. **Cloud Firestore Offline Outbox:** When cellular signal drops in concrete interior rooms, triaged tickets and compressed photos are saved locally using Cloud Firestore `persistentLocalCache()` (`outbox/{firebaseUid}/tickets/{id}`, secured by `firestore.rules`) and auto-sync the moment connectivity returns.
3. **Private On-Device VibeCheck (`InferenceMode.ONLY_ON_DEVICE`) & Gemini Live Indic Voice:** Prospective roommates can either speak naturally with a Tamil/Hindi/Tanglish/English Gemini Live voice buddy (`16 kHz / 24 kHz AudioWorklet` with RMS barge-in) or describe their daily routine in private on-device mode where raw lifestyle text never leaves Chrome — only 8 numeric habit indices are shared for explainable bed matching.
4. **Agentic Owner Operations (`@google/adk` + `InferenceMode.ONLY_IN_CLOUD`):** Independent PG owners manage bookings, rent ledgers, expenses, utilities, Deposit Shield move-in/out Vision diffs, last-4-digit AI KYC checks, Kitchen Head-Count forecasts, and a Cloud Gemini cross-ticket maintenance digest inside a 15-view modular console backed by PostgreSQL Row-Level Security (`livingplus_app`) and spoken read-back confirmation gates.
5. **Dynamic PostgreSQL Platform Catalog (`/admin/catalog`):** All domain options (amenities, maintenance categories, priorities, VibeCheck questions, landmarks, and persona prompts) are stored dynamically in PostgreSQL (`PlatformCatalog`) with zero hardcoded static lists.

## Tech Stack
`react-19` · `typescript` · `zustand` · `express-5` · `prisma` · `postgresql-rls` · `pgvector` · `firebase-ai-logic` · `gemini-nano` · `cloud-firestore` · `firebase-app-check` · `firebase-remote-config` · `google-adk` · `gemini-live` · `google-cloud-run`
