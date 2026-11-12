# LivingPlus — Pitch Deck Content Plan (Google Startup Buildathon)

> 11 slides · 16:9 · Dark theme (deep teal `#0F2027`, mint accent `#2DD4A7`) · 1 conclusion-first headline + max 5 bullets per slide.
> Source of truth: `Buildathon_Answers.md` + deep-research runs (market + competitor verified; Google-stack verified). Portal upload: export to **PDF ≤ 5 MB**.
> Figure rule: every number carries source + year. Anything without one is phrased qualitative — never sized.

---

## Slide 1 — Title

**Headline:** LivingPlus — the experience platform for urban migration
**Sub-line:** From city arrival to move-out · Google Startup Buildathon · India
**Bullets:**
- Tenants get a managed journey: cab pickup, verified stay, food, support, fair checkout
- Owners get a modular console: switch on only what each property needs
- Agentic AI on Gemini API + Live; tenant and role isolation enforced in our tool layer (function-calling per Google Cloud docs, 2026)

**Visual:** night-arrival city skyline + phone mock with journey timeline.
**Say:** "We productize urban migration — one platform both sides love."

---

## Slide 2 — Problem: three structural failures

**Headline:** Settling into a new city is stressful, slow and untrustworthy
**Bullets:**
- Discovery is adversarial — one month's rent is the standard broker fee (2026 city guides); fake-listing frauds run Rs 10,000–2,00,000 per victim, hitting young newcomers most (Sep 2026 review)
- Search drags: 60%+ of Bangalore tenants spend 3+ weeks on mismatched listings (NoBroker Research, 2024)
- Living is unmanaged — food, cleaning, receipts, complaints, dues run on notebooks and WhatsApp
- Supply is fragmented — ~80–85% of urban rentals unorganized vs ~0.3M branded beds (recent analyses; Colliers May 2025)

**Visual:** three cracked pillars labeled Discovery / Living / Supply, each with its figure.
**Say:** "Pain isn't one bug — it's three structural failures. That's why point fixes keep failing."

---

## Slide 3 — Who we serve (demand this large)

**Headline:** Four actors, one platform, a $15–20B market
**Bullets:**
- Demand: 18–30 migrants from a 450M internal-migrant base (Census 2011) and 40M+ urban migrant-worker pool (2026 industry reporting) + parents as trust-buyers
- Economic buyer: independent apartment/PG owners, single to multi-property — the ~80–85% unorganized supply
- Operational users: wardens, cooks, housekeeping with strictly scoped roles
- Ecosystem: food, cleaning, mobility partners buying concentrated resident demand

**Visual:** four personas connected to one hub; market-size callout.
**Say:** "We sell to owners, serve residents free, and monetize both plus partners."

---

## Slide 4 — Solution: three layers

**Headline:** Decouple experience quality from ownership scale
**Bullets:**
- Layer 1, tenant experience — verified discovery near work/college, vibe-matched roommates, OTP-secured booking, flexible food, on-demand cleaning, UPI receipts, tracked complaints, fair checkout
- Layer 2, modular owner console — each property is an isolated tenant space: food plans, cab, integrations, staff roles, analytics, all per-property toggles
- Layer 3, agent orchestration — arrival, living-buddy, move-out, ops, revenue, staff agents; function-calling tools scoped per role (Gemini API, Google Cloud docs 2026)
- Trust built in: police-verification filing per local DM order at onboarding (Form C in 24h for foreigners); e-stamped + Aadhaar-eSigned pacts valid under IT Act 2000

**Visual:** three stacked layers, toggles on the middle one.
**Say:** "Simple owners keep a traditional flow; ambitious ones run a premium brand — same platform."

---

## Slide 5 — The journey: landing to leaving

**Headline:** Own the full migrant journey, not just the listing
**Bullets:**
- Arrive: cab pickup (own or integrated), check-in checklist on chat or voice — Live API native audio: 30 HD voices across 24 documented languages with seamless switching (Google Cloud docs, 2026)
- Settle: nearby verified stays via Places API searchNearby with type/rank filters (Maps Platform docs, 2026); OTP-secured booking
- Live: flexible food, on-demand cleaning, receipts, photo/voice complaints, plain-language dues
- Leave: ledger-based deductions, scheduled inspection, documented refund — no deposit fights

**Visual:** horizontal timeline with 4 stops and icons.
**Say:** "Listing sites exit at search. We stay till send-off — that's where loyalty and margin live."

---

## Slide 6 — Modular multi-tenancy

**Headline:** Every property configures its own LivingPlus
**Bullets:**
- Isolated tenant space per property: data, staff, settings never leak across owners
- Food compulsory or optional per resident; cab, cleaning, WhatsApp on or off per property
- Plug-in integrations: food vendors, cleaning providers, mobility, messaging
- Media and documents shared by time-limited signed URLs, V4 signing (Cloud Storage docs, 2026)

**Visual:** one console branching into three differently-configured properties.
**Say:** "Onboarding a property is a configuration decision, never a rebuild."

---

## Slide 7 — AI agents: the operating model (all claims verified)

**Headline:** Agents do the work; humans approve what matters
**Bullets:**
- Demand agents: arrival, roommate matching, living buddy, move-out
- Supply agents: ops co-pilot (daily brief + drafted notices), revenue (vacancy pricing, lead follow-up), staff coordinator
- Safety: tenant + role gates before every tool call; human approval on money/records; full audit
- Built production-grade: prompts iterated in AI Studio, full-scale evals in GenAI evals service (GA Jul 2026), Antigravity 2.0 + CLI — GA, not preview (Cloud release notes, Aug 2026)

**Visual:** agent roster with a shield/gate icon over tenant boundaries.
**Say:** "Support stops being a cost center and becomes the product itself."

---

## Slide 8 — Business model

**Headline:** Land with SaaS, expand with transactions and take-rate
**Bullets:**
- Pool 1, SaaS: base per-bed subscription + per-module uplift — retention grows with penetration (market: $15–20B PG at ~16% CAGR per RedSeer; organized Rs 4,000cr→Rs 20,600cr by 2030 per Colliers May 2025)
- Pool 2, transactions: booking commissions + featured/verified promotions owners buy to fill vacancies
- Pool 3, ecosystem take-rate: share of food, cleaning, mobility fulfilled in-property
- Flywheel: free residents → density → partner yield → accessible pricing → more owners

**Visual:** three stacked revenue bars feeding a flywheel loop.
**Say:** "Margin expands with every module switched on — NRR grows inside each property."

---

## Slide 9 — Competition (figures checked)

**Headline:** The empty quadrant is ours
**Bullets:**
- Branded co-living covers the journey but only on its own leased/managed network: Stanza ~51–75k beds (FY25 reports vary), Zolo ~50k beds (FY25 revenue Rs 342cr, +67%), Colive ~14k beds targeting 50k
- Marketplaces (NoBroker, MagicBricks, 99acres) stop at lead-gen; NoBroker adds agreements, rent collection, 20,000+ society management — yet no managed-stay living layer
- Brokers monetize opacity; legacy suites (Yardi, Buildium) are accounting-first, though 2026 tools now add AI/portals — none covers the journey on anyone's supply
- Moats: property configuration data × partner density per micro-market × workflow lock-in
- Two-way trust no one else has: double-blind 14-day reviews (Airbnb model, 2026) + AI tenant screening with portable scores — no rent-to-credit promises (not standard in India)

**Visual:** 2×2 matrix (journey coverage × supply flexibility), star top-right.
**Say:** "Nobody covers the whole journey on anyone's supply. That quadrant compounds."

---

## Slide 10 — Traction & roadmap

**Headline:** Engine built; modules and agents are the expansion vector
**Bullets:**
- Built: discovery, OTP booking, payments with ledger, billing, complaints, checkout — tests green, builds passing
- Observable from day one: Cloud Logging + Monitoring with metrics, dashboards, log-based alerts (Google Cloud Observability docs, 2026)
- Pilot: 20 properties in one city + 1–2 colleges and 1 corporate batch; certified-agent listings; paid owner plans + booking commission (precedent: Zolo–MAHE 20k beds 2023; live ref: JECRC 1600+ students 2025)
- Phase 2: arrival cab, food/cleaning partners, roommate matching, voice agents, inter-city transfers (roadmap-only: police-portal filing, deposit-arbitration SLA, rent-to-credit score)

**Visual:** roadmap in three phases with checkmarks on phase 1.
**Say:** "We're not selling slides — the transaction engine runs today."

---

## Slide 11 — Ask

**Headline:** Build the migrant experience layer of India with us
**Bullets:**
- Raising pilot + partner integrations for the 20-property launch
- Seeking: 1 paid LOI for the 20-property pilot (Rs 99/bed/mo + 5% booking commission) plus design-partner owners, food/mobility pilots, Buildathon credits
- Edge hosting on Firebase global CDN at no charge; APIs on Cloud Run that scale to zero — we pay compute only when used (2026 docs)
- Contact: [name · email · phone]

**Visual:** city skyline + "Landing to leaving, handled." tagline.
**Say:** "If you own beds or serve migrants, talk to us this week."

---

## Research footnotes (do NOT put on slides; keep for Q&A)

- Stanza ~75k beds FY25 (Entrackr Apr 2026; CARE cites 51k — ranges vary, use "≈75k, FY25 reports"); leased/managed via 500+ developer partners, not owned.
- Zolo ~50k beds / 300+ properties / 13 cities (Jan 2025 profile); FY25 revenue Rs 342.3cr +67%, losses −38% (RoC via Entrackr Apr 2026).
- Colive ~14k beds at Sep 2025 Bain+Sattva $100M announcement (LiveMint/RealtynMore), 50k target.
- UAE ~89% foreigner (UN WPP/DESA 2024); Law No.4 of 2026 signed 11 Mar 2026, in force 26 Aug 2026 — permits + DLD Shared Accommodation Register, 12-month compliance window (Garant/Kaizen/Alsuwaidi legal summaries 2026); shared units 30–40% below whole-unit rents.
- PH/Indonesia: qualitative fit only — never size TAM. No yearly metro-inflow headcount exists — never claim one.
- Named gaps remaining: exact 2026 bed counts vary by source (use dated figures as written); 99acres/MagicBricks trust-layer depth unverified beyond NoBroker.

Google stack (each confirmed against official docs, accessed 12 Nov 2026)
- Function calling: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/ — tool use via function declarations; Live API async function calling supported.
- Live API overview (24 languages): https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/live-api
- Live API native audio (30 HD voices, 24 languages, seamless switching): https://cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-5-flash-live-api
- AI Studio prompt iteration + code export; GenAI evals: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/evaluation-overview — Agent/Model Evaluations GA per Google Developers Blog 31 Jul 2026 (GenAI Client interface still Preview — do not claim otherwise).
- Antigravity GA (not preview): bundled in Gemini Enterprise Standard/Plus since ~20–21 Aug 2026 (release notes + antigravity.google/blog, 2026).
- Cloud Run scale-to-zero: https://cloud.google.com/run/docs — last instance removed with no traffic, created on demand.
- Firebase Hosting global CDN at no charge: https://firebase.google.com/docs/hosting
- Cloud SQL Postgres automated backups + PITR: https://docs.cloud.google.com/sql
- Storage signed URLs (V4): https://docs.cloud.google.com/storage/docs/signed-urls
- Places API (New) searchNearby: https://developers.google.com/maps/documentation/places/web-service/search-nearby
- Cloud Logging + Monitoring: https://docs.cloud.google.com/stackdriver/docs (Google Cloud Observability)
- Corrected 12 Nov 2026: "97+ Live languages" dropped (third-party only — use 24 documented); tenant/role isolation re-attributed to our tool layer, not Google docs.
- TAM ladder (use verbatim if asked): 450M = 2011 migrant stock, not demand; 40M+ = serviceable urban renter-worker pool; $15–20B = total annual PG spend (~16% CAGR, RedSeer); Rs 4,000cr→Rs 20,600cr by 2030 = organized slice only (Colliers May 2025).
- Live agent demo (verified 12 Nov 2026, local stack): guest discovery via search_properties with grounded reply; resident cross-tenant dues request refused, own dues via get_my_stay (Room 101 Bed 1, Nov 2026: Rs 9,000 + Rs 2,000 = Rs 11,000). Full transcript in Buildathon_Answers.md appendix.
- Pilot economics (proposal — confirm): Rs 99/bed/mo + Rs 49/active module; 5% booking commission; 8–12% partner take-rate target; funnel ~60% demo-to-trial, ~40% trial-to-paid; LTV = ARPU × ~85% margin × ~24-mo tenure. LOI unsigned — name no property until signed.

## Build checklist

- [ ] Fill Slide 11 contact line
- [ ] Keep every slide to ≤ 5 bullets, ≥ 24pt body text
- [ ] Export to PDF, confirm ≤ 5 MB, upload to portal
