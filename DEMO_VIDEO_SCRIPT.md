# Living Plus: 5-minute demo video script

The script follows the judging criteria in order: SPARK (significance, potential, AI relevance, realistic, key feature), use of Google tech, and look and feel. VibeCheck is the key feature and gets the most time.

**Total: about 5 minutes, about 650 spoken words.** Read at a relaxed pace. The timings include screen actions.

---

## Before you record

- [ ] Deploy the latest build, so the kitchen forecast and PG pulse are live.
- [ ] Open three browser tabs on the live site (`livingplus-pfpdmrspea-el.a.run.app`):
  1. **Guest:** `/` (phone-size window, or Chrome dev tools at 390 px wide)
  2. **Owner:** `/owner/login`, signed in as the demo owner (`9555500001`)
  3. **Resident:** `/stay/palm-grove-womens-residence`, signed in as Ananya (`9000000001`; the code shows on screen)
- [ ] Test the microphone once: allow it in the browser and do one short VibeCheck call to warm up the server.
- [ ] Do the owner assistant steps once beforehand so replies come back quickly.
- [ ] Record at 1080p, with the cursor visible and notifications off.
- [ ] Keep the pitch deck open for the opening and closing slides.

---

## 0:00–0:25 · Hook (significance)

**Screen:** Pitch deck, slide 1, then slide 2.

**Say:**
> Every year, lakhs of students and young professionals move to cities like Chennai and into a PG. They pick one from WhatsApp forwards, pay a deposit, and get a bed next to whoever is in the room. If the roommate sleeps at 4 am and plays music, they leave early and lose money. And the PG itself runs on notebooks.
>
> This is Living Plus: one platform for the guest, the resident and the owner, with Gemini doing the routine work.

---

## 0:25–0:55 · Finding a PG (look and feel)

**Screen:** Guest tab. Scroll the listings slowly. Pick **Near my campus or office → Tidel Park**.

**Say:**
> A guest browses with no sign-up. Every listing shows the real monthly cost: rent, food and deposit. Beds are live from the owner's own register.
>
> I'm starting a job at Tidel Park, so I pick it here. Every PG now shows how far it is, nearest first: Palm Grove is about 2.7 kilometres away.

---

## 0:55–2:15 · The key feature: VibeCheck

**Screen:** Open **Palm Grove** → **Request a bed** → **Take VibeCheck** → tap the mic. Speak naturally. Let the buddy's voice play.

**Say (to the viewer, before tapping):**
> Here's our key feature, VibeCheck. Instead of a form, you just talk to a PG buddy.

**Talk to VibeCheck (suggested lines; answer whatever it asks):**
1. "Hi! I'm working, I just joined a company in Tidel Park."
2. "I'm usually done by seven, then gym, and I sleep by eleven. I'm up at six."
3. "I keep my side pretty tidy. Not a fan of loud music at night."
4. *(optional, to show language switching)* A line in Tamil or Tanglish, for example "Weekends naan veetuku poiduven."

**Say (while the chips appear):**
> It's a live voice conversation on the Gemini Live API. It understands Tamil, Hindi and English, and it works out my habits from normal conversation. You can see them appear: early sleeper, early riser, tidy, quiet.
>
> It only talks about what exists at this PG. Palm Grove has no shared kitchen and no AC, so it never asks about cooking or room temperature. And it records habits only. Never caste, religion, diet or gender, and never other residents' names.

**Screen:** Tap **See my matches**. The beds are sorted with reasons.

**Say:**
> Now every free bed has a match score with plain reasons, like "you both sleep before 11". Gemini judges each room, but it can only move a rule-based score by fifteen points either way, so it can't invent a fit. And if it doesn't work out after moving in, there's a thirty-day rematch window.

**Screen:** Pick the best bed → move-in date → **Next** → enter a phone number → the code shows on screen → **Send request**.

**Say:**
> One phone code and the request is sent. The bed is held while the owner reviews it.

---

## 2:15–3:30 · The owner (AI relevance and potential)

**Screen:** Owner tab → **Today**.

**Say:**
> On the owner's side, Today shows only what needs attention: the new bed request, overdue rent, an open repair.

**Screen:** Open **Ask the assistant** and type: *"Who owes rent right now?"*

**Say:**
> The assistant is built with Google's Agent Development Kit. It has about thirty tools, each limited to this owner's PGs.

**Screen:** Type: *"Post a notice to Palm Grove residents: water is off this Sunday from 10 to 1 for tank cleaning."* Show the draft, reply "post it", and show the confirmation card. Click **Confirm**.

**Say:**
> It drafts the notice, and nothing is posted until I confirm. Every booking, money action or notice waits for a person's yes, and it's logged.

**Screen:** **Meals & cleaning** → Kitchen forecast for **Harbour Point**, tomorrow.

**Say:**
> This one saves real money. The kitchen forecast uses who is on the food plan, who opted out, booked orders, and residents' routines from VibeCheck. Tomorrow is Saturday: late risers skip breakfast, so the cook makes three plates, not five. That's food saved every day, and around nine thousand rupees a month for this PG.

**Screen:** **PG pulse**. Show the brief, then click the **Done by the assistant** filter.

**Say:**
> PG pulse gives the owner a weekly brief written by Gemini, with one next step and a button to do it. And here is everything the assistant did, with who confirmed it.

---

## 3:30–3:55 · The resident

**Screen:** Resident tab. Show **You owe ₹9,800**, then **Notifications** with the water notice, then **Report an issue**.

**Say:**
> The resident sees exactly what they owe and why, gets the notice we just posted, and can report a problem with a photo or a voice note. Residents use Living Plus for free.

---

## 3:55–4:30 · Built on Google, and it's real (use of tech, realistic)

**Screen:** Deck, slide 9 (Google tech), then slide 11 (realistic).

**Say:**
> Everything runs on Google Cloud. Gemini on Vertex AI powers the assistant, KYC checks, VibeCheck matching, the kitchen forecast and the weekly brief, and the voice runs on the Gemini Live API. The app runs on Cloud Run, with Cloud SQL, where row-level security keeps each owner's data apart, plus Cloud Storage with signed links, Firebase sign-in, Secret Manager and Cloud Scheduler. One script deploys the whole thing.
>
> It's tested, too: 249 backend tests, including the AI agent's role limits, and seven end-to-end browser journeys. When the AI is busy, every feature falls back to a working path.

---

## 4:30–5:00 · Business and close (potential, key feature)

**Screen:** Deck, slide 12, then slide 15.

**Say:**
> Residents use it free. Owners pay a small fee per bed, plus add-ons like VibeCheck and AI ID checks, a commission on bookings, and a share of meals and cleaning booked through the app. For an owner, one empty bed for a month costs more than the subscription.
>
> We start with owner clusters near Chennai's campuses and IT corridors, and next we're building Deposit Shield, where Gemini compares move-in and move-out photos to settle deposits fairly.
>
> VibeCheck gets you in with the right people. Living Plus runs the rest.

---

## If something goes wrong while recording

| Problem | What to do |
|---|---|
| Live voice doesn't start | VibeCheck switches to tap-to-talk on its own. Keep going, or tap **Type instead**. |
| The assistant is slow | Wait a moment, or cut and restart that shot. Never claim it did something it didn't. |
| The kitchen forecast says "not available" | Check that the latest deploy is live and that you picked **Harbour Point**. |
| The phone code doesn't appear | Use the number again after a few seconds; demo codes show on screen as a toast. |
