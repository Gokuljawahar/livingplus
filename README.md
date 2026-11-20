# Living Plus

**PG (paying-guest) living in Chennai, run end to end: honest discovery for guests, a simple home for residents, and a calm workspace for owners, with Gemini doing the routine work and people approving anything that matters.**

Built for the Google Startup Buildathon 2026. The answers this build delivers on are in [`core MD-livingplus_buildathon_answers.md`](core%20MD-livingplus_buildathon_answers.md).

## Three sites, one codebase

| Site | Path | Who | What they do |
|---|---|---|---|
| Guest | `/` | Students and young professionals looking for a PG | Browse with no sign-up. See the real monthly cost (rent, food, deposit), live bed availability, and how far each PG is from their campus or office (IIT Madras, Tidel Park, SIPCOT…). Take **VibeCheck** to see how they'd fit with each room. Request a bed with one phone code, then follow the reply in *My requests*. |
| Resident | `/stay/<pg>` | People living in a PG | See what they owe and pay, report issues with photo or voice, order meals and cleaning, keep move-in condition records, update VibeCheck, request a room change, and read notices. |
| Owner | `/owner` | PG owners and their staff | *Today* (what needs you), beds and bookings, tenants and KYC, the rent ledger and payment claims, expenses, utilities, maintenance, services, staff roles and reports. |

## AI: the right Google tool for each job

| Job | Built with | How |
|---|---|---|
| Assistant for guests, residents and owners (about 30 tools) | **Google ADK** (`@google/adk`) | An `LlmAgent` with one `FunctionTool` per backend action, run by ADK's `Runner`. Tools are scoped to the caller's role and PG. Owners can ask it to draft and post notices or assign a ticket to a warden. Anything that writes (bookings, expenses, bills, notices, assignments) pauses for explicit confirmation, bound to the same person and PG and stored in PostgreSQL, so it survives restarts. |
| KYC document check | **Gemini API** (`@google/genai`), one structured call | Reads an uploaded ID and returns the document type, name, last 4 digits only, legibility and problems, as JSON checked with Zod. The owner still verifies. |
| VibeCheck profile | Gemini, one structured call | Turns "I study till 1 am, keep my desk neat…" (in English, Tamil or Hindi) into 8 lifestyle habits plus a short summary, and asks one follow-up question if something important is missing. |
| VibeCheck matching | Gemini, one structured call | Judges each room against a deterministic baseline score. The AI may move a score by at most ±15 points, and the reasons it gives are about habits only, never names. |
| Voice notes, photo issues | Gemini multimodal | Transcribes voice notes and describes photo complaints, which become maintenance tickets. |
| Search ("quiet PG near Tidel Park") | Gemini embeddings | Semantic matches alongside keyword search. |

**Model:** `gemini-3.8-flash` on Vertex AI: stable, with function calling and structured output, at thinking level `MEDIUM`. The code also runs on `gemini-4-hydrogen`; switch with `AI_MODEL` once the project's per-minute quota for it is raised, since new projects start very low and multi-step tool calls hit 429s.

**Guardrails:**
- VibeCheck never sends names or phone numbers, only habits.
- The KYC check keeps only the last 4 digits of an ID number.
- Each assistant tool returns only what the caller may see: residents never see each other's money or KYC records.
- A model's tool call is checked against the caller's role and PG before anything runs.

## On Google Cloud

| Need | Service |
|---|---|
| Web app and API | **Cloud Run** (one container, scales to zero) |
| Data | **Cloud SQL for PostgreSQL**, with **row-level security** so each owner's PGs are isolated in the database itself |
| Uploads (photos, KYC, condition records) | **Cloud Storage**, private, served through short-lived signed URLs |
| AI | **Vertex AI** (Gemini, embeddings) through the service account, with no API keys |
| Secrets | **Secret Manager** |
| Monthly rent, reminders, search index | **Cloud Scheduler** |
| Health and alerts | **Cloud Monitoring** and **Cloud Logging** |
| Phone OTP and Google sign-in | **Firebase Authentication** (falls back to on-screen demo codes when not set up) |
| Location picker | **Google Maps Platform** |
| Messages | **WhatsApp Business Platform**: alerts out, plus YES/NO replies in, with signed webhooks |

## Deploy

From the repository root, signed in with `gcloud`:

```bash
# Vertex AI on the project (default)
PROJECT_ID=<project> SEED_DEMO_DATA=1 bash deploy/gcp-deploy.sh

# Fresh project without Firebase: on-screen OTP codes
PROJECT_ID=<project> SEED_DEMO_DATA=1 SKIP_FIREBASE=1 bash deploy/gcp-deploy.sh

# AI through a Google AI Studio key instead of Vertex AI
PROJECT_ID=<project> SEED_DEMO_DATA=1 AI_BACKEND=studio GOOGLE_API_KEY=<key> bash deploy/gcp-deploy.sh

# See every step without changing anything
DRY_RUN=1 PROJECT_ID=<project> SKIP_FIREBASE=1 bash deploy/gcp-deploy.sh
```

The script enables the APIs and creates the service account, bucket, secrets, Cloud SQL, image, Cloud Run service, scheduler jobs and monitoring. Migrations run when the container starts. It prints the URLs and the demo owner login at the end.

## Run locally

```bash
cd Project/backend && cp .env.example .env    # set GOOGLE_API_KEY and ENABLE_AI_ORCHESTRATOR=true for AI
npm install && npm run dev                     # starts a local PostgreSQL, applies migrations, runs the API
npm run seed                                   # demo PGs, rooms and residents

cd ../frontend && npm install && npm run dev   # http://localhost:5173
```

## Tests

```bash
cd Project/backend  && npm test                # 243 API, isolation and AI-agent tests
cd Project/frontend && npm test && npm run e2e # unit tests and 7 browser journeys
```

The AI tests script the model, so they check behaviour without network calls: role limits, confirmations bound to the caller, isolation between PGs, and the ±15 VibeCheck limit.

## Design

[`DESIGN.md`](DESIGN.md) is the design system: who each site is for, tokens, type (Plus Jakarta Sans and Inter), layouts, writing rules and the psychology behind them. Its reference material is in [`design/references/`](design/references/README.md).
