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
ENCRYPTION_KEY="<64 hexadecimal characters>"
UPLOAD_STORAGE="local"
ADMIN_USERNAME="<your platform-admin login>"
ADMIN_PASSWORD="<your platform-admin password>"
```

Generate independent values for JWT and encryption with this command, once
for each value:

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
VITE_ENCRYPTION_KEY="<the exact same ENCRYPTION_KEY as the backend>"
```

Leave `VITE_API_BASE_URL` unset locally. Vite forwards `/api` to port 4000.
For a separate API origin, this variable is the origin **without** an `/api`
suffix. Frontend keys are browser-visible; payload encryption does not replace
HTTPS or authorization. Restart Vite after changing frontend environment values.

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

### Portal URLs

| Persona | Local URL | Production URL |
|---|---|---|
| Visitor | `http://localhost:5173/` | `https://livingplus.com/` |
| New owner signup | `http://localhost:5173/register` | `https://livingplus.com/register` |
| PG owner/warden login | `http://{slug}.localhost:5173/login` | `https://{slug}.livingplus.com/login` |
| PG operations | `http://{slug}.localhost:5173/owner/manage` | `https://{slug}.livingplus.com/owner/manage` |
| Resident OTP login | `http://{slug}.localhost:5173/resident` | `https://{slug}.livingplus.com/resident` |
| Platform admin | `http://localhost:5173/login` then `/pg/operators` | `https://admin.livingplus.com/login` |

Signup redirects to the generated PG host. Existing slugs are stored in
`PGProperty.slug` (inspect with `npx.cmd prisma studio`); do not guess them from
display names. One PG host selects one property, but database authorization
still decides access. Public discovery has no portal links.

Chromium/Edge normally resolve `*.localhost` to loopback; Windows PowerShell
HTTP clients may not. If your browser cannot resolve a PG host, configure that
exact host in your OS hosts file/local DNS yourself. Public DNS changes are not
needed. `admin.localhost` is not a platform-admin alias; use localhost path mode
for local admin testing.

### Optional Demo Seed

```powershell
cd D:\livingplus\Project\backend
npm.cmd run seed
```

Only seed a disposable development DB: it upserts fictional properties,
bookings, tenants, bills and rooms and can overwrite demo-field values and bed
states. It is not normal startup. Demo property access is assigned to an
existing database `SUPER_ADMIN` user if one exists; the environment admin login
alone does not create that DB user. The active demo resident uses phone
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
- **Semantic PG search:** set `ENABLE_SEMANTIC_SEARCH=true` and
  `AI_EMBEDDING_MODEL` (default `google-genai:gemini-embedding-001`, using
  `GOOGLE_API_KEY`). Published listings are embedded from stable facts
  (location, description, amenities, rules, room types, rent range) and
  re-embedded only when those change. The listing search box adds matches by
  meaning ("quiet PG near the OMR tech park with veg food") to its keyword
  matches, and the assistant's `search_properties` tool ranks by a free-text
  `query`. Vectors live on `PGProperty` and are ranked in process, which suits
  PG-listing scale; pgvector on Cloud SQL is the path for much larger
  catalogues. Indexing runs at startup (internal scheduler), after listing
  edits, and via `POST /internal/cron/search-index` (Cloud Scheduler). Tune
  `SEMANTIC_SEARCH_MIN_SCORE` against real queries.
- **Maps:** optional frontend `VITE_GOOGLE_MAPS_API_KEY`.
- **Uploads:** private files are stored by `UPLOAD_STORAGE`: `local`
  (default, `backend/private-uploads`), `gcs` (Google Cloud Storage bucket
  `GCS_BUCKET`) or `s3`. Files are never public; viewers get short-lived signed
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

## Verification and Production Builds

From the repository root:

```powershell
npm.cmd --prefix Project/backend test
npm.cmd --prefix Project/backend run build
npm.cmd --prefix Project/frontend run build
npm.cmd --prefix Project/frontend run lint
```

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
GOOGLE_API_KEY=... SEED_DEMO_DATA=1 deploy/gcp-deploy.sh
```

- Secrets (JWT, encryption key, admin and database passwords) are generated
  once into Secret Manager; the script prints how to read the admin password.
- `GOOGLE_API_KEY` (optional) turns on semantic search; without it the
  assistant uses Vertex AI through the service account.
- Firebase settings (optional) turn on Firebase Phone Auth; without them the
  service runs in **OTP demo mode** (`OTP_DEMO_MODE=true`: codes are shown on
  screen). Never use demo mode with real users.
- A `*.run.app` URL has no per-PG subdomains, so the image runs in
  **single-host mode** (`SINGLE_HOST_MODE` / `VITE_SINGLE_HOST_MODE`): owner and
  resident portals use paths (`/pg/manage`, `/pg/resident`) as in local
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
| Scheduled jobs | Cloud Scheduler | `SCHEDULER_MODE=external`; HTTP POST jobs to `/internal/cron/monthly-rent` (`5 0 1 * *`, time zone Asia/Kolkata) and `/internal/cron/rent-reminders` (daily) and `/internal/cron/search-index` (hourly, when semantic search is on), with an OIDC token whose audience matches `CRON_OIDC_AUDIENCE` and service account `CRON_SERVICE_ACCOUNT` |
| AI assistant | Vertex AI (Gemini) | `AI_MODEL=google:<model>` with no `GOOGLE_API_KEY`: the service account authenticates (grant Vertex AI User) |
| Agent state | Cloud SQL (same database) | LangGraph checkpoints live in the `langgraph` schema, created automatically |

`/healthz` is a plain liveness endpoint for the service.

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
| Platform admin | Login, operator search, owner/PG creation and empty-PG deletion. |
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
| Blank listings / missing `VITE_ENCRYPTION_KEY` | Set the frontend key, match the backend key, restart Vite. |
| `Invalid encrypted payload` | Compare effective keys, including `.env.local` overrides. |
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