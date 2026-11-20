# Standout ideas: what else could be our "K"

Written 20 Nov 2026, during the regional round of the Google Startup Buildathon.
The panel judges with **SPARK**:
- **S**ignificance: is the problem worth solving?
- **P**otential: will people pay?
- **A**I relevance: is AI genuinely needed?
- **R**ealistic: does it fit real-world constraints?
- **K**ey thing: the one feature to put forward loud and clear.

**Our K is VibeCheck.** The ideas below are candidates to *support* it, not replace it. One K, communicated clearly, beats several half-built ones.

Status labels: **Built** = in the product today; **Partly built** = foundations exist; **Idea** = not started.

---

## Current K: VibeCheck (built)

Roommate fit is the hidden cause of early move-outs. VibeCheck works like this:
- **Your words in.** It reads how a person describes their day, in English, Tamil or Hindi, and maps it to 8 habits.
- **Match per bed.** It scores every free bed with clear reasons.
- **Habits only.** Never caste, religion, diet or gender, and never other residents' names.
- **AI on a short leash.** The AI may shift a rule-based score by at most ±15 points.
- **Safety net.** A 30-day rematch window lets residents ask for a room change if the fit is wrong.

---

## 1. Deposit Shield: AI-settled move-out (recommended second beat)

**Status:** Partly built (condition records, photo storage, deposit ledger, human approval).

**What it is:**
1. At move-in, the resident photographs the room.
2. At move-out, they photograph it again.
3. Gemini compares the two sets and lists what changed ("wardrobe hinge broken, wall stain near the bed; everything else matches").
4. It proposes a fair deduction from the deposit.
5. Owner and resident each approve or dispute it in the app.

| SPARK | Why it scores |
|---|---|
| Significance | Losing all or part of the deposit is the most common complaint in PG life in India. It causes disputes, bad reviews and WhatsApp fights. |
| Potential | Owners get faster, dispute-free exits. Residents trust deposits again, so a PG can advertise "Deposit Shield protected". |
| AI relevance | Comparing before and after photos is a real vision-AI job; a form can't do it. |
| Realistic | About half is built. Gemini proposes, people decide, and nothing is deducted without both sides seeing the evidence. |

**The story it completes:** *VibeCheck makes the stay start right; Deposit Shield makes it end fair.* This covers the whole stay, from move-in to move-out, which no competitor does for independent owners.

**Build estimate:** 1–2 hours once AI credits are available.
- A structured Gemini call over paired photos.
- A "proposed deduction" card on the owner and resident screens.
- Approve or dispute, written to the deposit ledger.
- Tests with a scripted model.

---

## 2. Stay Passport: a portable resident record

**Status:** Idea.

**What it is:** a verified record that a resident carries to their next PG:
- KYC done;
- rent paid on time;
- a good-resident reference from the owner.

With it, the next PG can ask for a lower deposit, or none.

| SPARK | Notes |
|---|---|
| Significance | Newcomers pay big deposits because owners can't trust strangers. |
| Potential | **The strongest business moat.** It ties residents to the network, gives owners a reason to join, and opens rent financing and deposit-free stays with partners later. |
| AI relevance | Low. It's mostly data, not AI. |
| Realistic | Needs many PGs on the platform before it means much. |

**Use:** a line on the business slide ("where this goes"), not a K.

---

## 3. Owner voice copilot in Tamil (Gemini Live)

**Status:** Partly built. The assistant's tools exist (notices, staff assignment, reminders); real-time voice does not.

**What it is:** the owner just talks, in Tamil or English: *"Room 102 leak, send Ravi, and tell everyone water's off Sunday."* The assistant does all three, each confirmed.

| SPARK | Notes |
|---|---|
| Significance | Many PG owners aren't comfortable typing in English and run the PG between rounds. |
| Potential | Lowers the barrier for owners to adopt the product. |
| AI relevance | Strong. Also promised in the buildathon answers (Q11 lists Gemini Live). |
| Realistic | Risky to build and test before judging. Needs the Live API and a working key. |

---

## 4. Kitchen head-count to cut food waste

**Status:** Partly built (meal opt-outs and meal orders exist).

**What it is:** Gemini predicts the day's head-count from opt-outs, orders and past patterns, and tells the cook how much to make.

- **Strengths:** realistic, with a sustainability angle.
- **Weakness:** a smaller "wow". A supporting point, not a K.

---

## 5. Fair price check

**Status:** Idea.

**What it is:** the AI compares a PG's all-in monthly cost with similar PGs nearby and labels it "fair for Perungudi" or "above the local range".

- **Strengths:** supports the honest-pricing story, and parents would value it.
- **Weakness:** needs real market data to be credible. With a handful of demo PGs it won't convince judges.

---

## 6. Parent view link

**Status:** Idea.

**What it is:** a read-only page parents can open: verified PG, real costs, rent receipts, safety basics.

- **Strengths:** good for trust and conversion, since parents often pay and co-decide.
- **Weakness:** low AI relevance. Mention it as part of the trust story.

---

## Recommendation

1. **K stays VibeCheck.** It's built, it's unusual, and it's genuinely an AI problem.
2. **Add Deposit Shield as the second beat:** *"VibeCheck makes the stay start right; Deposit Shield makes it end fair."* Build it first once AI credits arrive.
3. **Mention Stay Passport** on the business slide as the long-term moat.
4. **Keep Gemini Live voice** as the next build after Deposit Shield. It's promised in the answers and strong on AI relevance.
5. **Don't headline** fair price, kitchen forecasting or the parent view. They'd dilute the K. Use them as supporting points.
