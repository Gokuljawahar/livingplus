# LivingPlus — PG Booking & Management Platform

A PG / co-living platform with public property discovery, OTP-verified bed
bookings, an owner/warden operations workspace, a resident self-service portal,
and a Super Admin operators view.

## Repository layout

- `Project/backend` — Express + TypeScript REST API, Prisma ORM (SQLite locally,
  PostgreSQL-ready schema dialect), monthly rent scheduler, optional WhatsApp
  Cloud API sender and UPI gateway hooks (both flag-gated, off by default).
- `Project/frontend` — React + Vite + Tailwind customer and operations web app.
- `Docs` — product specification reports (`pg_manage.pdf` is the governing spec).
- `Assets` — brand assets.

## Personas and apps

| Persona | Entry point |
|---|---|
| Guest | `/` discovery, booking requests, booking tracking |
| Resident | `/pg/resident` OTP login, stays, invoices, vacating notice |
| PG Owner / Warden | `/pg/manage` properties, beds, bookings, tenants/KYC, rent, reports, staff, maintenance, activity |
| Super Admin | `/pg/operators` owner accounts and properties |

## Local development

Prerequisites: Node.js 20+, npm.

```powershell
# Backend (http://localhost:4000)
cd Project/backend
cp .env.example .env   # then fill secrets; never commit real values
npm install
npx prisma generate
npx prisma db push     # first run only; creates the local SQLite DB
npm run dev

# Frontend (http://localhost:5173)
cd Project/frontend
npm install
npm run dev
```

Seed fictional PG demo records from `Project/backend`:

```powershell
npm run seed
```

### Environment

- Backend: `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY` (64 hex chars),
  `ADMIN_USERNAME`/`ADMIN_PASSWORD` (fallback Super Admin),
  `ENABLE_WHATSAPP_CLOUD_API` / `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID`,
  `ENABLE_UPI_PAYMENT`, `SMS_API_URL` / `SMS_API_KEY` (optional; without an SMS
  provider, OTP codes are logged server-side and returned as `devCode`).
- Frontend: `VITE_API_BASE_URL`, `VITE_ENCRYPTION_KEY` (must match backend
  `ENCRYPTION_KEY`), `VITE_GOOGLE_MAPS_API_KEY` (optional, enables MapPicker).

`.env` files, local SQLite databases (`*.db`), `uploads/`, `node_modules/`, and
`dist/` output are git-ignored. Start from `Project/backend/.env.example`.

## Scripts

- Backend: `npm run dev` (tsx watch), `npm run build` (tsc emit), `npm start`
  (runs compiled `src/index.js`), `npm run seed`.
- Frontend: `npm run dev`, `npm run build`, `npm run preview`, `npm run lint`.

## Notes

- Bookings require phone OTP verification and hold a bed for a per-property
  configurable window (default 120 minutes).
- WhatsApp Tier 2 templates and UPI payments are optional modules behind
  feature flags; offline mode (wa.me click-to-chat + manual ledger) works
  without them.
