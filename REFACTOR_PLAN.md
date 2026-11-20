# Living Plus — Refactor Plan (`refactor/foundations`)

This plan inventories every refactor item from the brief, what was found in the codebase, the library or framework feature used to replace boilerplate/patches, and the risk + mitigation for each change.

> **Branch & safety rules:** All work runs on `refactor/foundations`. `deploy/`, secrets, `.env` files, and applied Prisma migrations are untouched. Every commit keeps all backend (`tsc --noEmit`, `npm test`, `npm run build`) and frontend (`tsc -b`, `npm run lint`, `vitest run`, `playwright test`, `npm run build`) checks green.

---

## Baseline Inventory (Before Starting)

- **Backend**: 251 passing `node:test` tests across 63 suites.
- **Frontend**: 51 passing Vitest unit tests (19 files) + 7 Playwright E2E journeys.
- **Additional pre-existing findings**:
  - `Project/backend/src/` and `tests/` contain ~245 compiled `.js`, `.d.ts`, and `.map` artifacts alongside `.ts` sources.
  - `deploy/cloudbuild.yaml` is explicitly off-limits per Ground Rule 1 ("do not touch `deploy/`"), so item 1 updates `Project/backend/tsconfig.json`, `Project/backend/package.json`, `.gitignore`, `Dockerfile`, and `.github/workflows/ci.yml`, and documents any follow-up line in `deploy/cloudbuild.yaml` in `REFACTOR_REPORT.md`.

---

## Backend Refactor Plan (Items 1–9)

### 1. Emit backend TypeScript to `dist/` instead of committing compiled files in `src/`
- **Found**: `Project/backend/tsconfig.json` has `rootDir` and `outDir` commented out, causing `tsc` to emit ~245 `.js`, `.d.ts`, and `.map` files beside `.ts` sources in `src/`, `tests/`, `prisma/`, and `scripts/`. `package.json` points `main` and `start` at `src/index.js`, and `Dockerfile` copies `src` and runs `node src/index.js`.
- **Approach**:
  - Create `tsconfig.json` for production builds (`rootDir: "./src"`, `outDir: "./dist"`, `include: ["src/**/*.ts"]`) and `tsconfig.typecheck.json` (or include `tests/`/`scripts/`/`prisma/` for `npx tsc --noEmit -p .` with `noEmit: true` or keep `tsconfig.json` with `rootDir: "./src"`, `outDir: "./dist"` and a test/typecheck config). Wait: `npx tsc --noEmit -p .` is one of the required checks! So `tsconfig.json` should compile `src/` cleanly into `dist/` (`rootDir: "./src"`, `outDir: "./dist"`, `include: ["src"]`), while `tests/` are typechecked via `tsconfig.typecheck.json` or `include` with `rootDir: "."`? If `include: ["src/**/*.ts"]`, `tsc --noEmit -p .` checks all of `src/` and emits `dist/index.js` directly (no `dist/src/index.js`). Update `package.json` (`main: "dist/index.js"`, `start: "node dist/index.js"`), `Dockerfile` (`COPY --from=backend /app/dist ./dist`, `CMD [... "node dist/index.js"]`), remove all tracked `.js`/`.d.ts`/`.map` artifacts under `Project/backend/src`, `Project/backend/tests`, `Project/backend/prisma`, `Project/backend/scripts`, and ensure `.gitignore` ignores `Project/backend/dist/`.
  - Verify `prisma/seed-pg.ts` (run via `tsx`) and `prisma migrate deploy` still work.
- **Risk**: Relative paths inside `src/index.ts` or `src/app.ts` (e.g. `path.resolve(__dirname, '../.env')` or `FRONTEND_DIST_DIR`) must still resolve identically from `dist/` as they did from `src/` (both are 1 level under `Project/backend/`). Medium risk; verified by `static-frontend.test.ts`, `npm run build`, and `node dist/index.js` smoke check.

### 2. Split giant `src/controllers/pg.controller.ts` (~2,228 lines) by domain
- **Found**: `pg.controller.ts` holds ~55 exported handlers spanning discovery, bookings, properties/rooms/beds/staff, residents/KYC, rent/expenses/electricity/reports/payment claims, maintenance, VibeCheck, condition reports, and audit logs.
- **Approach**: Extract cohesive domain modules under `src/services/pg/` and `src/controllers/pg/` (or thin domain controllers + services) with a shared `src/services/pg/access.ts` helper for auth/scope checks:
  - `discovery-bookings`: public sites, properties, semantic search, guest bookings, owner bookings.
  - `properties-inventory`: owner properties, rooms, beds, staff, summary.
  - `residents-kyc`: tenant stays, notice, check-in/check-out, resident profile, notifications, KYC AI check.
  - `finance`: rent entries, payments, reminders, payment claims, deposit refunds, expenses, electricity bills, reports.
  - `maintenance`: resident & owner maintenance tickets.
  - `vibecheck`: public VibeCheck, profile builder, voice interview, tenant vibe save/match.
  - `condition-reports`: move-in/move-out condition records.
  - Keep `pg.controller.ts` as a thin barrel re-exporting handlers so existing tests (`ai-scenarios.test.ts`) importing `pg.controller.js` keep working with zero breakage while `pg.routes.ts` mounts domain sub-routers cleanly.
- **Risk**: High surface area across 55 handlers and 251 tests. Mitigated by extracting one domain at a time with full `tsc` + `npm test` after each split.

### 3. Replace 9 copies of `const db = new Proxy(... as Record<string, any>)` with one typed Prisma accessor
- **Found**: 9 files (`services.controller.ts`, `insights.controller.ts`, `pg.controller.ts`, `deposit-shield.controller.ts`, `ai-orchestrator.ts`, `pg-audit.ts`, `ai-checkpointer.ts`, `ai-tools.ts`, `semantic-search.ts`) duplicate `const db = new Proxy({} as Record<string, any>, { get: (_, p) => (prisma as any)[p] })`.
- **Approach**: Export `prisma` directly (already typed as `PrismaClient` from `src/db/client.ts` and re-exported from `src/db/index.ts`), remove all 9 `Record<string, any>` proxies, and fix any real type mismatches surfaced by strict Prisma types.
- **Risk**: Low–medium. Strict Prisma types may surface subtle property name or nullability issues, which is a win.

### 4. Standardize request validation with Zod middleware across all routes
- **Found**: Most routes rely on ad-hoc `parseBody(...)` inside controllers, and ~7 handlers (`vibeInterviewStep`, `buildVibeProfileFromText`, `vibeCheckProperty`, `saveTenantVibe`, `reviewDeposit`, `getPulse`, `postWeeklyBrief`, `getKitchenForecast`, `postBriefingPass`, etc.) inspect `req.body` / `req.query` manually.
- **Approach**: Add Express middleware `validateBody(schema, message)` and `validateQuery(schema, message)` in `src/middleware/validate.middleware.ts` using existing `zod` (`4.6.7`), place all schemas in `src/validation/`, attach middleware in routes, and keep all existing user-facing error messages identical.
- **Risk**: Low. Must preserve exact HTTP status codes (`400`) and toast-facing error messages expected by unit and E2E tests.

### 5. Remove test-only `set*ForTests` / `reset*ForTests` overrides from production code
- **Found**: 10 test hooks in production modules:
  - `setDepositReviewerForTests` (`deposit-shield.controller.ts`)
  - `setBriefWriterForTests`, `setKitchenForecasterForTests` (`insights.controller.ts`)
  - `setVibeProfilerForTests`, `setVibeInterviewerForTests`, `setVibeAgentForTests` (`vibe-agent.ts`)
  - `setKycReaderForTests` (`kyc-check.ts`)
  - `setGcsBucketForTests` (`storage.ts`)
  - `setFirebaseVerifierForTests` (`phone-verification.ts`)
  - `setEmbeddingsForTests` (`ai-embeddings.ts`)
  - `resetWhatsAppStateForTests` (`whatsapp-inbound.ts`)
- **Approach**: Replace global mutable test hooks with proper dependency injection (service factory functions / optional `deps` parameter with production defaults, e.g., `createInsightsHandlers(deps?)`, `reviewDepositWith(deps)`, `checkKyc(input, deps?)`, etc.) and/or `node:test` `mock.method` where appropriate, removing all `*ForTests` exports from production code.
- **Risk**: Medium. `ai-scenarios.test.ts` calls these hooks extensively; tests will be updated to pass injected test doubles cleanly.

### 6. Audit `withoutEmptyText` patch in `src/services/ai-orchestrator.ts`
- **Found**: `withoutEmptyText` strips `{ text: '' }` parts before yielding to ADK (`@google/adk@2.4.0`) and when replaying session history. Inspecting `@google/adk@2.4.0` confirms ADK's event/part helpers check `parts[0]?.text` truthiness and have no config flag to ignore empty text parts.
- **Approach**: Isolate the workaround into a dedicated, well-documented adapter module `src/services/adk-adapter.ts` (containing `AgentModelLlm` and `stripLeadingEmptyTextParts`) with a dedicated unit test explaining why ADK 2.4.0 requires it.
- **Risk**: Low.

### 7. Type and validate the Live Voice WebSocket protocol with Zod in `Project/shared`
- **Found**: `vibe-live.ts` and `useVibeLive.ts` exchange untyped JSON frames (`audio`, `text`, `pause` client→server; `ready`, `audio`, `said`, `heard`, `interrupted`, `turn`, `habits`, `error`, `end` server→client).
- **Approach**: Define `liveClientMessageSchema` and `liveServerMessageSchema` (and TypeScript types) in `Project/shared/src/live-protocol.ts` using Zod (or zero-dep schemas? Note: `Project/shared` currently has no dependencies — we can add exact-pinned `zod: "4.6.7"` to `Project/shared/package.json`, matching both backend and frontend!). Validate both directions in `vibe-live.ts` and `useVibeLive.ts`, and document in `vibe-live.ts` that `perVisitor` / `open` connection limits are per Cloud Run instance.
- **Risk**: Low. Rebuild `Project/shared/dist` and verify CI's `git diff --exit-code -- dist` rule.

### 8. Clean up `prisma/seed-pg.ts` bed status patching
- **Found**: `seed-pg.ts` creates beds as `AVAILABLE` (and resets demo beds) then patches them back to `OCCUPIED` in `seedLivelyDemo`.
- **Approach**: Compute the set of occupied `(propertyId, roomNumber, bedLabel)` keys upfront from the demo resident list, derive each bed's status once during upsert (`occupiedKeys.has(key) ? 'OCCUPIED' : 'AVAILABLE'`), and keep the seed 100% idempotent.
- **Risk**: Low. Verified by running seed twice against embedded Postgres in tests/e2e.

### 9. Deduplicate backend/shared helpers (rupees, dates, phone normalization, money-role checks)
- **Found**:
  - `const rupees = (amount: number) => ...` duplicated in `insights.controller.ts`, `owner-briefing.ts`, and `frontend/src/utils/money.ts`.
  - `normalizePhone` duplicated in `pg-auth.controller.ts` vs `utils/guest-bookings.ts` / shared rules.
  - `seesMoney` (`['OWNER', 'ACCOUNTANT']`) repeated across `insights.controller.ts`, `owner-briefing.ts`, `pg.controller.ts`, and `ai-tools.ts`.
- **Approach**: Move `rupees`, `shortDate`, and `normalizeIndianPhone` into `Project/shared/src/format.ts` (used by both backend and frontend), and centralize `MONEY_ROLES` / `canSeeMoney` in `Project/shared/src/staff.ts` (and backend access helper).
- **Risk**: Low.

---

## Frontend Refactor Plan (Items 10–16)

### 10. Split large pages (`PGManagement.tsx` ~1,285 lines, `PGDiscovery.tsx` ~1,202 lines, `ResidentPortal.tsx` ~916 lines)
- **Found**: All three main pages bundle data fetching, state, forms, modals, and 6–14 sub-views in monolithic files.
- **Approach**: Decompose into feature folders:
  - `src/features/owner/` (shared types, `useOwnerWorkspace` hook, and one view component per tab: `OverviewView`, `PropertiesView`, `BookingsView`, `RoomChangesView`, `TenantsView`, `RentView`, `PaymentsView`, `ExpensesView`, `UtilitiesView`, `MaintenanceView`, `ReportsView`, `StaffView`).
  - `src/features/discovery/` (`PropertyCard`, `PropertyDetailSheet`, `BookingWizard`, `DiscoveryFilters`, `useDiscoverySearch`).
  - `src/features/resident/` (`ResidentHomeView`, `ResidentMaintenanceView`, `ResidentNotificationsView`, `ResidentProfileView`, `ResidentSignIn`, `useResidentPortal`).
- **Risk**: Medium. Keep all visible labels, `aria-label`s, and test selectors identical so all 51 Vitest tests and 7 Playwright journeys remain green.

### 11. Move owner and resident views from React state to nested React Router routes
- **Found**: `PGManagement` uses `useState<WorkspaceView>('overview')` and `ResidentPortal` uses local state, pushing nav items into `SidebarContext` via `useEffect`. Back button and deep links don't work.
- **Approach**:
  - Owner nested routes under `/owner`: `/owner` (index = Today/overview), `/owner/properties`, `/owner/bookings`, `/owner/room-changes`, `/owner/tenants`, `/owner/pulse`, `/owner/rent`, `/owner/payments`, `/owner/expenses`, `/owner/utilities`, `/owner/maintenance`, `/owner/reports`, `/owner/staff`, `/owner/services`.
  - Resident nested routes under `/stay/:slug`: `/stay/:slug` (index = Home), `/stay/:slug/money`, `/stay/:slug/food`, `/stay/:slug/services`, `/stay/:slug/stay-services`, `/stay/:slug/maintenance`, `/stay/:slug/room-change`, `/stay/:slug/notifications`, `/stay/:slug/profile`.
  - Derive active sidebar item from `useLocation()` / `<NavLink>` instead of `useEffect` pushing into `SidebarContext`. Update `workspaces.spec.ts` only if role changes from `button` to `link` (or keep semantic `<NavLink>` and assert URL + back-button behaviour in E2E).
- **Risk**: Medium. Must preserve `ProtectedRoute`, `AppLayout`, and resident-site host isolation.

### 12. Standardize all forms on `react-hook-form` + Zod; eliminate DOM mutation in `DepositCompare.tsx`
- **Found**: `TenantsView` (edit resident, check-out, deposit refund), `RentView` (record payment), and `DepositCompare.tsx` (`wrapper.current?.closest('form')` + direct `input.value = ...` DOM writes) bypass `react-hook-form`.
- **Approach**: Convert remaining uncontrolled `FormData` forms to `react-hook-form` + Zod schemas. Refactor `DepositCompare` to accept an `onApply({ deductions, note })` callback that calls `setValue('depositDeductions', ...)` and `setValue('checkoutNote', ...)` on the check-out form. Add a unit test for `DepositCompare` verifying `onApply`.
- **Risk**: Low–medium.

### 13. Standardize data fetching on TanStack Query with centralized query keys
- **Found**: `PGManagement` and `PgPulse` use TanStack Query, while `PGDiscovery`, `DepositCompare`, `ConditionRecords`, `OwnerServices`, and parts of `ResidentPortal` call `api.get`/`api.post` inside `useEffect` with manual loading state.
- **Approach**: Create `src/api/query-keys.ts` with typed query key factories (`queryKeys.owner.*`, `queryKeys.resident.*`, `queryKeys.discovery.*`), migrate effect-based fetches to `useQuery` / `useMutation`, and invalidate affected keys after mutations.
- **Risk**: Low–medium.

### 14. Build shared token-only UI primitives in `src/components/ui/` and replace legacy Tailwind classes
- **Found**: ~1,063 occurrences of legacy classes (`text-slate-*`, `bg-slate-*`, `border-slate-*`, `rounded-xl`, `rounded-2xl`, `text-[10px]`) coexist with design tokens in `index.css` (`navy-900`, `ink`, `muted`, `surface`, `canvas`, `hairline`, `field-border`, `amber-500`, `positive`, `attention`, `negative`).
- **Approach**: Create `Button`, `Card`, `Field`, `Select`, `Sheet`, `EmptyState` alongside existing `StatusPill` in `src/components/ui/` styled strictly with `DESIGN.md` tokens, and migrate feature components away from legacy classes.
- **Risk**: Medium (visual/selector regressions). Mitigated by Playwright E2E + Vitest checks.

### 15. Migrate `useVibeLive.ts` from deprecated `ScriptProcessorNode` to `AudioWorklet`
- **Found**: `src/hooks/useVibeLive.ts` uses `micCtx.createScriptProcessor(4096, 1, 1)` to downsample microphone audio to 16 kHz PCM16.
- **Approach**: Add a dedicated `AudioWorkletProcessor` (in `public/pcm-capture-worklet.js` or Vite `?url` module in `src/audio/pcm-capture-worklet.ts`) that captures mono Float32 frames and posts them to the main thread for 16 kHz PCM16 downsampling and WebSocket streaming, preserving 24 kHz playback and half-duplex muting while Gemini speaks. Add a unit test for the downsampler/protocol.
- **Risk**: Medium (browser AudioWorklet loading in Vite dev + production build). Verified by Vite build and unit tests.

### 16. Replace hard-coded colours outside tokens (including `App.tsx` toasts)
- **Found**: `App.tsx` hard-codes `#fff`, `#1E293B`, `#E2E8F0`, `#02224B` in `<Toaster toastOptions>`.
- **Approach**: Replace with CSS custom properties (`var(--color-canvas)`, `var(--color-ink)`, `var(--color-hairline)`, `var(--color-navy-900)`, `var(--radius-card)`, `var(--shadow-float)`) and sweep remaining raw hex values across `src/`.
- **Risk**: Low.
