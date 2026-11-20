import copy
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

from PIL import Image
from pptx import Presentation
from pptx.util import Inches, Pt
from lib import *

prs = Presentation(os.path.join(BASE_DIR, "template.pptx"))
S = {i + 1: s for i, s in enumerate(prs.slides)}


def title_shape(s):
    for sh in s.shapes:
        if sh.has_text_frame and sh.text_frame.text.strip():
            return sh


def set_title(s, txt):
    sh = title_shape(s)
    p = sh.text_frame.paragraphs[0]
    p.runs[0].text = txt
    for r in p.runs[1:]:
        r._r.getparent().remove(r._r)


def add_title(s, src, txt):
    el = copy.deepcopy(title_shape(src)._element)
    s.shapes._spTree.append(el)
    set_title(s, txt)


def caption(s, txt, y=5.22):
    text(s, 0.4, y, 9.2, 0.28, txt, size=8, color=GREY)


def prepare_shot(src_path, dst_path, tw=1200, th=958):
    """Fits or top-crops a screenshot into a target aspect-ratio canvas so PowerPoint never stretches it."""
    img = Image.open(src_path).convert("RGB")
    w, h = img.size
    canvas = Image.new("RGB", (tw, th), (248, 249, 250))
    target_ratio = tw / th
    if w >= h:
        crop_w = min(w, int(h * max(target_ratio, 1.25)))
        left = max(0, min(w - crop_w, 220))
        cropped = img.crop((left, 0, left + crop_w, h))
    else:
        crop_h = min(h, int(w / target_ratio * 1.05))
        cropped = img.crop((0, 0, w, crop_h))
    cw, ch = cropped.size
    scale = min(tw / cw, th / ch)
    nw, nh = int(cw * scale), int(ch * scale)
    resized = cropped.resize((nw, nh), Image.Resampling.LANCZOS)
    ox = (tw - nw) // 2
    oy = (th - nh) // 2
    canvas.paste(resized, (ox, oy))
    canvas.save(dst_path, "PNG", optimize=True)
    return dst_path


# ---------------- Slide 2: cover ----------------
s = S[2]
tb = [sh for sh in s.shapes if sh.has_text_frame][0]
tb._element.getparent().remove(tb._element)
L = {"bold": True}
text(s, 0.6, 3.26, 2.75, 0.64, [
    [("Team Name: ", L), ("Nellai Habitants", {})],
    [("Team Size: ", L), ("4", {})],
], size=11, spacing=6)
box(s, 3.45, 3.22, 6.05, 0.66, fill=TBLUE, line=BLUE, radius=0.06)
text(s, 3.55, 3.25, 5.85, 0.60, [
    [("Mentor Test Credentials  ", {"bold": True, "color": BLUE}), ("Live: https://livingplus-pfpdmrspea-el.a.run.app  (Guest: /)", {"bold": True, "color": DARK})],
    [("Owner: ", {"bold": True, "color": GRN}), ("/owner/login  ->  9555500001, password rDpNDsOYlD2dLqMlsRlQ", {})],
    [("Resident: ", {"bold": True, "color": BLUE}), ("/stay/palm-grove-womens-residence  ->  9000000001, code 123456", {})],
], size=7.8, spacing=1)
text(s, 0.6, 3.98, 8.9, 1.48, [
    [("Product: ", L), ("LivingPlus: an end-to-end AI-powered living platform for people moving to a new city and the PG owners who host them", {})],
    [("Problem Statement: ", L), ("Moving to a new city for study or work is slow and untrustworthy. Listings are scattered and outdated, "
      "KYC is paper-based with opaque advances, roommates are allotted with no regard for daily habits, and day-to-day living runs on notebooks "
      "that cause meal waste and deposit disputes. Most beds sit with independent owners who have no unified digital system.", {})],
], size=10.8, spacing=6)

# ---------------- Slide 3: brief ----------------
s = S[3]
text(s, 0.4, 1.3, 9.2, 0.55, [[
    ("LivingPlus digitizes the whole urban stay, from finding a compatible bed to getting the deposit settled fairly, ", {"bold": True}),
    ("across three live web portals for guests, residents and independent PG owners.", {})]],
    size=11.5)
pillars = [
    ("search", BLUE, TBLUE, "1  Discover & move in", [
        "Semantic search (pgvector) near campuses & offices",
        "VibeCheck: Gemini Live voice buddy & bed matching",
        "AI KYC check (last-4 only) and OTP booking",
        "Timestamped move-in condition photos"]),
    ("home", GRN, TGRN, "2  Live, day to day", [
        "Dedicated per-PG resident portal (/stay/<slug>)",
        "Daily meal opt-outs, food & cleaning orders",
        "Itemized rent & utility bills with instant receipts",
        "Deposit Shield paired move-out photo ledger"]),
    ("owner", YEL, TYEL, "3  Run the property", [
        "Modular console: switch on only what you need",
        "Scoped access for wardens, cooks, maintenance",
        "Google ADK copilot and hands-free voice briefings",
        "Kitchen Head-Count Forecast to cut food waste"]),
]
for i, (ic, c, t, h, items) in enumerate(pillars):
    x = 0.4 + i * 3.1
    box(s, x, 1.98, 2.95, 2.5, fill=t)
    icon(s, ic, x + 0.18, 2.12, 0.42, bg=c)
    text(s, x + 0.7, 2.14, 2.2, 0.38, h, size=12, bold=True, anchor="m")
    text(s, x + 0.16, 2.66, 2.7, 1.75, [[("__bullet__", {}), (it, {"bc": c})] for it in items], size=10, spacing=5)
b = box(s, 0.4, 4.62, 9.2, 0.58, fill=DARK)
icon(s, "ai", 0.55, 4.72, 0.38, bg=BLUE)
text(s, 1.05, 4.62, 8.4, 0.58, [[("Gemini and Google ADK form the intelligence layer across 3 live web portals. ", {"bold": True, "color": WHITE}),
     ("Launching with an owner cluster on Chennai's OMR IT corridor, with WhatsApp alerts next.", {"color": "E8EAED"})]], size=11, anchor="m")

# ---------------- Slide 4: opportunities ----------------
s = S[4]
sh = title_shape(s)
for p in list(sh.text_frame.paragraphs)[1:]:
    p._p.getparent().remove(p._p)
br = sh.text_frame.paragraphs[0]._p.find(qn("a:br"))
if br is not None:
    br.getparent().remove(br)
sh.height = Inches(0.61)
text(s, 0.4, 1.3, 9.2, 0.3, "How is it different from existing ideas?", size=11, bold=True, color=BLUE)
comp = [("PG management tools", "StayPe, Homly, PG Saathi", "Track rent & beds; no discovery, roommate match or AI ops"),
        ("Co-living brands", "Stanza, Zolo, Colive", "Great experience, but locked inside their own leased buildings"),
        ("Listing portals", "NoBroker and peers", "Handle discovery and leads, then disappear after move-in")]
for i, (h, ex, d) in enumerate(comp):
    x = 0.4 + i * 2.2
    box(s, x, 1.62, 2.08, 1.32, fill=SURF, line=LINE)
    text(s, x + 0.1, 1.68, 1.9, 1.2, [[(h, {"bold": True})], [(ex, {"color": GREY, "size": 8.5})], [(d, {})]], size=9.5, spacing=4)
box(s, 7.0, 1.62, 2.6, 1.32, fill=BLUE)
text(s, 7.1, 1.68, 2.42, 1.2, [[("LivingPlus", {"bold": True, "color": WHITE, "size": 12})],
     [("The complete lifecycle (semantic discovery, VibeCheck, KYC, kitchen AI, tickets and Deposit Shield) built for independent owners.", {"color": WHITE})]],
     size=9.5, spacing=4)
# two cards
box(s, 0.4, 3.1, 4.52, 2.1, fill=TGRN)
icon(s, "check", 0.55, 3.2, 0.34, bg=GRN)
text(s, 0.98, 3.2, 3.8, 0.34, "How it solves the problem", size=11.5, bold=True, anchor="m")
text(s, 0.55, 3.62, 4.25, 1.55, [
    [("__bullet__", {}), ("Trust: ", {"bold": True}), ("AI KYC checks and Deposit Shield move-in/move-out photo diffs end deposit fights", {"bc": GRN})],
    [("__bullet__", {}), ("Fit: ", {"bold": True}), ("explainable VibeCheck bed matches plus a 30-day rematch window cut early exits", {"bc": GRN})],
    [("__bullet__", {}), ("Efficiency: ", {"bold": True}), ("Kitchen Head-Count Forecast cuts daily food waste while one ledger replaces notebooks", {"bc": GRN})],
], size=9.5, spacing=5)
box(s, 5.08, 3.1, 4.52, 2.1, fill=TYEL)
icon(s, "star", 5.23, 3.2, 0.34, bg=YEL)
text(s, 5.66, 3.2, 3.8, 0.34, "USP of the solution", size=11.5, bold=True, anchor="m")
text(s, 5.23, 3.62, 4.25, 1.55, [
    [("__bullet__", {}), ("Habit-first bed matching: pairs roommates on sleep, tidiness, study hours and daily routines", {"bc": YEL})],
    [("__bullet__", {}), ("Deposit Shield & Kitchen AI: normal wear is always ₹0, and meal forecasts save plates daily", {"bc": YEL})],
    [("__bullet__", {}), ("Three role-scoped web portals (/, /stay/<slug>, /owner) with zero app install needed", {"bc": YEL})],
    [("__bullet__", {}), ("PostgreSQL Row-Level Security per owner plus mandatory human approval on money actions", {"bc": YEL})],
], size=9.5, spacing=4)

# ---------------- Slide 5: features ----------------
s = S[5]
text(s, 5.8, 0.86, 3.8, 0.3, [[("Resident (Blue)   ", {"color": BLUE, "bold": True}), ("Owner (Green)   ", {"color": GRN, "bold": True}),
                              ("AI (Red badge)", {"color": RED, "bold": True})]], size=8.5, color=GREY, align="r")
feats = [
    ("search", BLUE, "Semantic discovery", "pgvector search and distance to OMR campuses & offices", True),
    ("match", BLUE, "VibeCheck Live & quiz", "Tamil/Hindi/English voice buddy, explainable bed scores", True),
    ("kyc", BLUE, "AI KYC & OTP booking", "Gemini Vision ID check (last-4 only) & verified requests", True),
    ("food", BLUE, "Meals & services", "Daily meal opt-outs, add-on orders and housekeeping", False),
    ("bolt", BLUE, "Transparent money", "Itemized rent, electricity & deposit ledger with receipts", False),
    ("cam", BLUE, "Photo issue tracker", "Maintenance requests with photo evidence tracked to closure", True),
    ("move", BLUE, "Deposit Shield", "Paired move-in vs move-out photo diff; normal wear is ₹0", True),
    ("shield", BLUE, "30-day rematch window", "Self-serve room or bed change requests within first 30 days", False),
    ("toggle", GRN, "Modular owner console", "15 focused views; switch services on or off per property", False),
    ("staff", GRN, "Staff roles & RLS", "Scoped logins for warden, cook, maintenance & accountant", False),
    ("ai", GRN, "Google ADK copilot", "Live tools for dues, bookings & notices with human confirm", True),
    ("mic", GRN, "PG Pulse & Kitchen AI", "Hands-free Gemini Live voice brief & daily meal plate forecast", True),
]
for i, (ic, c, h, d, ai) in enumerate(feats):
    r, k = divmod(i, 4)
    x, y = 0.4 + k * 2.33, 1.4 + r * 1.3
    box(s, x, y, 2.2, 1.18, fill=TBLUE if c == BLUE else TGRN)
    icon(s, ic, x + 0.12, y + 0.12, 0.36, bg=c)
    if ai:
        b = box(s, x + 1.72, y + 0.12, 0.36, 0.22, fill=TRED, radius=0.1)
        boxtext(b, "AI", size=7, bold=True, color=RED)
    text(s, x + 0.12, y + 0.52, 2.0, 0.62, [[(h, {"bold": True, "size": 10})], [(d, {"color": GREY})]], size=8.5, spacing=2)

# ---------------- Slide 6: process flow ----------------
s = S[6]
stages = ["Discover", "Match", "KYC & book", "Move in", "Live", "Move out"]
x0, cw = 1.42, 1.365
for i, st in enumerate(stages):
    b = box(s, x0 + i * cw, 1.33, cw, 0.42, fill=BLUE if i % 2 == 0 else "4285F4", shape="pent" if i == 0 else "chev")
    boxtext(b, st, size=10, bold=True, color=WHITE)
lanes = [
    ("Resident", BLUE, TBLUE, "phone", [
        "Searches stays near OMR campus or office",
        "Talks to VibeCheck Live or takes quiz, picks bed",
        "Verifies phone via OTP, uploads masked ID",
        "Signs in at /stay/<slug>, logs room condition photos",
        "Marks meal opt-outs, pays bills, raises tickets",
        "Uploads exit photos, reviews deposit ledger"]),
    ("Gemini & ADK", RED, TRED, "ai", [
        "Embeds query (pgvector) & ranks by landmark distance",
        "Scores habit fit against room residents, explains why",
        "Checks ID type & name match (stores last-4 only)",
        "Tags move-in condition photos by room area",
        "Forecasts kitchen meal plates; ADK answers queries",
        "Deposit Shield compares entry vs exit photos"]),
    ("Owner & staff", GRN, TGRN, "owner", [
        "Lists property, configures AC, food & services",
        "Reviews bed request with VibeCheck fit score",
        "Verifies flagged KYC, approves bed allocation",
        "Assigns bed and onboarding checklist tasks",
        "Listens to PG Pulse Live brief; resolves tickets",
        "Approves final deposit settlement (human-in-loop)"]),
]
for j, (lab, c, t, ic, cells) in enumerate(lanes):
    y = 1.86 + j * 1.07
    box(s, 0.4, y, 0.95, 0.97, fill=c)
    icon(s, ic, 0.69, y + 0.1, 0.36, bg=None)
    text(s, 0.4, y + 0.5, 0.95, 0.42, lab, size=9, bold=True, color=WHITE, align="c")
    for i, ct in enumerate(cells):
        b = box(s, x0 + i * cw + 0.04, y, cw - 0.06, 0.97, fill=t)
        boxtext(b, ct, size=8.5, align="l", anchor="m", margin=0.07)
    if j < 2:
        for i in range(6):
            cx = x0 + i * cw + cw / 2
            arrow(s, cx, y + 0.97, cx, y + 1.07, color=GREY, w=1)
icon(s, "shield", 0.4, 5.13, 0.28, bg=BLUE)
text(s, 0.75, 5.13, 8.8, 0.28, "Three role-scoped web portals power the full lifecycle today (with WhatsApp alerts on the Phase 2 roadmap); every money action requires human approval.",
     size=8.5, color=GREY, anchor="m")

# ---------------- Slide 7: wireframes ----------------
s = S[7]

def phone(x, ttl, bar=BLUE):
    box(s, x, 1.35, 2.0, 3.72, fill=DARK, radius=0.22)
    box(s, x + 0.08, 1.45, 1.84, 3.52, fill=WHITE, radius=0.16)
    b = box(s, x + 0.08, 1.45, 1.84, 0.42, fill=bar, radius=0.12)
    boxtext(b, ttl, size=8.5, bold=True, color=WHITE, align="l", margin=0.1)
    return x + 0.16

def cap(x, t):
    text(s, x - 0.05, 5.1, 2.1, 0.3, t, size=8.5, bold=True, color=GREY, align="c")

# 1 Discover
cx = phone(0.5, "Stays near OMR & Velachery")
b = box(s, cx, 1.95, 1.68, 0.26, fill=SURF, line=LINE, radius=0.13)
boxtext(b, "Quiet PG, Female, Under ₹10k", size=7, color=GREY, align="l")
for k, (n, p, d) in enumerate([("Palm Grove Women's", "₹9,500/bed", "0.7 km to TIDEL Park"), ("Northstar Student", "₹8,200/bed", "0.8 km to IIT Gate"), ("Harbour Point PG", "₹8,500/bed", "1.1 km to metro")]):
    yy = 2.3 + k * 0.86
    box(s, cx, yy, 1.68, 0.78, fill=WHITE, line=LINE)
    box(s, cx + 0.06, yy + 0.06, 0.5, 0.66, fill="D2E3FC", radius=0.05)
    text(s, cx + 0.6, yy + 0.04, 1.06, 0.72, [[(n, {"bold": True, "size": 7.5})], [(p, {"color": BLUE, "bold": True})], [(d, {"color": GREY})], [("Verified, VibeCheck", {"color": GRN, "bold": True})]], size=7, spacing=0, margin=0.02)
cap(0.5, "Semantic discovery")

# 2 VibeCheck
cx = phone(2.85, "VibeCheck: Bed 101-B")
o = box(s, cx + 0.44, 2.0, 0.8, 0.8, fill=TBLUE, line=BLUE, shape="oval", lw=3)
boxtext(o, [[("96%", {"bold": True, "size": 13, "color": BLUE})]])
text(s, cx, 2.84, 1.68, 0.25, "match with Room 101 resident", size=7.5, color=GREY, align="c")
for k, r in enumerate(["Both sleep before 11 pm", "Tidy right away", "Quiet study hours", "Rare overnight guests"]):
    b = box(s, cx, 3.12 + k * 0.3, 1.68, 0.25, fill=TGRN, radius=0.12)
    boxtext(b, r, size=7.5, color=GRN, align="l")
text(s, cx, 4.32, 1.68, 0.22, "Rematch window: 30 days", size=7, color=GREY, align="c")
b = box(s, cx, 4.58, 1.68, 0.3, fill=BLUE, radius=0.15)
boxtext(b, "Choose bed 101-B", size=8, bold=True, color=WHITE)
cap(2.85, "VibeCheck match")

# 3 Deposit Shield & Resident Portal
cx = phone(5.2, "Deposit Shield: Room 101", bar="1E8E3E")
b = box(s, cx, 1.97, 0.81, 0.78, fill=TBLUE, radius=0.06)
boxtext(b, [[("Move-in", {"bold": True, "color": BLUE})], [("Wall & desk", {})], [("Clean, 01 Jun", {"color": GREY, "size": 6.5})]], size=7)
b = box(s, cx + 0.87, 1.97, 0.81, 0.78, fill=TYEL, radius=0.06)
boxtext(b, [[("Move-out", {"bold": True, "color": DARK})], [("Wall & desk", {})], [("Scuff, 30 Nov", {"color": GREY, "size": 6.5})]], size=7)
b = box(s, cx, 2.83, 1.68, 1.05, fill=SURF, line=LINE, radius=0.06)
boxtext(b, [
    [("Gemini Vision diff", {"bold": True, "color": RED})],
    [("Paint scuff: Normal wear (₹0)", {"color": GRN, "bold": True})],
    [("Desk lamp crack: ₹450", {})],
    [("Refund due: ₹14,550 / ₹15,000", {"bold": True})],
], size=7, align="l", anchor="t", margin=0.06)
b = box(s, cx, 3.96, 1.68, 0.54, fill=TGRN, radius=0.06)
boxtext(b, [[("Kitchen AI: Tonight's dinner", {"bold": True, "color": GRN})], [("38 plates forecast, 7 saved (₹560)", {})]], size=6.8, align="l", margin=0.06)
b = box(s, cx, 4.58, 1.68, 0.3, fill=GRN, radius=0.15)
boxtext(b, "Approve deposit refund", size=7.5, bold=True, color=WHITE)
cap(5.2, "Deposit Shield & Kitchen AI")

# 4 Owner copilot
cx = phone(7.55, "Owner: Palm Grove", bar=GRN)
for k, (v, l) in enumerate([("91%", "occupancy"), ("₹38.5k", "dues pending"), ("2", "open tickets")]):
    xx = cx + k * 0.57
    b = box(s, xx, 1.97, 0.53, 0.66, fill=TGRN, radius=0.06)
    boxtext(b, [[(v, {"bold": True, "size": 8.5, "color": GRN})], [(l, {"size": 6, "color": GREY})]], margin=0.01)
b = box(s, cx, 2.73, 1.68, 1.08, fill=TBLUE, radius=0.06)
boxtext(b, [[("PG Pulse: Live voice brief", {"bold": True, "color": BLUE})], [("1 KYC check needs review", {})], [("Room 102 AC service due", {})], [("Voice: 'Brief me' (Gemini Live)", {"bold": True, "color": RED})]], size=7, align="l", anchor="t", margin=0.08)
b = box(s, cx, 3.9, 1.68, 0.62, fill=TYEL, radius=0.06)
boxtext(b, [[("ADK confirm: Post notice?", {"bold": True})], [("Water tank cleaning Sun 10 to 12", {})]], size=7, align="l", anchor="t", margin=0.08)
for k, (t, f) in enumerate([("Confirm", GRN), ("Cancel", GREY)]):
    b = box(s, cx + k * 0.86, 4.6, 0.82, 0.27, fill=f, radius=0.13)
    boxtext(b, t, size=7.5, bold=True, color=WHITE)
cap(7.55, "ADK copilot & Live brief")

# ---------------- Slide 8: architecture ----------------
s = S[8]
def group(x, y, w, h, title, c, t):
    box(s, x, y, w, h, fill=t)
    text(s, x + 0.1, y + 0.05, w - 0.2, 0.26, title, size=9.5, bold=True, color=c)

def node(x, y, w, h, head, sub, c=BLUE, ic=None):
    box(s, x, y, w, h, fill=WHITE, line=LINE)
    off = 0
    if ic:
        icon(s, ic, x + 0.07, y + (h - 0.3) / 2, 0.3, bg=c)
        off = 0.38
    text(s, x + 0.06 + off, y, w - 0.1 - off, h, [[(head, {"bold": True, "size": 8.5})], [(sub, {"color": GREY})]], size=7.5, anchor="m", spacing=0)

group(0.4, 1.33, 1.95, 3.87, "Users & channels", BLUE, TBLUE)
node(0.5, 1.68, 1.75, 0.82, "Guest discovery app", "/ (Search & VibeCheck)", BLUE, "search")
node(0.5, 2.62, 1.75, 0.82, "Resident portal", "/stay/<slug> (Money, food, issues)", BLUE, "phone")
node(0.5, 3.56, 1.75, 0.82, "Owner & staff console", "/owner (15 role-scoped views)", GRN, "owner")
text(s, 0.5, 4.48, 1.75, 0.66, "Guests, residents, owners, wardens, cooks, accountants (WhatsApp alerts in Phase 2)", size=7.5, color=GREY)

group(2.65, 1.33, 3.7, 3.0, "Cloud Run (Express 5 + TypeScript)", BLUE, SURF)
box(s, 2.65, 1.33, 3.7, 3.0, fill=None, line=BLUE)
node(2.78, 1.68, 3.44, 0.62, "Core API & Prisma RLS layer", "Discovery, bookings, billing, tickets, Deposit Shield", BLUE, "cloud")
node(2.78, 2.4, 3.44, 0.62, "AI orchestrator (Google ADK)", "Role-scoped tool calling + confirmation tokens", RED, "ai")
node(2.78, 3.12, 3.44, 0.62, "Gemini Live voice relay", "WebSocket 16 kHz AudioWorklet PCM (VibeCheck + Brief)", RED, "mic")
b = box(s, 2.78, 3.84, 3.44, 0.38, fill=DARK)
boxtext(b, [[("Guardrails: ", {"bold": True, "color": WHITE}), ("PostgreSQL RLS (livingplus_app), habits-only, human confirm", {"color": "E8EAED"})]], size=7.2)
group(2.65, 4.45, 3.7, 0.75, "Build, test & operate", GREY, SURF)
text(s, 2.75, 4.72, 3.5, 0.45, "AI Studio (evals), Antigravity (agentic build), Cloud Build, 322 automated tests", size=7.5)

group(6.65, 1.33, 2.95, 1.62, "Google AI", RED, TRED)
node(6.75, 1.66, 2.75, 0.58, "Gemini 2.5 Flash & Vision", "Structured output, KYC, Deposit Shield, Kitchen AI", RED, "ai")
node(6.75, 2.3, 2.75, 0.58, "Gemini Live & Embeddings", "Multilingual voice + gemini-embedding-001", RED, "mic")
group(6.65, 3.08, 2.95, 2.12, "Data & services", GRN, TGRN)
node(6.75, 3.4, 2.75, 0.52, "Cloud SQL (PostgreSQL)", "pgvector search + per-owner Row-Level Security", GRN, "db")
node(6.75, 3.98, 2.75, 0.52, "Cloud Storage & Secrets", "Condition photos, KYC media, Secret Manager", GRN, "shield")
node(6.75, 4.56, 2.75, 0.52, "Landmark & Phase 2 hooks", "Campus distance sort; WhatsApp webhook next", GRN, "map")
arrow(s, 2.35, 2.9, 2.65, 2.9, BLUE, 1.5)
arrow(s, 6.35, 2.2, 6.65, 2.2, RED, 1.5)
arrow(s, 6.35, 3.9, 6.65, 3.9, GRN, 1.5)

# ---------------- Slide 9: technologies ----------------
s = S[9]
cols = [
    ("Google AI", RED, TRED, "ai", [
        ("Google ADK (Agent Dev Kit)", "Multi-tool Owner Copilot with confirmation tokens"),
        ("Gemini 2.5 Flash & Vision", "Deposit Shield photo diff, KYC verify, Kitchen AI"),
        ("Gemini structured output", "Explainable VibeCheck scores anchored within 15 pts"),
        ("Gemini Live API", "Tamil/Hindi/English voice buddy & owner briefings"),
        ("Gemini Embeddings", "gemini-embedding-001 + pgvector semantic search"),
        ("AI Studio & Antigravity", "Prompt/guardrail evals and full-stack agentic build")]),
    ("Google Cloud", BLUE, TBLUE, "cloud", [
        ("Cloud Run", "Stateless API, ADK orchestrator & WebSocket relay"),
        ("Cloud SQL (PostgreSQL)", "pgvector + mandatory livingplus_app RLS policy"),
        ("Cloud Build & Artifact Reg.", "Automated Docker builds and Prisma migration jobs"),
        ("Secret Manager", "Encrypted runtime API keys and session secrets"),
        ("Cloud Storage", "Move-in/move-out condition photos and KYC media"),
        ("Cloud Logging & Monitoring", "Latency, token usage and guardrail audit logs")]),
    ("Product & integrations", GRN, TGRN, "phone", [
        ("React 19 + Tailwind v4", "Three role-scoped web apps (Guest, Resident, Owner)"),
        ("AudioWorklet 16 kHz PCM", "Low-latency browser voice streaming for Gemini Live"),
        ("Phase 2 pilot integrations", "WhatsApp Business alerts & UPI auto-reconciliation")]),
]
for i, (h, c, t, ic, items) in enumerate(cols):
    x = 0.4 + i * 3.1
    box(s, x, 1.33, 2.95, 3.87, fill=t)
    icon(s, ic, x + 0.12, 1.43, 0.34, bg=c)
    text(s, x + 0.54, 1.43, 2.3, 0.34, h, size=11.5, bold=True, anchor="m")
    for k, (n, d) in enumerate(items):
        text(s, x + 0.14, 1.88 + k * 0.54, 2.7, 0.52, [[(n, {"bold": True, "size": 9.5})], [(d, {"color": GREY})]], size=8.5, spacing=0)
x = 6.6
b = box(s, x + 0.14, 3.62, 2.67, 1.44, fill=WHITE)
text(s, x + 0.24, 3.66, 2.5, 0.62, "12", size=34, bold=True, color=BLUE)
text(s, x + 0.24, 4.3, 2.5, 0.72, "Google AI & Cloud technologies integrated across the live product and build pipeline", size=9, color=DARK)

# ---------------- Slide 10: cost ----------------
s = S[10]
text(s, 0.4, 1.3, 9.2, 0.3, [[("Lean by design: ", {"bold": True}), ("every component is managed and pay-as-you-go, with deterministic fallbacks so AI costs stay bounded.", {})]], size=11)
rows = [("Component", "What drives cost", "How we keep it low"),
        ("Cloud Run", "Requests and CPU time", "Scales to zero off-peak; single container serves API + SPA"),
        ("Gemini 2.5 Flash", "Tokens per request", "Compact structured schemas; deterministic baseline when cached"),
        ("Gemini Live", "Minutes of voice", "Opt-in 60s voice turns for VibeCheck and owner daily brief"),
        ("Gemini Embeddings", "Texts embedded", "SHA-256 content-hash cache in Cloud SQL avoids re-embedding"),
        ("Cloud SQL (pgvector)", "Instance size", "Single shared Postgres instance with Row-Level Security per owner"),
        ("Cloud Storage", "GB stored", "Compressed condition & KYC photos with lifecycle retention rules"),
        ("WhatsApp (Phase 2)", "Business-initiated chats", "Planned for OMR pilot; web portals handle all day-to-day traffic free")]
for r, row in enumerate(rows):
    y = 1.68 + r * 0.43
    hdr = r == 0
    box(s, 0.4, y, 6.3, 0.39, fill=DARK if hdr else (SURF if r % 2 else WHITE), radius=0.05, line=None if hdr else LINE)
    for k, (cx, cw) in enumerate([(0.5, 1.45), (1.95, 1.75), (3.7, 2.95)]):
        text(s, cx, y, cw, 0.39, row[k], size=8.5 if not hdr else 9, bold=hdr or k == 0, color=WHITE if hdr else DARK, anchor="m")
box(s, 6.95, 1.68, 2.65, 1.62, fill=TBLUE)
text(s, 7.08, 1.75, 2.42, 1.5, [[("Pilot scope", {"bold": True, "color": BLUE, "size": 11})],
     [("One owner cluster on Chennai's OMR corridor (about 10 PGs, 450 beds) on asia-south1 (Mumbai) managed services.", {})]], size=9.5, spacing=4)
box(s, 6.95, 3.44, 2.65, 1.65, fill=TYEL)
text(s, 7.08, 3.51, 2.42, 1.55, [[("Unit economics anchor", {"bold": True, "size": 11})],
     [("Beds rent for ₹6,500 to ₹15,000/mo. Infra and Gemini cost is ₹12 to ₹18/bed/mo, under 10% of the per-bed SaaS fee.", {})]], size=9.5, spacing=4)
caption(s, "Sized for the Chennai OMR pilot cluster on Google Cloud asia-south1 with SHA-256 embedding cache and opt-in voice sessions.")

# ---------------- Slide 11: snapshots ----------------
s = S[11]
text(s, 0.4, 1.24, 9.2, 0.4, [[("Our key thing (K): ", {"bold": True, "color": BLUE}),
     ("VibeCheck (Gemini Live voice and explainable bed-level roommate matching), paired with PG Pulse Live briefings and Kitchen AI.", {})]], size=10.5)

shot_dir = os.path.join(BASE_DIR, "screenshots")
shots = [
    ("vibecheck_buddy.png", "VibeCheck Live voice & habit buddy"),
    ("vibecheck_match.png", "Explainable bed match & reasons"),
    ("owner_kitchen.png", "Owner console: Kitchen AI & Copilot"),
]
for i, (fname, t) in enumerate(shots):
    x = 0.4 + i * 3.1
    box(s, x, 1.66, 2.95, 2.38, fill=WHITE, line=LINE)
    raw_path = os.path.join(shot_dir, fname)
    if os.path.exists(raw_path):
        sq_path = os.path.join(shot_dir, f"sq_{fname}")
        prepare_shot(raw_path, sq_path, tw=1200, th=958)
        s.shapes.add_picture(sq_path, Inches(x + 0.06), Inches(1.66 + 0.06), Inches(2.83), Inches(2.26))
    else:
        icon(s, "cam", x + 1.25, 2.5, 0.46, bg="9AA0A6")
        text(s, x + 0.1, 3.05, 2.75, 0.5, "[Insert prototype screenshot]", size=9, color=GREY, align="c")
    text(s, x, 4.06, 2.95, 0.24, t, size=9, bold=True, align="c")

cred_rows = [
    ("Role  (Mentor Test Credentials)", "Where  (https://livingplus-pfpdmrspea-el.a.run.app)", "Login"),
    ("Owner", "/owner/login", "9555500001, password rDpNDsOYlD2dLqMlsRlQ"),
    ("Resident", "/stay/palm-grove-womens-residence", "9000000001, code 123456"),
]
for r, row in enumerate(cred_rows):
    y = 4.38 + r * 0.33
    hdr = r == 0
    box(s, 0.4, y, 9.2, 0.3, fill=DARK if hdr else (TGRN if r == 1 else TBLUE), radius=0.05, line=None if hdr else LINE)
    for k, (cx, cw) in enumerate([(0.52, 2.15), (2.7, 3.25), (6.0, 3.5)]):
        text(s, cx, y, cw, 0.3, row[k], size=8.5, bold=hdr or k == 0,
             color=WHITE if hdr else (GRN if (r == 1 and k == 0) else (BLUE if (r == 2 and k == 0) else DARK)), anchor="m")

# ---------------- Slide 12: benchmarking ----------------
s = S[12]
text(s, 0.4, 1.3, 9.2, 0.3, [[("Verified prototype benchmarks: ", {"bold": True}), ("322 automated tests (259 backend + 56 frontend + 7 Playwright E2E) & guardrail checks.", {})]], size=11)
rows = [("Metric", "How we verify", "Prototype result"),
        ("VibeCheck explainability", "Zod schema + 15 pt anchor to habit baseline", "100% matches carry 2 to 4 habit reasons"),
        ("Deposit Shield & KYC", "Gemini Vision paired photo diff & ID last-4 check", "Normal wear is ₹0; mismatches flagged"),
        ("Tenant & role isolation", "PostgreSQL RLS (livingplus_app) + cross-tenant tests", "0 cross-owner leaks across 259 tests"),
        ("Money & notice safety", "ADK confirmation token required before mutation", "100% write actions gated by confirm"),
        ("Assistant & voice latency", "ADK tool calls & 16 kHz AudioWorklet Live relay", "p95 < 2.5s tool call; < 1s audio turn")]
for r, row in enumerate(rows):
    y = 1.68 + r * 0.5
    hdr = r == 0
    box(s, 0.4, y, 6.3, 0.45, fill=DARK if hdr else (SURF if r % 2 else WHITE), radius=0.05, line=None if hdr else LINE)
    for k, (cx, cw) in enumerate([(0.5, 1.7), (2.2, 2.4), (4.6, 2.05)]):
        text(s, cx, y, cw, 0.45, row[k], size=8.5 if not hdr else 9, bold=hdr or k in (0, 2), color=WHITE if hdr else (GRN if k == 2 else DARK), anchor="m")
box(s, 6.95, 1.68, 2.65, 2.95, fill=TGRN)
icon(s, "trend", 7.08, 1.78, 0.34, bg=GRN)
text(s, 7.5, 1.78, 2.05, 0.34, "Pilot business KPIs", size=11, bold=True, anchor="m")
text(s, 7.08, 2.22, 2.45, 2.35, [
    [("__bullet__", {}), ("Days from search to booked bed", {"bc": GRN})],
    [("__bullet__", {}), ("Roommate-driven exits in first 30 days", {"bc": GRN})],
    [("__bullet__", {}), ("Daily meal plates saved via Kitchen AI", {"bc": GRN})],
    [("__bullet__", {}), ("Deposit disputes at move-out", {"bc": GRN})],
    [("__bullet__", {}), ("Owner occupancy & module adoption", {"bc": GRN})],
], size=9.5, spacing=5)
caption(s, "Every AI endpoint includes a deterministic fallback and schema validator so the platform remains 100% available even during model timeouts.", y=4.75)

# ---------------- Slide 13: future ----------------
s = S[13]
phases = [("Now", "Buildathon (Live)", "3 web portals, VibeCheck Live, Deposit Shield, Kitchen AI & ADK Copilot", BLUE),
          ("Next", "Chennai OMR pilot", "WhatsApp Business channel for alerts & quick actions with first owner cluster", GRN),
          ("Then", "India hubs", "Bengaluru, Hyderabad, Pune; Stay Passport trust record & partner network", YEL),
          ("Later", "Global", "UAE, Philippines, Indonesia: localized language, KYC and payments", RED)]
box(s, 0.6, 1.98, 8.8, 0.05, fill=LINE, shape="rect")
for i, (tag, h, d, c) in enumerate(phases):
    x = 0.4 + i * 2.33
    box(s, x + 0.95, 1.83, 0.34, 0.34, fill=c, shape="oval")
    text(s, x, 1.33, 2.24, 0.38, tag.upper(), size=9, bold=True, color=c, align="c")
    box(s, x, 2.32, 2.2, 1.2, fill=SURF, line=LINE)
    text(s, x + 0.1, 2.38, 2.0, 1.3, [[(h, {"bold": True, "size": 10.5})], [(d, {"color": GREY})]], size=8.8, spacing=3)
text(s, 0.4, 3.76, 9.2, 0.3, "Future scope & capabilities on the roadmap", size=11, bold=True, color=BLUE)
chips = ["WhatsApp Business assistant & alerts", "Stay Passport (portable trust record)", "Smart utility sub-meter IoT sync",
         "Parent transparency view for students", "UPI / Razorpay auto-reconciliation", "Owner neighborhood benchmarking"]
for i, c in enumerate(chips):
    r, k = divmod(i, 3)
    b = box(s, 0.4 + k * 3.1, 4.14 + r * 0.5, 2.95, 0.4, fill=TBLUE, radius=0.19)
    boxtext(b, c, size=9.5, color=DARK)

# ---------------- Slide 14: business model & market ----------------
s = S[14]
add_title(s, S[13], "Business model & market potential")
text(s, 0.4, 1.3, 3.7, 0.3, "Why now: demand far outruns organised supply", size=11, bold=True, color=BLUE)
stats = [("6.6M", "beds of organised co-living demand in India (2025)"), ("0.3M", "organised co-living beds available today"),
         ("50M", "migrants aged 20 to 34, the core demand base")]
for i, (v, l) in enumerate(stats):
    y = 1.7 + i * 1.08
    box(s, 0.4, y, 3.7, 0.96, fill=TBLUE if i != 1 else TRED)
    text(s, 0.52, y, 1.35, 0.96, v, size=24, bold=True, color=BLUE if i != 1 else RED, anchor="m")
    text(s, 1.9, y, 2.1, 0.96, l, size=9.5, anchor="m")
text(s, 4.35, 1.3, 5.25, 0.3, "How LivingPlus earns", size=11, bold=True, color=BLUE)
streams = [("money", BLUE, "SaaS for owners", "Per property or per bed, plus modular add-ons: VibeCheck, AI KYC, Kitchen Forecast, Deposit Shield"),
           ("key", GRN, "Transactions", "Commission on confirmed digital bookings; promoted listings to fill vacancies faster"),
           ("handshake", YEL, "Living-services share", "Revenue share on meals, housekeeping and laundry booked by residents")]
for i, (ic, c, h, d) in enumerate(streams):
    y = 1.7 + i * 0.86
    box(s, 4.35, y, 5.25, 0.76, fill=SURF, line=LINE)
    icon(s, ic, 4.47, y + 0.19, 0.38, bg=c)
    text(s, 4.98, y + 0.02, 4.55, 0.72, [[(h, {"bold": True, "size": 10})], [(d, {"color": GREY})]], size=8.5, anchor="m", spacing=1)
b = box(s, 4.35, 4.3, 5.25, 0.62, fill=DARK)
boxtext(b, [[("Flywheel: ", {"bold": True, "color": WHITE}), ("free for residents and staff, so whole properties onboard, creating dense demand for partners and accessible owner pricing.", {"color": "E8EAED"})]], size=9, align="l", margin=0.12)
caption(s, "Source: Colliers India co-living report, May 2025. Paying customers: independent PG and apartment owners; launch market India, starting with Chennai OMR.", y=5.05)

# ---------------- Slide 15: SPARK ----------------
s = S[15]
add_title(s, S[13], "LivingPlus through the SPARK lens")
spark = [("S", "Significance", BLUE, "Millions move cities every year for study and work; weeks of searching, bad roommate fits, meal waste and deposit disputes are a real, recurring cost."),
         ("P", "Potential", GRN, "Owners pay for SaaS and add-ons; bookings and partner services add take-rate. 6.6M beds of demand against 0.3M organised supply."),
         ("A", "AI relevance", RED, "Gemini & ADK do what rules can't: live voice habit interviews, explainable bed matching, Deposit Shield photo diffs, and Kitchen waste forecasts."),
         ("R", "Realistic", YEL, "Live today across 3 role-scoped web portals on Cloud Run & Cloud SQL (with RLS and human approval on money); WhatsApp rollout next for OMR pilot."),
         ("K", "Key thing", "4285F4", "VibeCheck: multilingual Gemini Live voice buddy and explainable, habits-only bed-level roommate matching, built and tested end to end.")]
for i, (l, h, c, d) in enumerate(spark):
    y = 1.36 + i * 0.78
    box(s, 0.4, y, 9.2, 0.68, fill=SURF if i != 4 else TBLUE)
    b = box(s, 0.52, y + 0.1, 0.48, 0.48, fill=c, shape="oval")
    boxtext(b, l, size=16, bold=True, color=WHITE, margin=0)
    text(s, 1.15, y, 1.55, 0.68, h, size=11.5, bold=True, anchor="m")
    text(s, 2.7, y, 6.8, 0.68, d, size=9.5, anchor="m")

# ---------------- delete instructions slide, reorder ----------------
sldIdLst = prs.slides._sldIdLst
ids = list(sldIdLst)
first = ids[0]
prs.part.drop_rel(first.get(qn("r:id")))
sldIdLst.remove(first)
ids = list(sldIdLst)  # now original 2..16
# move business-model (orig 14 -> idx 12) after opportunities (orig 4 -> idx 2)
bm = ids[12]
sldIdLst.remove(bm)
sldIdLst.insert(3, bm)

out_deck = os.path.join(BASE_DIR, "LivingPlus_Buildathon_Deck.pptx")
root_deck = os.path.join(os.path.dirname(BASE_DIR), "LivingPlus_Buildathon_Deck.pptx")
prs.save(out_deck)
prs.save(root_deck)
print("saved:", out_deck, "and", root_deck)
