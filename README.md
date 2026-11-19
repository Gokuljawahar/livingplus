# LivingPlus - PG Booking and Management

Public PG discovery, OTP-verified bookings, owner/warden operations, resident
self-service, and a role-aware AI assistant. Express/TypeScript and Prisma
(PostgreSQL) power the API, with a LangGraph agent for the assistant;
React/Vite/Tailwind power the frontend.

## Requirements

- Node.js 22.12+ or a supported newer LTS, with npm. Vite also supports Node
  20.19+, but not older Node 20 releases.
- Two terminal windows, opened at the repository root (`D:\livingplus` below).
- Internet for initial dependency installation. No PostgreSQL install, Docker
  or cloud account is needed locally: `npm run dev` starts a bundled
  PostgreSQL server (from npm) for you.

Windows examples use `npm.cmd` / `npx.cmd` to avoid PowerShell's `npm.ps1`
execution-policy restriction. On macOS/Linux use `npm` / `npx`.

## First-Time Setup

### Backend Configuration

```powershell
cd D:\livingplus\Project\backend
npm.cmd ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

Configure these values in `Project/backend/.env`:

```dotenv
DATABASE_URL="postgresql://livingplus:livingplus@localhost:5433/livingplus"
PORT=4000
LIVINGPLUS_ROOT_DOMAIN="livingplus.com"
JWT_SECRET="<stable random secret, at least 32 characters>"
UPLOAD_STORAGE="local"
# Optional: give the demo seed's PGs an owner you can sign in as.
DEMO_OWNER_PHONE="9555500001"
DEMO_OWNER_PASSWORD="<a password for the demo owner>"
```

Generate a JWT secret with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Keep `JWT_SECRET` stable across restarts or existing sessions become invalid.
The backend loads `.env`, then `.env.local` **with override enabled**. Check
both when a setting does not take effect. Never commit secrets.

### Frontend Configuration

Configure `Project/frontend/.env.local`:

```dotenv
VITE_ROOT_DOMAIN="livingplus.com"
```

Leave `VITE_API_BASE_URL` unset locally. Vite forwards `/api` to port 4000.
For a separate API origin, this variable is the origin **without** an `/api`
suffix. Everything in `VITE_*` is visible in the browser bundle, so never put
secrets there. The API speaks plain JSON; use HTTPS in production (Cloud Run
provides it). Restart Vite after changing frontend environment values.

### Database

The database is PostgreSQL, managed with Prisma Migrate. With the default
`DATABASE_URL` (localhost port 5433), `npm.cmd run dev` starts a bundled local
PostgreSQL (data in `Project/backend/.local-postgres/`, git-ignored), applies
pending migrations, then starts the API. Point `DATABASE_URL` anywhere else
(another local PostgreSQL, Cloud SQL) and the bundled server is not started.

To change the schema, start only the database, then create a migration:

```powershell
cd D:\livingplus\Project\backend
npm.cmd run db            # terminal A: database only
npm.cmd run db:migrate    # terminal B: prisma migrate dev; commit prisma/migrations
```

`npm.cmd run db:studio` opens Prisma Studio. If generation reports Windows
`EPERM` on Prisma's DLL, stop backend dev servers, regenerate, then restart.

## Start Both Apps

**Terminal 1 - API:**

```powershell
cd D:\livingplus\Project\backend
npm.cmd run dev
```

The API listens on `http://localhost:4000`. Startup assigns missing property
slugs and, with `SCHEDULER_MODE=internal` (the default), runs the rent and
reminder schedulers. Rent periods and due dates follow `APP_TIMEZONE`
(default `Asia/Kolkata`), whatever the server's own timezone.

**Terminal 2 - frontend:**

```powershell
cd D:\livingplus\Project\frontend
npm.cmd ci
npm.cmd run dev -- --host 0.0.0.0 --port 5173 --strictPort
```

Open `http://localhost:5173/`. Keep both terminals running. `Ctrl+C` stops each
server. If 5173 is occupied, choose 5174 and use that port in every frontend
URL. Changing the API port also requires updating the Vite proxy target.

### App areas

LivingPlus is one app with four separate areas. Each has its own URLs,
sign-in and navigation, and never links into another area's workspace
(routing lives in `Project/frontend/src/utils/app-areas.ts`).

| Area | Who | URL | Sign-in |
|---|---|---|---|
| Guest site | Anyone looking for a PG | `/` · `/requests` | None to browse; phone code once, when requesting a bed |
| Resident site | Residents of one PG | `/stay/{slug}` (finder at `/stay`) | Phone code, scoped to that PG |
| Owner workspace | Owners and wardens | `/owner` · `/owner/register` · `/owner/account` | `/owner/login` (password or linked Google) |

There is no platform super admin: no account can see across PG workspaces
(see [Workspace isolation](#workspace-isolation)).

Locally these are `http://localhost:5173/...`; on Cloud Run, the service URL.
Owners find their PG's shareable resident link under **Properties & Beds**.
Slugs are stored in `PGProperty.slug`; do not guess them from display names.
The resident site sends the slug as `X-PG-Slug`, so the API scopes sign-in
and data to that PG, and database authorization still decides access.

Old addresses (`/login`, `/register`, `/pg`, `/pg/manage`, `/pg/resident`,
`/resident`) redirect to the new areas.

With a custom domain (single-host mode off), `{slug}.yourdomain` opens that
PG's resident site.

Chromium/Edge normally resolve `*.localhost` to loopback; Windows PowerShell
HTTP clients may not. If your browser cannot resolve a PG host, configure that
exact host in your OS hosts file/local DNS yourself. Public DNS changes are not
needed.

### Workspace isolation

Each PG is a **workspace**. PostgreSQL itself keeps workspaces apart with
Row-Level Security, so a query that forgets its `WHERE propertyId = ...`
still cannot read or change another PG's data.

- **Every PG table has a workspace key** (`propertyId`). Beds and rent
  entries get theirs from their room or resident through a trigger, whatever
  the client sends. Other triggers refuse rows that point at a bed, resident,
  booking or rent entry from a different PG.
- **Requests run as `livingplus_app`**, a database role that owns nothing and
  cannot bypass RLS. For each query, `Project/backend/src/db/client.ts`
  switches to it inside a short transaction and sets who is asking
  (`app.user_id`, `app.role`, `app.property_id`), taken from the verified
  session and the resident site's PG (`src/db/context.ts`).
- **Policies** (migration `tenant_isolation`):
  - Staff-only tables (bookings, expenses, electricity bills, staff access)
    are visible to owners and wardens of that PG.
  - Resident-visible tables (residents, rent, tickets, payment claims,
    notifications, room changes) are visible to that PG's staff and its
    residents. Which resident sees which row is still decided in the app.
  - Listings, rooms and beds are public only while the PG is published.
  - Audit entries can be written by anyone in the PG; only staff read them.
- **Fail closed.** Code outside a request has no identity and sees only
  public listings, unless it is wrapped in `asSystem(reason, ...)` or a route
  uses `systemRoute(...)`. Only a few things use these:
  - scheduled jobs and search indexing;
  - registration and adding a PG;
  - sign-in and phone codes;
  - guest booking requests and lookups;
  - resolving a PG slug.

  Search for `asSystem(` and `systemRoute(` to review them.
- `User` and `OtpCode` are global identity tables (sign-in looks up any phone
  number) and stay outside RLS.
- Tests in `tests/ai-scenarios.test.ts` ("workspace isolation") query with no
  filter and check that the database blocks cross-PG access. One of them fails
  if a new table with a `propertyId` column has no policy.

### Optional Demo Seed

```powershell
cd D:\livingplus\Project\backend
npm.cmd run seed
```

Only seed a disposable development DB: it upserts fictional properties,
bookings, tenants, bills and rooms and can overwrite demo-field values and bed
states. It is not normal startup. With `DEMO_OWNER_PHONE` and
`DEMO_OWNER_PASSWORD` set, the demo PGs belong to that owner (created if
missing); otherwise they have no owner. The active demo resident uses phone
`9000000001`; inspect their property's actual slug before opening it.

## Optional Services

- **Phone OTP:** `OTP_PROVIDER` picks who sends the codes.
  - `sms` (default): the API sends codes via `SMS_API_URL` (optional
    `SMS_API_KEY`). Without a provider in development, responses include
    `devCode`, shown as a UI toast. Production requires working SMS.
  - `firebase`: Firebase Phone Auth sends and checks codes in the browser (with
    invisible reCAPTCHA); the API verifies the Firebase ID token and issues its
    usual phone token or resident session. No SMS provider is needed. Setup:
    create a Firebase project (it can be your Google Cloud project), enable
    **Authentication > Sign-in method > Phone**, register a Web app, and set
    `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY` and `FIREBASE_APP_ID`. Add
    every domain users verify on under **Authentication > Settings > Authorized
    domains** (`localhost` is included). For demos, add test phone numbers with
    fixed codes there: no SMS is sent and nothing is billed.
- **Resident UPI:** the owner configures the property's UPI ID. Residents open
  their UPI app and submit a transaction reference. Claims remain pending until
  the owner verifies receipt; only approval credits the ledger. This is not
  automatic gateway settlement. Placeholder gateway keys do not enable a
  Razorpay/Cashfree integration.
- **WhatsApp:** enable `ENABLE_WHATSAPP_CLOUD_API` and configure
  `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, approved templates and optionally
  `WHATSAPP_VERSION`. Otherwise use manual/click-to-chat workflows.
- **AI assistant (any model):** the agent is a LangGraph graph over a
  LangChain chat model, so the model is pure configuration. Set
  `ENABLE_AI_ORCHESTRATOR=true` and `AI_MODEL="<provider>:<model>"`, then give
  that provider its usual credentials:

  | `AI_MODEL` example | Credentials | Package |
  |---|---|---|
  | `google:gemini-3.8-flash` | `GOOGLE_API_KEY` ([AI Studio](https://aistudio.google.com/apikey)) | included |
  | `google:gemini-3.8-flash` on Google Cloud | no key: Vertex AI via ADC (`gcloud auth application-default login`, or the Cloud Run service account) | included |
  | `openai:<model>` | `OPENAI_API_KEY` | `npm i @langchain/openai` |
  | `anthropic:<model>` | `ANTHROPIC_API_KEY` | `npm i @langchain/anthropic` |
  | `ollama:<model>` | none (local) | `npm i @langchain/ollama` |

  Any provider `initChatModel` supports works the same way. Optional:
  `AI_VOICE_MODEL` picks an audio-capable model for voice notes (defaults to
  `AI_MODEL`), and `AI_MODEL_OPTIONS` passes provider options as JSON, such as
  `{"temperature":0.2}` or `{"platformType":"gcp","location":"us-central1"}`
  for Vertex AI. To spend Google Cloud credits, use Vertex AI or create the AI
  Studio key in a project with billing linked. `GET /api/pg/ai/status` reports
  the active provider and model. Voice also needs browser microphone permission.
- **Agent tracing (LangSmith):** set `LANGSMITH_TRACING=true` and
  `LANGSMITH_API_KEY` (and optionally `LANGSMITH_PROJECT`). Every assistant turn
  appears as a `livingplus-agent:<turn|confirm|cancel|abandon>` run tagged with
  the caller's role and conversation id, with each model and tool call inside.
  Traces contain user messages; set `LANGSMITH_HIDE_INPUTS=true` /
  `LANGSMITH_HIDE_OUTPUTS=true` to redact them. On Cloud Run also set
  `LANGCHAIN_CALLBACKS_BACKGROUND=false` (the deploy script does this).
- **Semantic PG search:** set `ENABLE_SEMANTIC_SEARCH=true` and
  `AI_EMBEDDING_MODEL`: `google-vertexai:gemini-embedding-001` uses Vertex AI
  with the service account (no key; the Cloud Run default), and
  `google-genai:gemini-embedding-001` uses `GOOGLE_API_KEY`. Both store
  768-dimension vectors. Published listings are embedded from stable facts
  (location, description, amenities, rules, room types, rent range) and
  re-embedded only when those change. The listing search box adds matches by
  meaning ("quiet PG near the OMR tech park with veg food") to its keyword
  matches, and the assistant's `search_properties` tool ranks by a free-text
  `query`. Vectors live on `PGProperty` and are ranked in process, which suits
  PG-listing scale; pgvector on Cloud SQL is the path for much larger
  catalogues. Indexing runs at startup (internal scheduler), after listing
  edits, and via `POST /internal/cron/search-index` (Cloud Scheduler). Tune
  `SEMANTIC_SEARCH_MIN_SCORE` against real queries.
- **Maps:** optional frontend `VITE_GOOGLE_MAPS_API_KEY` for the owner's location
  picker. Enable **Maps JavaScript API**, **Places API (New)** and **Geocoding
  API** for that key (the legacy Places Autocomplete widget is not available to
  projects created after March 2025, so the picker uses Places API (New)).
- **Uploads:** private files are stored by `UPLOAD_STORAGE`: `local`
  (`backend/private-uploads`), `gcs` (Google Cloud Storage bucket
  `GCS_BUCKET`) or `s3`. If it is unset, a configured `GCS_BUCKET` selects
  Cloud Storage, so files never end up on a Cloud Run container's disk. Files are never public; viewers get short-lived signed
  URLs after access checks. Configure `PUBLIC_API_URL` when local signed media
  needs a public API origin. Back up the database and files together.

- **Security and logs:** the API sends Helmet security headers, accepts
  browser calls only from `LIVINGPLUS_ROOT_DOMAIN`, its subdomains,
  `FRONTEND_URL` and `CORS_ORIGINS` (plus localhost outside production), and
  rate-limits AI chat/voice per caller (`AI_RATE_LIMIT_PER_MINUTE`). Logs are
  structured JSON (pino) that Cloud Logging parses with severity; set
  `LOG_FORMAT=pretty` locally. Behind Cloud Run the client IP is taken from one
  trusted proxy hop (`TRUST_PROXY` overrides).

Restart the API after changing backend environment values. Vite embeds
`VITE_*` values during production builds.

## Shared validation rules

`Project/shared` (`@livingplus/shared`) holds the validation rules both apps
use: patterns (UPI ID, payment reference, strong password, billing month),
field limits, allowed values and user-facing messages. The API and the
frontend wrap them in their own Zod schemas, so a rule changes in one place.
After editing `Project/shared/src`, run `npm run build` there and commit
`dist/` (CI fails if it is stale).

## Verification and Production Builds

From the repository root:

```powershell
npm.cmd --prefix Project/backend test
npm.cmd --prefix Project/backend run build
npm.cmd --prefix Project/frontend run build
npm.cmd --prefix Project/frontend run lint
npm.cmd --prefix Project/frontend test        # Vitest unit/component tests
npm.cmd --prefix Project/frontend run e2e     # Playwright end-to-end tests
```

End-to-end tests start their own throwaway PostgreSQL with the demo seed, the
API on port 4100 and Vite on port 5174, then drive Chromium through the guest,
owner and resident journeys. Install the browser once with
`npx playwright install chromium` (CI uses `--with-deps`).

Backend tests start a throwaway PostgreSQL on a free port and apply the real
migrations (set `TEST_DATABASE_URL` to use an existing empty database instead);
they never touch the application DB. Build
before `npm.cmd --prefix Project/backend start`; it runs emitted `src/index.js`.
Serve `Project/frontend/dist` through a production web server. `vite preview`
is a bundle preview, not production hosting, and has no `/api` proxy configured.

Production requires apex plus wildcard DNS/TLS, SPA fallback for deep links,
and `/api` proxying on each app host (or a public API origin with appropriate
CORS). Hosting-provider configuration is not included. Do not expose local dev
servers, `.env`, database files or private uploads publicly.

## Deploying on Google Cloud

### One command (demo / buildathon)

`deploy/gcp-deploy.sh` deploys the whole app as **one Cloud Run service** (API
plus the built frontend, from the root `Dockerfile`) with Cloud SQL, Cloud
Storage, Secret Manager and Cloud Scheduler. It is idempotent and
`DRY_RUN=1` prints every command first.

```bash
gcloud auth login && gcloud config set project YOUR_PROJECT
DRY_RUN=1 deploy/gcp-deploy.sh          # review
SEED_DEMO_DATA=1 ALERT_EMAIL=you@example.com deploy/gcp-deploy.sh
```

- Secrets (JWT, database and demo-owner passwords) are generated once into
  Secret Manager; the script prints how to read the demo owner's password.
- No API keys are needed for AI: the assistant and semantic search use
  Vertex AI through the service account. `GOOGLE_API_KEY` is optional.
- Files go to a private Cloud Storage bucket (`UPLOAD_STORAGE=gcs`).
- Cloud Monitoring gets an uptime check on `/health`, a log-based metric
  for server errors, and one alert policy for "site down or more than 5 errors
  in 5 minutes". `ALERT_EMAIL` (optional) adds an email channel; without it,
  incidents show in the Cloud Console.
- **Firebase Authentication:** if the project has a Firebase web app, the
  script reads its config and turns on Firebase Phone Auth (real SMS codes).
  Google sign-in follows the Firebase Google provider (or set
  `ENABLE_GOOGLE_SIGN_IN`). Add the Cloud Run domain to Firebase
  Authentication's authorized domains.
  - With `SEED_DEMO_DATA=1`, the fictional demo residents (`9000000001`,
    `9000000002`) are registered as Firebase test phone numbers, with code
    `DEMO_OTP_CODE` (default `246810`, no SMS).
  - Without a Firebase app, the service runs in **OTP demo mode**
    (`OTP_DEMO_MODE=true`: codes are shown on screen). Never use demo mode
    with real users.
- A `*.run.app` URL has no per-PG subdomains, so the image runs in
  **single-host mode** (`SINGLE_HOST_MODE` / `VITE_SINGLE_HOST_MODE`): every
  area uses paths (`/owner`, `/stay/{slug}`) as in local
  development. For production with `{slug}.yourdomain` hosts, put a global
  external HTTPS load balancer with a wildcard certificate in front of Cloud
  Run and turn single-host mode off.
- Cost: Cloud Run scales to zero; Cloud SQL `db-f1-micro` runs continuously
  (a few dollars a month at list price). Delete the instance after the event
  if you do not need it: `gcloud sql instances delete livingplus-db`.

### Manual setup reference

The backend image (`Project/backend/Dockerfile`) is built for Cloud Run. It
runs `prisma migrate deploy` on start, stores uploads in Cloud Storage, and
leaves scheduled jobs to Cloud Scheduler.

| Concern | Google Cloud service | Configuration |
|---|---|---|
| Database | Cloud SQL for PostgreSQL | `DATABASE_URL=postgresql://USER:PASS@/livingplus?host=/cloudsql/PROJECT:REGION:INSTANCE`, plus `--add-cloudsql-instances` on the service |
| Files | Cloud Storage | `UPLOAD_STORAGE=gcs`, `GCS_BUCKET`; grant the service account Storage Object Admin on the bucket and Service Account Token Creator on itself (for signed URLs) |
| Scheduled jobs | Cloud Scheduler | `SCHEDULER_MODE=external`; HTTP POST jobs to `/internal/cron/monthly-rent` (`5 0 1 * *`, time zone Asia/Kolkata) and `/internal/cron/rent-reminders` (daily) and `/internal/cron/search-index` (hourly), with an OIDC token whose audience matches `CRON_OIDC_AUDIENCE` and service account `CRON_SERVICE_ACCOUNT` |
| AI assistant | Vertex AI (Gemini) | `AI_MODEL=google:<model>` with no `GOOGLE_API_KEY`: the service account authenticates (grant Vertex AI User) |
| Search embeddings | Vertex AI | `ENABLE_SEMANTIC_SEARCH=true`, `AI_EMBEDDING_MODEL=google-vertexai:gemini-embedding-001` (service account, Vertex AI User) |
| Agent state | Cloud SQL (same database) | LangGraph checkpoints live in the `langgraph` schema, created automatically |
| Monitoring | Cloud Monitoring + Logging | Uptime check on `/health`, log-based error metric `livingplus-server-errors`, alert policy (set up by the deploy script) |

`/health` is the liveness endpoint (Cloud Run reserves paths ending in `z`,
so `/healthz` only works locally).

## Latest Local UI Verification

Browser verification on 2026-11-02 used isolated test accounts/properties on
ports 4000/5173, with desktop and 390px mobile checks. This covers the primary
implemented journeys, not every possible input combination or real production
integration.

| Area | Verified flow |
|---|---|
| Visitor | Listings, location/policy/budget filters, empty results, gallery, legal pages, no portal links. |
| Owner onboarding | Signup, PG-host handoff, invalid/correct login, password change and re-login. |
| Property operations | Room/beds, photo upload, UPI setting, repair/release, unpublish and republish. |
| Bookings | OTP verification, request, status tracking, guest cancellation, owner decline/approval, check-in. |
| Wardens | Create/login/remove; owner financial/staff tabs hidden. |
| Resident | Own stay, profile edit, private KYC upload, complaint creation/status, notice submit/cancel. |
| Payments | Pending claim, owner approval and partial ledger credit, rejection with reason, resident notifications. |
| Billing | Deposit receipt, electricity draft/approval, expense create/remove, monthly report and activity records. |
| Notifications | Complaint/payment updates visible to the resident; mark-as-read updates the unread count. |
| Checkout | Bed release, deposit deduction calculation, refund and reference recording. |
| Access and AI | Wrong-PG owner login rejected; resident AI returns own dues with formatted lists and refuses owner/other-resident data. |
| Files | Gallery loads; signed KYC media returns 200; receipt CSV contents generated correctly. |

Fixed during this run: property updates with blank/string coordinates, payment
rejection using an unsupported native prompt, owner lockout after unpublishing,
and stale operations requests after deleting the current PG. Unpublishing now
removes discovery/new-booking availability but keeps authorized operations and
resident access available; deleting a PG returns its owner to public discovery.

Final gates: **82 backend tests pass; backend and frontend production builds
pass.** Repository-wide frontend ESLint is **not clean**: 66 errors and 2
warnings across 12 files at verification time (mostly explicit `any` types and
React hook rules). A separate lint cleanup is still required.

Limits: no real UPI money transfer, gateway settlement, production SMS/WhatsApp,
production DNS/TLS or voice transcription was verified. The integrated browser
did not emit a receipt-download event, so the CSV payload was checked directly
instead; browser/OS save-dialog behavior is unverified. Report export/print and
all browser/viewport combinations were not exhaustively tested. Synthetic PGs,
accounts, and their referenced gallery/KYC files were removed after testing.

## Troubleshooting

| Symptom | Check |
|---|---|
| API proxy connection refused | Start the API on port 4000 first. |
| `PG site not found` | Use the exact active `PGProperty.slug`. |
| Sessions rejected after API restart | Set a stable JWT secret, then log in again. |
| `npm.ps1 cannot be loaded` | Use `npm.cmd` / `npx.cmd`. |
| Prisma `EPERM` on Windows | Stop backend watchers holding the DLL, regenerate, restart. |
| Port already in use | Stop only the server you own, or choose another frontend port. |

## Layout

- `Project/backend`: API, Prisma schema/seed, billing, AI tools, tests.
- `Project/frontend`: React SPA, public/operations/resident screens.
- `Docs`: product documents.
- `Assets`: shared brand assets.