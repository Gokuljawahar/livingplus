# LivingPlus design system (DESIGN.md)

The source of truth for how LivingPlus looks, reads and behaves. Read it before
changing any UI, whether you are a person or an AI coding agent. It covers who we
design for, the visual tokens, layouts for each of the three sites, components,
writing, the psychology behind each decision, and the quality floor.

Background material is in [`design/references/`](design/references/README.md):
- DESIGN.md files from Airbnb, Wise, Stripe and Linear;
- Anthropic's `frontend-design` skill;
- the 30 Laws of UX.

We borrow patterns from them, not their brands.

---

## 1. Who we design for

LivingPlus is a paying-guest (PG) platform in Chennai with three separate sites.
The people on each one are in very different states of mind, and the design
answers that state first.

| Site | Who | Their state of mind | What the design must do first |
|---|---|---|---|
| **Guest site** `/` | Students and young professionals, often new to Chennai, mostly on a phone. Parents often co-decide over WhatsApp. | Anxious and comparing. "Is it safe? What will it *really* cost? Is the photo honest? Will the owner reply?" | Lower uncertainty. Show the real all-in monthly cost, the resident policy (women / men / co-living), what's included and what isn't, and real availability. Let them browse with zero sign-up. |
| **Resident site** `/stay/<pg>` | People living in one PG | Routine, with occasional friction. "What do I owe and by when? Did they get my payment? When will the tap be fixed?" | Show money and open issues at a glance, and make one-tap actions obvious. Confirm every action clearly. |
| **Owner workspace** `/owner` | PG owners and wardens, time-poor, often on a phone between rounds | Busy and problem-first. "Who hasn't paid? Who wants a bed? What's broken?" | Put what needs attention today at the top, ordered by urgency. Keep a dense but calm working surface. |

**Design for the hardest moment in each journey:**
- for a guest, the first visit, on a 360 px phone, on a slow 4G connection;
- for a resident, the day rent is due;
- for an owner, the first of the month.

## 2. Principles

1. **Honesty is the conversion strategy.** Show the full monthly cost: rent plus
   food, electricity rules and deposit. Show availability only when it's real.
   Never show a trust claim we can't back up. Trust builds slowly and breaks once.
2. **One job per screen and one primary action per view.** The amber button
   means "this is the thing to do here". If a view has two amber buttons, one of
   them is wrong.
3. **Money is sacred.** Every amount uses the rupee format `₹8,200` with
   tabular figures. Status (paid, due, overdue) has one colour and one word
   everywhere. Payment states never feel ambiguous.
4. **Calm density for work, generous space for choice.** The owner workspace
   packs information in with hairlines and alignment. The guest site breathes,
   and photos carry the weight.
5. **Each site has its own personality, built from one system.** The guest site
   is warm and photo-led, the resident site friendly and clear like a fintech
   app, and the owner workspace quiet and efficient. All three share the same
   tokens, type and voice.
6. **Phone first, always.** Design at 360 px, then expand. Primary actions stay
   within thumb reach and touch targets are at least 44 px.

## 3. Visual identity

### 3.1 Colour

We keep the existing brand, **navy and amber**, and give each colour a strict
job. The contrast ratios below were measured against WCAG 2.2.

| Token | Hex | Role | Contrast |
|---|---|---|---|
| `navy-900` | `#02224B` | Brand. Headings, primary text on light surfaces, top bars, selected states, focus ring | 15.8:1 on white |
| `navy-700` | `#0A3B75` | Links, hover on navy, info text | 11.1:1 on white |
| `ink` | `#24364F` | Body text | 12.2:1 on white |
| `muted` | `#5A6B82` | Secondary text, captions, helper text | 5.4:1 on white, 5.1:1 on `surface` |
| `field-border` | `#7A8AA0` | Input and checkbox borders (meets the 3:1 rule for interactive elements) | 3.5:1 on white |
| `hairline` | `#E2E7EE` | Dividers and card borders (decorative only) | — |
| `canvas` | `#FFFFFF` | Guest site background, cards, sheets | — |
| `surface` | `#F5F7FA` | Workspace and portal page background (cards sit on it in white) | — |
| `amber-500` | `#FEB109` | **Primary action fill only**: Request a bed, Pay rent, Approve. Text on it is always `navy-900` | navy on amber 8.6:1 |
| `amber-600` | `#E39E00` | Primary action hover and pressed | — |
| `amber-50` | `#FFF6DD` | Highlight tint: selected chip, the "new" row | — |

**Rules:**
- **Amber is never text or an icon on white** (1.8:1, unreadable) and is never a
  status colour. It means "act here", nothing else.
- **The focus ring is navy** (`navy-900`, 2 px plus a 2 px offset). It stays
  visible on white and on amber.
- **No gradients as decoration.** Top bars are solid `navy-900`.

**Status colours.** Each state uses one colour and one word, everywhere (the
Law of Similarity):

| Meaning | Text / icon | Background | Used for |
|---|---|---|---|
| Positive | `#17734A` | `#E7F5EE` | Paid, Approved, Resolved, Verified, Checked in |
| Attention | `#B5470B` | `#FDEEE4` | Due soon, Pending, Partly paid, Notice period |
| Negative | `#B42318` | `#FDECEA` | Overdue, Declined, Failed, Urgent |
| Neutral / info | `#0A3B75` | `#EAF1FA` | Reserved, In progress, Draft |
| Closed | `#5A6B82` | `#F1F4F8` | Cancelled, Expired, Moved out |

All status pairs reach at least 4.7:1. Always pair colour with a word, and
ideally an icon too. Never rely on colour alone.

### 3.2 Typography

Two families from **Ek Type**, an Indian type foundry, served from Google
Fonts. They suit a Chennai product, and their wider families already cover
Indian scripts (Anek Tamil, Mukta's Devanagari) if we add regional languages.
I checked the font files: both include the rupee sign `₹` and tabular figures
(the `tnum` feature).

| Role | Family | Weights | Notes |
|---|---|---|---|
| Display: page titles, PG names, big money figures | **Anek Latin** (variable) | 600–700 | Slightly condensed and warm. Use it for headings only, never paragraphs. |
| Text: everything else | **Mukta** | 400, 500, 600 | Open, highly legible at small sizes on low-end screens |

**Type scale** (rem at a 16 px root; line height in parentheses):

| Token | Size | Family / weight | Use |
|---|---|---|---|
| `display` | 2rem / 32 px (1.15) | Anek 700 | Resident money hero ("₹8,200 due"), Today count |
| `title-1` | 1.5rem / 24 px (1.2) | Anek 700 | Page titles |
| `title-2` | 1.25rem / 20 px (1.25) | Anek 600 | Section headings, PG name on its detail page |
| `title-3` | 1.0625rem / 17 px (1.3) | Mukta 600 | Card titles (PG name on a listing card) |
| `body` | 1rem / 16 px (1.5) | Mukta 400 | Body text. Inputs are always 16 px, so iOS doesn't zoom. |
| `body-sm` | 0.875rem / 14 px (1.45) | Mukta 400/500 | Meta lines, table cells |
| `caption` | 0.8125rem / 13 px (1.4) | Mukta 500 | Helper text, badges |

**Rules:**
- **Sentence case everywhere.** No ALL-CAPS labels and no tracked-out eyebrow
  text above headings.
- **Money and counts use tabular figures** (`font-variant-numeric: tabular-nums`)
  and the Indian grouping `₹1,25,000` (`toLocaleString('en-IN')`).
- **Keep lines to 75 characters or fewer.** Body text never sits on a coloured
  background.
- **Don't highlight a single word** of a heading with colour, italics or bold.

### 3.3 Space, shape, depth

- **Spacing:** a 4 px base on an 8 px rhythm. Page gutters are 16 px on phones
  and 24 px from 768 px up. Gaps between sections are 32 px on phones and
  48–64 px on desktop.
- **Corner radius:** the hierarchy tells you what you're looking at; it isn't
  one radius for everything.

  | Element | Radius |
  |---|---|
  | Inputs, checkboxes, status pills inside tables | 6 px |
  | Buttons | 10 px |
  | Cards, listing photos, sheets, modals | 14 px |
  | Search bar, filter chips, avatars | full (pill or circle) |

- **Depth: hairlines first.** Cards sit on `surface` with a 1 px `hairline`
  border and no shadow. There is **one** shadow tier, used only for things that
  float above the page (dropdowns, the sticky booking bar, bottom sheets,
  modals): `0 1px 2px rgba(2,34,75,.06), 0 8px 24px rgba(2,34,75,.12)`.
- **Icons:** Lucide at 20 px (16 px inline), 1.75 px stroke. An icon sits next
  to a word, never alone, except universal controls (close, back, search,
  menu), which then need an `aria-label`.
- **Photos:** listing photos use a 4:3 ratio, cropped with `object-cover`. A
  missing photo shows a calm neutral placeholder with the PG's initials, never a
  generic building icon repeated down the grid.

## 4. Layouts

### 4.1 Guest site: browse to request

The pattern comes from Airbnb: photo-first cards, one pill search bar, and the
filters out of the way.

```
Phone, 360 px                          Desktop, 1280 px
┌──────────────────────────┐          ┌──────────────────────────────────────────────┐
│ LivingPlus     Residents ☰│          │ LivingPlus   [ Locality ▾ | Search… ( ⌕ ) ]  Residents  For PG owners │
│ [ Search area or PG  ( ⌕ )]│          ├──────────────────────────────────────────────┤
│ (Women)(Men)(Co-living)(₹)→│  chips   │ (Women)(Men)(Co-living)(Under ₹8k)(Food)(AC)   Sort ▾ │
├──────────────────────────┤          │ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ │
│ 4 PGs in Chennai   Sort ▾ │          │ │ photo  │ │ photo  │ │ photo  │ │ photo  │ │
│ ┌──────────────────────┐ │          │ │ Women  │ │        │ │        │ │        │ │
│ │ photo 4:3   [Women]  │ │          │ └────────┘ └────────┘ └────────┘ └────────┘ │
│ └──────────────────────┘ │          │  Name       Name       Name       Name     │
│ Palm Grove Residence     │          │  Perungudi  …                              │
│ Perungudi · 2 beds left  │          │  ₹8,200/mo  …                              │
│ ₹8,200/mo  incl. food    │          └──────────────────────────────────────────────┘
│ Deposit ₹16,400          │
└──────────────────────────┘
```

- **Results come first.** On a phone, the first card is visible without
  scrolling (Jakob's Law: it works like every stay app they already use).
  Filters are a horizontal chip row, with "More filters" opening a bottom sheet.
  There's no stack of boxes above the results.
- **The listing card answers the three anxious questions:**
  - the price, as monthly rent plus what's included ("incl. food" or "food
    ₹2,500 extra");
  - who it's for (the policy badge on the photo);
  - availability ("2 beds left", shown only when it's 3 or fewer and true).
- **PG details are a single page:**
  - photos, then the facts (rent range, deposit, food, electricity rule, house
    rules), then rooms and beds, then location;
  - a sticky bottom bar shows "From ₹8,200/mo" next to the **Request a bed**
    amber button;
  - on desktop, this becomes a sticky right-hand card (Airbnb's reservation card).
- **Requesting a bed is a 3-step bottom sheet (or modal on desktop) with a step
  indicator:**
  1. *Choose bed*
  2. *Your details*
  3. *Verify phone*

  The steps follow the goal-gradient effect: progress you can see pulls people
  to the end.
  - The phone is verified inside step 3, never up front.
  - The summary (bed, move-in date, monthly cost, deposit) stays visible
    throughout.
  - The final button says **Send request**. The confirmation screen says
    "Request sent", shows the reference, says what happens next ("The owner
    usually replies within a day"), and offers one action: **See my requests**.
    That's the peak-end rule: end on clarity.
- **My requests:** each request is a card with a status pill, the PG and bed,
  the move-in date, and one action (Cancel request, or Call owner once approved).

### 4.2 Resident site: money first

The pattern comes from Wise: one clear number and friendly certainty.

```
┌──────────────────────────────┐
│ Palm Grove Women's Residence │  ← PG name: this is their place
│ Room 101 · Bed 1             │
├──────────────────────────────┤
│  ₹8,200 due by 5 Dec         │  display, tabular
│  Rent ₹7,500 · Food ₹700     │
│  [ Pay rent ]  amber         │  one primary action
├──────────────────────────────┤
│ Open requests (1)            │  Zeigarnik: unfinished things stay visible
│ ○ Bathroom tap leaking  In progress │
├──────────────────────────────┤
│ Quick actions                │
│ Report an issue · Food · Room change · Notice │
└──────────────────────────────┘
Bottom tab bar on phones: Home · Money · Requests · Profile
```

- **The home screen answers "what do I owe, by when, and is anything pending
  for me?"** When nothing is due, show "You're all paid up" in positive green.
  That's a good moment worth designing.
- **Paying:** show the UPI ID and amount with Copy buttons, then a "I've paid —
  add the reference" form. The claim then shows **Waiting for owner to confirm**
  (attention colour) until it's verified. Never leave a payment in an unclear
  state.
- **On phones, sections are a bottom tab bar** (4 items, within thumb reach),
  not a hidden sidebar.

### 4.3 Owner workspace: needs you today

The pattern comes from Linear's calm density, kept in light mode because
owners work in daylight on phones.

```
┌───────────────┬──────────────────────────────────────────────┐
│ LivingPlus    │ Today                       Palm Grove ▾      │
│ Today         │ ┌────────────┐┌────────────┐┌────────────┐    │
│ Bookings   2  │ │ 2 requests ││ ₹24,600    ││ 1 urgent   │    │
│ Residents     │ │ to review  ││ overdue ·3 ││ issue      │    │
│ Money         │ └────────────┘└────────────┘└────────────┘    │
│ Maintenance 1 │ Needs you                                     │
│ Utilities     │ ● Priya S. wants Room 401 Bed 1   [Review]    │
│ Reports       │ ● Rent overdue: Meera I. ₹8,200   [Remind]    │
│ Settings      │ ● Tap leaking, Room 101           [Assign]    │
└───────────────┴──────────────────────────────────────────────┘
```

- **The landing view is *Today*:** a short "Needs you" list sorted by urgency
  (the Pareto principle: the 20% of items that need action come first), and at
  most 3 summary tiles. Everything else is one click away.
- **Navigation is at most 7 items** (Hick's Law), grouped into *Daily* (Today,
  Bookings, Maintenance) and *Money* and *Setup*. Counts appear as small navy
  badges. On phones, it becomes a bottom bar (Today · Bookings · Money · More).
- **Tables:**
  - row height 48 px, hairline separators, tabular figures, amounts right-aligned;
  - a status pill in its own column;
  - the row's main action at the end of the row;
  - on phones, each row becomes a stacked card.

## 5. Components

| Component | Spec |
|---|---|
| **Primary button** | Amber 500 fill, navy-900 text, Mukta 600 16 px, 10 px radius, 44–48 px tall, full width in sheets on phones. **At most one per view.** |
| **Secondary button** | White fill, 1 px `field-border`, navy-900 text. For Cancel, Back, and secondary actions. |
| **Text button** | navy-700, underlined on hover. For tertiary links. No "→" glyph on links. |
| **Destructive** | White fill with negative text, or a negative fill only in the confirm step of an irreversible action. Always asks to confirm with a specific verb ("Cancel request" / "Keep request"). |
| **Input** | 48 px tall, 16 px text, 6 px radius, 1 px `field-border`, a label above it (never placeholder-only), helper or error text below. Errors in negative colour with an icon, saying how to fix it. |
| **Search bar** | Pill shape, white, with a locality select and a free-text field. The search button is a 40 px amber circle with a navy icon. |
| **Filter chip** | Pill, 36 px tall, white with a hairline border. Selected: `amber-50` fill with a navy-900 border and text. Show 6 chips at most, then "More filters". |
| **Listing card** | 4:3 photo (14 px radius) with a policy badge top-left (white pill, caption) and an availability line. Below it: name (title-3), locality, price line (`₹8,200/mo` in Mukta 600, tabular, plus a muted "incl. food"). The whole card is one link, with no separate "Request a bed" button on the grid. |
| **Status pill** | Caption, 6 px radius inside tables, full pill elsewhere, with a status colour pair, a word and an optional 14 px icon. |
| **Money summary** | Anek 700 display figure, a muted breakdown line below, the due date in words ("due by 5 Dec"), and one primary action. |
| **Step indicator** | "Step 2 of 3 · Your details" text plus 3 short bars. Steps really are a sequence here, so numbering is justified. |
| **Bottom sheet** (phone) | 14 px top radius, drag handle, the floating shadow tier, focus moved inside, closes with Esc, back or a swipe. |
| **Toast** | Bottom-centre on phones, top-right on desktop, 4 s, uses the same verb as the action ("Request sent", "Rent marked paid"). Errors stay until dismissed. |
| **Empty state** | One sentence on what this area is for, plus one action. "No requests yet. Requests you send from a listing appear here. [Browse PGs]". No large grey illustration. |
| **Skeletons** | Shown for any load over 300 ms, shaped like the content (card or row). Spinners only inside buttons. |

## 6. Motion

- **Motion answers an action:** a sheet slides up, an accordion expands, a pill
  changes after you confirm. 150–200 ms, `cubic-bezier(.2,.8,.2,1)`.
- **One orchestrated moment at most:** the "Request sent" or "Paid" confirmation
  may animate once.
- **No entrance animations on cards or sections, and no hover lift on every
  card.**
- **Respect `prefers-reduced-motion`:** turn transitions into instant changes.

## 7. Writing

Words exist to make LivingPlus easier to use (from Anthropic's skill). The
voice is plain, warm and specific: the way a helpful warden would say it.

- **Sentence case, active voice, no filler.** Name things the way users do:
  "Rent", "Food", "Deposit", "Room change", not "Ledger entry" or "Tenant
  record".
- **A button says exactly what happens, and the result repeats the verb:**

  | Button | Confirmation |
  |---|---|
  | Request a bed | Request sent |
  | Pay rent | Payment added — waiting for owner to confirm |
  | Approve | Booking approved |
  | Cancel request | Request cancelled |
  | Send reminder | Reminder sent |

- **Errors explain what happened and how to fix it, and don't apologise:**
  "That code has expired. Send a new code." not "Oops! Something went wrong."
- **Empty screens invite action.**
- **Formats:**

  | Value | Format |
  |---|---|
  | Money | `₹8,200`, `₹1,25,000` |
  | Rent | `₹8,200/mo` |
  | Dates | `15 Dec 2026` (and `5 Dec` within the current year) |
  | Phone numbers | `+91 98765 43210` |
  | Rooms | `Room 101, Bed 1` |

- **Don't join metadata with middle dots** ("A · B · C") as decoration. Use
  them only where they truly separate parallel facts in one line, such as a card
  meta line, and at most twice.

## 8. Psychology, mapped to decisions

| Principle | What it says | Where we apply it |
|---|---|---|
| Jakob's Law | People expect your app to work like the ones they know | Guest browsing works like stay apps: photo cards, pill search, filter chips, a sticky reserve bar |
| Hick's Law / choice overload | More options mean slower, worse decisions | 6 filter chips plus "More filters"; owner nav of 7 items or fewer; one primary action per view |
| Cognitive load / Miller | Working memory is small | Booking is split into 3 steps; the summary stays visible so nothing has to be remembered |
| Fitts's Law | Big, near targets are faster | 44 px+ targets; the primary action is in the bottom thumb zone on phones (sticky bar, sheet button) |
| Goal-gradient | Visible progress speeds completion | The step indicator in Request a bed; the profile completion meter (KYC) for residents |
| Zeigarnik | Unfinished tasks stay in mind | Open maintenance requests and pending claims pinned on resident home; owner "Needs you" list |
| Peak-end rule | Experiences are judged by their peak and their end | Clear, calm confirmations: "Request sent" with next steps; "You're all paid up" |
| Von Restorff | The different thing gets noticed | Amber is reserved for the one primary action, so it always stands out |
| Similarity / common region | Things that look alike are read as related | One status colour plus one word per state, everywhere; related fields grouped in a single card |
| Doherty threshold | Responses under 400 ms feel instant | Skeletons, optimistic updates for chips and toggles, button loading states |
| Aesthetic-usability | Polished interfaces feel easier and earn trust | Consistent tokens, real photos, no broken placeholders: trust matters most for safety-conscious guests |
| Loss aversion, used honestly | Fear of missing out is strong | "2 beds left" only when it's true and 3 or fewer. Never countdowns, fake viewers or pressure copy |

## 9. Ethics: no dark patterns

- **No fake scarcity or urgency.** No timers, no "5 people viewing", no stock
  invented to pressure people.
- **No hidden costs.** Deposit, food and the electricity rule appear before a
  request is sent.
- **No confirmshaming** ("No thanks, I like paying more") and no pre-ticked
  add-ons.
- **Trust badges must be true and explained.** "Verified" is shown only when
  the PG was actually verified, and tapping it says what was checked. Remove
  any blanket claim the product can't back up, such as "100% Verified
  Properties" or "Deposit protection".
- **Cancelling a request is as easy as sending one.**

## 10. Quality floor (non-negotiable)

- **Contrast:** WCAG 2.2 AA. Text 4.5:1, large text and UI parts 3:1. The tokens
  above already meet this, so don't invent new greys.
- **Phone width:** works at 360 px with no horizontal scroll, and with text
  zoomed to 200%.
- **Keyboard:** everything is reachable, there's a visible navy focus ring,
  dialogs trap focus and close with Esc, and a skip link starts every site.
- **Labels:** real `<label>` on every field, `aria-label` on icon-only buttons,
  and status changes announced through `aria-live` on toasts.
- **Touch targets:** 44 × 44 px minimum. Inputs use 16 px text.
- **Motion:** `prefers-reduced-motion` is respected.
- **Performance:**
  - fonts preloaded, with `font-display: swap`;
  - listing photos lazy-loaded with fixed aspect ratios (no layout shift);
  - the guest site's first screen stays light on 4G.

## 11. Generic tells to avoid

Anthropic's skill lists these as the most common signs of a templated, generated
UI. Several are in the current build.

- ALL-CAPS tracked labels above every section ("RESIDENT POLICY", "MONTHLY BUDGET").
- Content chopped into identical rounded cards with the same shadow, and one
  radius used for everything.
- Gradient washes as decoration (gradient top bars).
- A "trust strip" of claims joined with middle dots.
- `→` appended to link text, and emoji used as icons (🛡️).
- Fade-and-slide entrances and hover lifts on every card.
- Highlighting one word of a heading in a different colour.

## 12. Audit of the current UI (19 Nov 2026)

These findings come from screenshots of the build as it stood mid-restyle by
another session. Re-check them once that work lands.

| # | Finding | Fix | Priority |
|---|---|---|---|
| 1 | On phones, the search box, nav, trust strip, filters box and result count all come before the first listing | Chip row under the search bar; filters in a bottom sheet; result count inline with Sort | High |
| 2 | Trust strip claims "100% Verified Properties", "Documented Move-Out & Deposit Protection" | Remove unless the product genuinely does this; replace with per-PG, explained badges | High |
| 3 | The top nav wraps into two lines on phones ("Search PGs / My requests / Residents / For PG owners") | Guest bottom bar or a menu button; keep only Search and My requests visible | High |
| 4 | Listing cards don't show deposit or food inclusion; the grid has its own "Request a bed" buttons | Card shows the price line and an inclusions line; the whole card links to the PG details page with the sticky request bar | High |
| 5 | ALL-CAPS filter group labels, a gradient header, the same `rounded-2xl` card everywhere | Sentence-case labels, solid navy bar, radius hierarchy (§3.3) | Medium |
| 6 | Booking is one long modal; verification is a block at the bottom | 3-step sheet with a visible summary (§4.1) | Medium |
| 7 | The resident home leads with a stays list; money is on another tab | Money summary first, open requests second (§4.2) | Medium |
| 8 | The owner landing shows many equal tiles | *Today* view with a "Needs you" list (§4.3) | Medium |
| 9 | A building icon is repeated as every missing photo | Initials placeholder; nudge owners to add photos | Low |
| 10 | The system font stack | Anek Latin + Mukta (§3.2) | Low |

## 13. Implementation notes

- **Tokens live in `Project/frontend/src/index.css`** inside the Tailwind v4
  `@theme` block. Use these names; don't write hex values inline in components.

  ```css
  @theme {
    --color-navy-900: #02224B;  --color-navy-700: #0A3B75;
    --color-ink: #24364F;       --color-muted: #5A6B82;
    --color-field-border: #7A8AA0; --color-hairline: #E2E7EE;
    --color-canvas: #FFFFFF;    --color-surface: #F5F7FA;
    --color-amber-500: #FEB109; --color-amber-600: #E39E00; --color-amber-50: #FFF6DD;
    --color-positive: #17734A;  --color-positive-bg: #E7F5EE;
    --color-attention: #B5470B; --color-attention-bg: #FDEEE4;
    --color-negative: #B42318;  --color-negative-bg: #FDECEA;
    --color-info: #0A3B75;      --color-info-bg: #EAF1FA;
    --font-display: "Anek Latin Variable", "Anek Latin", system-ui, sans-serif;
    --font-sans: "Mukta", system-ui, sans-serif;
    --radius-field: 6px; --radius-button: 10px; --radius-card: 14px;
    --shadow-float: 0 1px 2px rgb(2 34 75 / .06), 0 8px 24px rgb(2 34 75 / .12);
  }
  ```

- **Fonts:** self-host through pinned `@fontsource` packages, so the app works
  without third-party requests and stays fast on 4G. Load only the weights
  listed in §3.2.
- **Shared primitives:** put `Button`, `StatusPill`, `MoneyFigure`, `Sheet` and
  `EmptyState` in `src/components/ui/` so the rules live in one place.
- **Order of work:**
  1. tokens and fonts;
  2. the shared primitives;
  3. the guest listing and request flow;
  4. resident home;
  5. owner *Today*.

  Then screenshot each at 360 px and 1280 px and check it against §10–§12.
- **Review checklist for every UI change:**
  - one amber action per view;
  - statuses use the shared pill;
  - money is tabular in the `en-IN` format;
  - sentence case;
  - 44 px targets;
  - focus visible;
  - works at 360 px;
  - no item from §11.
