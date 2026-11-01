# PG Booking & Management Platform

A PG-only web application for guest property discovery and owner/staff operations.

## Features

- Public property search by locality, resident policy, monthly budget, room type, AC, food, and amenities
- OTP-verified bed-level booking requests, expiring reservations, booking status lookup, and cancellation
- Resident portal (`/pg/resident`): OTP login, stays, invoices, receipts export, vacating notice
- Owner workspaces for properties, rooms, inventory, tenant/KYC records (with verification), check-in/out with deposit settlement, and warden access
- Offline rent and deposit ledger, payment reconciliation, maintenance tickets, occupancy/revenue reports (CSV + Excel export), and activity log
- Optional direct WhatsApp inquiry links using each property's public contact number

## Local Development

Start the backend from `Project/backend`:

```powershell
npm run dev
```

Start the frontend from `Project/frontend`:

```powershell
npm run dev
```

The local backend uses SQLite. Keep encryption settings in ignored `.env.local` files and set the same 64-character hexadecimal key as `ENCRYPTION_KEY` in the backend and `VITE_ENCRYPTION_KEY` in the frontend.

Seed fictional PG demo records with `npm run seed` from `Project/backend`.
