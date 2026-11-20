import asyncio
import os
import edge_tts

AUDIO_DIR = "demo/audio"
os.makedirs(AUDIO_DIR, exist_ok=True)

VOICE = "en-IN-PrabhatNeural"  # Professional, clear, warm Indian English narrator

SCRIPTS = {
    "scene1_hook": (
        "Every year, lakhs of students and young professionals move to cities like Chennai and into a PG. "
        "They pick one from WhatsApp forwards, pay a deposit, and get a bed next to whoever is in the room. "
        "If the roommate sleeps at 4 am and plays music, they leave early and lose money. "
        "And the PG itself runs on notebooks. "
        "This is Living Plus: one platform for the guest, the resident and the owner, with Gemini doing the routine work."
    ),
    "scene2_finding": (
        "A guest browses with no sign-up. "
        "Every listing shows the real monthly cost: rent, food, and deposit. "
        "Beds are live from the owner's own register. "
        "I am starting a job at Tidel Park, so I pick it here. "
        "Every PG now shows how far it is, nearest first. Palm Grove is about 2.7 kilometres away."
    ),
    "scene3_vibecheck": (
        "Here is our key feature, VibeCheck. Instead of filling a long form, you just talk to a PG buddy. "
        "It is a live voice conversation on the Gemini Live API. "
        "It understands Tamil, Hindi, and English, and it works out my habits from normal conversation. "
        "You can see them appear: early sleeper, early riser, tidy, quiet. "
        "It only talks about what exists at this PG. Palm Grove has no shared kitchen and no AC, so it never asks about cooking or room temperature. "
        "And it records habits only. Never caste, religion, diet, or gender, and never other residents' names. "
        "Now every free bed shows how well I would fit, with plain reasons like you both sleep before 11 pm. "
        "The match stays grounded in real habits, so it cannot promise a fit that is not there. "
        "And if it does not work out after moving in, there is a 30-day rematch window. "
        "One phone code and the request is sent. The bed is held while the owner reviews it."
    ),
    "scene4_owner": (
        "On the owner's side, Today shows only what needs attention: the new bed request, overdue rent, an open repair. "
        "The owner's copilot, built with Google's Agent Development Kit, handles everyday requests and only ever sees this owner's PGs. "
        "I ask the assistant who owes rent right now, and it immediately pulls the overdue records. "
        "Next, I ask it to post a notice to Palm Grove residents about water being off this Sunday for tank cleaning. "
        "It drafts the notice, and nothing is posted until I confirm. "
        "Every booking, money action, or notice waits for a person's yes, and it is logged. "
        "Under Meals and cleaning, the kitchen forecast for Harbour Point saves real money. "
        "It uses who is on the food plan, opted out, and residents' routines from VibeCheck to forecast exact meals and calculate food saved in rupees. "
        "When someone moves out, Deposit Shield compares move-in and move-out photos and lists what changed, with a fair charge. "
        "Normal wear is never charged, and the resident sees the same breakdown. "
        "Finally, PG pulse gives the owner a weekly brief written by Gemini, plus hands-free voice briefings on Gemini Live, with a full audit log of everything done by the assistant."
    ),
    "scene5_resident": (
        "On the resident portal, the resident sees exactly what they owe and why, gets the water notice we just posted, and can report a problem with a photo or a voice note. Residents use Living Plus completely free."
    ),
    "scene6_google_tech": (
        "Google's AI runs through the whole experience. "
        "Gemini Live powers both VibeCheck and hands-free owner briefings. "
        "Gemini matches roommates, reads move-out photos and IDs, forecasts the kitchen, and writes the owner's weekly brief. "
        "And it all runs securely on Google Cloud, with each owner's information kept strictly private. "
        "It is live today, it works on any phone, and people stay in control: the AI suggests, but bookings, money, and notices always wait for a human confirmation. "
        "If the AI is ever busy, every feature still works the simple way."
    ),
    "scene7_business_close": (
        "Residents use it free. "
        "Owners pay a small fee per bed, plus add-ons like VibeCheck and ID checks, a commission on bookings, and a share of meals and cleaning booked through the app. "
        "For an owner, one empty bed for a month costs more than the subscription. "
        "We start with a 90-day pilot on Chennai's OMR corridor, measuring four numbers owners care about: days to fill a bed, early exits, food wasted, and deposit disputes. "
        "VibeCheck gets you in with the right people. Living Plus runs the rest."
    )
}

async def generate():
    for name, text in SCRIPTS.items():
        mp3_path = os.path.join(AUDIO_DIR, f"{name}.mp3")
        print(f"Generating audio for {name}...")
        communicate = edge_tts.Communicate(text, VOICE)
        await communicate.save(mp3_path)
        print(f"Saved {mp3_path}")

if __name__ == "__main__":
    asyncio.run(generate())
