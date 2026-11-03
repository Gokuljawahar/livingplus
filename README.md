# LivingPlus - PG Booking and Management

Public PG discovery, OTP-verified bookings, owner/warden operations, resident
self-service, and a role-aware AI assistant. Express/TypeScript and Prisma
(SQLite) power the API; React/Vite/Tailwind power the frontend.

## Requirements

- Node.js 22.12+ or a supported newer LTS, with npm. Vite also supports Node
  20.19+, but not older Node 20 releases.
- Two terminal windows, opened at the repository root (`D:\livingplus` below).
- Internet for initial dependency installation. Local storage/SQLite need no
  AWS, PostgreSQL, or Docker.

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
DATABASE_URL="file:../database.db"
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

```powershell
cd D:\livingplus\Project\backend
npx.cmd prisma validate
npx.cmd prisma generate
npx.cmd prisma db push
```

Run `db push` after schema changes too. Review warnings before proceeding; do
not use `--force-reset` or `--accept-data-loss` on a DB you need. If generation
reports Windows `EPERM` on Prisma's DLL, stop backend dev servers, regenerate,
then restart. SQLite paths resolve relative to the schema; this URL places the
database at `Project/backend/database.db`.

## Start Both Apps

**Terminal 1 - API:**

```powershell
cd D:\livingplus\Project\backend
npm.cmd run dev
```

The API listens on `http://localhost:4000`. Startup assigns missing property
slugs and runs rent/reminder schedulers against the configured database.

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

- **SMS:** `SMS_API_URL`, optional `SMS_API_KEY`. Without a provider in
  development, OTP responses include `devCode`, shown as a UI toast. Production
  requires working SMS and does not return demo codes.
- **Resident UPI:** the owner configures the property's UPI ID. Residents open
  their UPI app and submit a transaction reference. Claims remain pending until
  the owner verifies receipt; only approval credits the ledger. This is not
  automatic gateway settlement. Placeholder gateway keys do not enable a
  Razorpay/Cashfree integration.
- **WhatsApp:** enable `ENABLE_WHATSAPP_CLOUD_API` and configure
  `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, approved templates and optionally
  `WHATSAPP_VERSION`. Otherwise use manual/click-to-chat workflows.
- **AI:** configure `ENABLE_AI_ORCHESTRATOR=true`, `META_MODEL_API_KEY`,
  `META_MODEL_BASE_URL`, `META_MODEL_NAME` for your compatible provider. Voice
  additionally requires `/asr/transcribe` support, `META_VOICE_MODEL_NAME`, and
  browser microphone permission. Chat API compatibility alone does not imply
  voice support.
- **Maps:** optional frontend `VITE_GOOGLE_MAPS_API_KEY`.
- **Uploads:** private local files default to `backend/private-uploads`.
  Set a persistent `UPLOAD_DIR` for deployment, or explicitly configure S3.
  Configure `PUBLIC_API_URL` when signed media needs a public API origin. Back
  up the database and private files together.

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

Backend tests use a throwaway SQLite database, not the application DB. Build
before `npm.cmd --prefix Project/backend start`; it runs emitted `src/index.js`.
Serve `Project/frontend/dist` through a production web server. `vite preview`
is a bundle preview, not production hosting, and has no `/api` proxy configured.

Production requires apex plus wildcard DNS/TLS, SPA fallback for deep links,
and `/api` proxying on each app host (or a public API origin with appropriate
CORS). Hosting-provider configuration is not included. Do not expose local dev
servers, `.env`, database files or private uploads publicly. The schema uses
SQLite; PostgreSQL needs an explicit provider/schema migration, not merely a
different `DATABASE_URL`.

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