# Living Plus Code Quality Refactor Report

Branch: `refactor/foundations` (branched from `feat/google-cloud-langgraph` at `ce94471`).  
Scope: All 16 items from the Living Plus code quality refactor brief (9 backend, 7 frontend), completed in 19 small, reviewable commits with zero behaviour regressions.

---

## 1. Summary of Changes by Item

### Backend (Items 1–9)

1. **Emit TypeScript build output to `dist/` and stop committing compiled files** (`2db67fa`)
   - Configured `Project/backend/tsconfig.json` with `rootDir: "./src"`, `outDir: "./dist"`, and added `Project/backend/tsconfig.seed.json` to compile `prisma/seed-pg.ts` into `dist/prisma/seed-pg.js`.
   - Updated `Project/backend/package.json` (`main: "dist/index.js"`, `start: "node dist/index.js"`, `build: "tsc && tsc -p tsconfig.seed.json"`) and `Dockerfile` (copies `/app/dist` and places `/app/dist/prisma/seed-pg.js` at `./prisma/seed-pg.js` so existing `node prisma/seed-pg.js` seed jobs continue working unchanged).
   - Removed ~245 committed `.js`, `.d.ts`, and `.map` files from `Project/backend/{src,tests,scripts,prisma}` and updated `.gitignore`.
2. **Split the 2,223-line `pg.controller.ts` by domain** (`7747b45`)
   - Split `Project/backend/src/controllers/pg.controller.ts` into 8 focused modules under `Project/backend/src/controllers/pg/`:
     - `access.ts` (shared auth, scope, and hold-expiry helpers)
     - `vibecheck.controller.ts`
     - `condition-reports.controller.ts`
     - `properties.controller.ts`
     - `discovery-bookings.controller.ts`
     - `residents.controller.ts`
     - `finance.controller.ts`
     - `maintenance.controller.ts`
   - Replaced dynamic `await import('../services/pg-billing.js')` workarounds in `finance.controller.ts` with top-level imports.
   - Kept `pg.controller.ts` as a thin barrel re-export so existing routes and direct controller tests remain 100% compatible.
3. **Replace 9 untyped `db` Proxies with one typed Prisma accessor** (`5231c1a`)
   - Created `Project/backend/src/db/index.ts` exporting a single typed `db: PrismaClient`, `prisma`, `systemPrisma`, `asSystem`, and `systemRoute`.
   - Removed all 9 `const db = new Proxy({} as Record<string, any>, ...)` copies and broke circular `../app.js` imports across 5 modules (`room-change.controller.ts`, `pg-auth.controller.ts`, `whatsapp-inbound.ts`, `owner-briefing.ts`, `vibe-live.ts`).
   - Fixed 16 strict TypeScript issues surfaced by removing `any`.
4. **Standardize request validation with Zod middleware** (`d0492ed`)
   - Added `Project/backend/src/middleware/validate.middleware.ts` (`validateBody`, `validateQuery`) and schemas in `Project/backend/src/validation/request.schemas.ts` covering previously hand-checked routes (VibeCheck profile/interview/match, tenant vibe, weekly brief, pulse, kitchen forecast, deposit review, briefing pass, service order status, condition reports).
   - Added 3 unit tests in `Project/backend/tests/validate-middleware.test.ts`.
5. **Remove test-only overrides from production code** (`7c6299c`)
   - Removed all 11 `set*ForTests` / `reset*ForTests` global override hooks and mutable module-level state across 8 production files (`insights.controller.ts`, `deposit-shield.controller.ts`, `whatsapp-inbound.ts`, `storage.ts`, `kyc-check.ts`, `phone-verification.ts`, `ai-embeddings.ts`, `vibe-agent.ts`).
   - Replaced them with explicit dependency-injection factories (`createWeeklyBriefHandler`, `createKitchenForecastHandler`, `createDepositReviewer`, `createWhatsAppInboundHandler`, `createStorageService`, `createVerifyOtpHandler`, `createGoogleLoginHandler`, `createLinkGoogleHandler`, `createCheckMyKycHandler`, `createBuildVibeProfileHandler`, `createVibeInterviewStepHandler`, `createVibeCheckPropertyHandler`, `createSearchPropertiesSemanticHandler`) and optional `deps` parameters.
   - Updated `Project/backend/tests/ai-scenarios.test.ts` to inject fakes directly. Zero `*ForTests` symbols remain in `Project/backend/`.
6. **Isolate the `@google/adk@2.4.0` empty-text workaround** (`8b6d9c8`)
   - Verified `@google/adk@2.4.0` has no configuration option to prevent dropping events whose first part is `{ text: '' }`.
   - Extracted the workaround into a dedicated adapter `Project/backend/src/services/adk-adapter.ts` (`stripEmptyTextParts`, `INVALID_ARGS`, `generateModelStep`, `AgentModelLlm`) with 3 unit tests in `Project/backend/tests/adk-adapter.test.ts` documenting why it exists.
7. **Type and validate the Live Voice WebSocket protocol with Zod** (`d7cad8d`)
   - Defined client and server message schemas once in `Project/shared/src/live-protocol.ts` using a zero-runtime-dependency `createLiveProtocol(z)` factory (preserving Docker/ESM compatibility for `@livingplus/shared`).
   - Validated both directions in `Project/backend/src/services/vibe-live.ts` (and documented that the in-memory per-visitor connection cap applies per Cloud Run instance) and on the frontend in `Project/frontend/src/hooks/useVibeLive.ts`.
   - Added 2 unit tests in `Project/backend/tests/live-protocol.test.ts`.
8. **Remove post-reset bed patching in `prisma/seed-pg.ts`** (`39417ad`)
   - Hoisted `LIVELY_RESIDENTS` and `OCCUPIED_DEMO_BEDS` so each bed's `OCCUPIED` / `AVAILABLE` status is derived once during upsert. Seed remains idempotent.
9. **Deduplicate formatting, phone, and money-role helpers** (`33893cf`)
   - Added `Project/shared/src/format.ts` (`rupees`, `shortDate`, `billName`, `normalizeIndianPhone`, `phoneVariants`) and `MONEY_ROLES` / `canSeeMoneyRole` in `Project/shared/src/staff.ts`.
   - Re-exported in `Project/frontend/src/utils/money.ts` and updated backend controllers/services to import from `@livingplus/shared`.

### Frontend (Items 10–16)

10. **Split the three monolithic pages into feature modules** (`579c385`, `3b135e6`, `bf693cc`)
    - `ResidentPortal.tsx`: 932 → 227 lines; split into `features/resident/{types,ResidentSignIn,ResidentStaysView,ResidentProfileView,ResidentMaintenanceView,ResidentNotificationsView}.tsx`.
    - `PGDiscovery.tsx`: 1,203 → 342 lines; split into `features/discovery/{types,FilterSheet,PropertyCard,BookingModal}.tsx`.
    - `PGManagement.tsx`: 1,289 → 251 lines; split into `features/owner/{types,OverviewView,PropertiesView,BookingsRoomChangesViews,TenantsView,FinanceViews,OperationsViews}.tsx` alongside the 3 form modules from Item 12.
11. **Move owner and resident workspace views to nested React Router routes** (`4950701`)
    - Added `/owner/:section` and `/stay/:slug/:section` routes in `Project/frontend/src/App.tsx`.
    - Replaced `useState` view switching in `PGManagement.tsx` and `ResidentPortal.tsx` with `useParams` + `useNavigate` so deep links and browser Back/Forward work natively while keeping the grouped sidebar.
12. **Standardize forms on `react-hook-form` + Zod and remove DOM mutation** (`5f1502e`)
    - Refactored `Project/frontend/src/components/DepositCompare.tsx` to invoke an `onApply({ depositDeductions, checkoutNote })` callback instead of traversing `closest('form')` and mutating DOM inputs; added `DepositCompare.test.tsx`.
    - Replaced `FormData` uncontrolled forms with `react-hook-form` + Zod components (`TenantEditForm.tsx`, `TenantCheckoutForm.tsx`, `RecordPaymentForm.tsx`).
13. **Centralize TanStack Query keys and invalidation** (`742247f`)
    - Created `Project/frontend/src/api/query-keys.ts` (`queryKeys.*`) and migrated all data screens (`PGManagement`, `PgPulse`, `KitchenForecast`, `ResidentPortal`, `PGDiscovery`, `ResidentFinder`, `RoomChange`, `MyRequests`).
14. **Build shared token-only UI primitives and replace legacy utility classes** (`3c3a334`, `579c385`, `3b135e6`, `bf693cc`)
    - Added `Button`, `Card`, `Field`, `Select`, `Sheet`, `EmptyState`, and `ui.test.tsx` in `Project/frontend/src/components/ui/` styled exclusively with design tokens from `index.css`.
    - Adopted the primitives and replaced legacy `slate-*`, `rounded-xl`, `text-[10px]` classes across `ResidentPortal`, `PGDiscovery`, and `PGManagement` feature views.
15. **Migrate microphone capture from deprecated `ScriptProcessorNode` to `AudioWorklet`** (`75076fd`)
    - Added `Project/frontend/public/pcm-capture-worklet.js` (`pcm-capture-processor`, 4096-sample mono chunks) and updated `Project/frontend/src/hooks/useVibeLive.ts` while preserving 16 kHz PCM16 capture, 24 kHz playback, and half-duplex muting while the assistant speaks.
    - Added 2 unit tests in `Project/frontend/src/hooks/useVibeLive.test.ts`.
16. **Replace hard-coded colours outside design tokens** (`4973304`)
    - Replaced raw hex colours in `Project/frontend/src/App.tsx` `<Toaster>` and fallback UI with CSS custom property tokens (`var(--color-canvas)`, `var(--color-ink)`, `var(--color-hairline)`, `var(--color-navy-900)`, `var(--radius-card)`, `var(--shadow-float)`).

---

## 2. Libraries Added

**None.** Every improvement was achieved using the existing stack (`zod`, `react-hook-form`, `@tanstack/react-query`, `react-router-dom`, Web `AudioWorklet`, and TypeScript strict typing).

- `Project/shared/package.json` declares `peerDependencies: { "zod": "4.6.7" }` (pinned exact version matching backend/frontend) as a type-only contract for `createLiveProtocol(z)` so `@livingplus/shared` remains zero-runtime-dependency.

---

## 3. Patches Replaced with Proper Fixes

| Patch / Workaround | Proper Fix |
| --- | --- |
| 51+ compiled `.js`/`.d.ts`/`.map` files committed beside `.ts` sources | `tsconfig.json` `outDir: "./dist"` + `tsconfig.seed.json` + clean `Dockerfile` build |
| 9 copies of `new Proxy({} as Record<string, any>, ...)` hiding Prisma types | Single typed `db: PrismaClient` accessor in `src/db/index.ts` |
| 11 global `set*ForTests` / `reset*ForTests` hooks in production modules | Explicit dependency-injection factories and `deps` parameters |
| `DepositCompare.tsx` calling `closest('form')` and writing `.value` on DOM inputs | `onApply` callback wired to `react-hook-form` `setValue` in `TenantCheckoutForm.tsx` |
| Deprecated `AudioContext.createScriptProcessor` in `useVibeLive.ts` | Standards-compliant `AudioWorkletNode` (`public/pcm-capture-worklet.js`) |
| Post-reset bed status patching in `prisma/seed-pg.ts` | Single-pass status derivation from `OCCUPIED_DEMO_BEDS` |
| Untyped JSON over Live Voice WebSocket | Shared Zod protocol (`createLiveProtocol(z)`) validating both client and server frames |
| Dynamic `await import('../services/pg-billing.js')` to sidestep circular imports | Static top-level imports after breaking `../app.js` cycles |
| `withoutEmptyText` inline inside `ai-orchestrator.ts` | Isolated, documented, and unit-tested in `src/services/adk-adapter.ts` (no native option in `@google/adk@2.4.0`) |

---

## 4. Intentionally Not Changed (and Why)

1. **`deploy/` files (e.g., `deploy/cloudbuild.yaml`, `deploy/gcp-deploy.sh`)**: Ground Rule 1 forbids touching `deploy/`. `Dockerfile` was updated to preserve the `./prisma/seed-pg.js` path so existing Cloud Run seed jobs continue to work. Note: if any Cloud Build step references compiled `.js` files inside `src/`, update it to `dist/` when ready to deploy.
2. **Database migrations & RLS policies**: Untouched per Ground Rules 1 and 8.
3. **Google stack (`@google/adk`, `@google/genai`, Vertex AI, Cloud Run, Cloud SQL)**: Untouched per Ground Rule 6.
4. **Radix UI primitives**: Not added because our custom `Sheet`, `Button`, `Card`, `Field`, `Select`, and `EmptyState` primitives already satisfy accessibility and design-token requirements without adding new runtime dependencies.
5. **Secondary smaller components outside the 3 monolithic pages**: Some smaller standalone components (e.g., `AIChatPanel.tsx`, `OwnerServices.tsx`, `RoomChange.tsx`) still retain a few legacy Tailwind classes; they were left scoped to avoid unnecessary churn outside the core refactor targets.

---

## 5. Verification Results (All Green)

| Suite | Command | Result |
| --- | --- | --- |
| Shared build & dist sync | `cd Project/shared && npm run build && git diff --exit-code -- dist` | Pass |
| Backend typecheck | `cd Project/backend && npx tsc --noEmit -p .` | Pass (0 errors) |
| Backend tests | `cd Project/backend && npm test` | **259 / 259 pass** (baseline: 251; +8 new tests) |
| Backend build | `cd Project/backend && npm run build` | Pass |
| Frontend typecheck | `cd Project/frontend && npx tsc -b` | Pass (0 errors) |
| Frontend lint | `cd Project/frontend && npm run lint` | Pass (**0 errors, 0 warnings**) |
| Frontend unit tests | `cd Project/frontend && npx vitest run` | **56 / 56 pass** across 22 files (baseline: 51; +5 new tests) |
| Frontend E2E tests | `cd Project/frontend && npx playwright test` | **7 / 7 journeys pass** |
| Frontend production build | `cd Project/frontend && npm run build` | Pass |

---

## 6. Remaining Risks & Follow-Ups

- **Per-instance Live Voice connection limit**: `vibe-live.ts` tracks active sessions per visitor in memory; under multi-instance Cloud Run autoscaling, limits apply per instance (documented in code). Moving to Redis/Memorystore is only needed if horizontal scaling exceeds single-instance limits.
- **AudioWorklet fallback in older browsers**: `AudioWorklet` is supported in all modern browsers (Chrome 66+, Firefox 76+, Safari 14.1+); very old mobile WebViews without `audioWorklet` will surface the existing graceful error message and fall back to typed/quiz VibeCheck.
- **ADK empty-text workaround**: Re-check when upgrading `@google/adk` beyond `2.4.0`; `adk-adapter.ts` makes removing or adjusting it a single-file change.
