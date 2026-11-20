import os, time, json, re, subprocess
import imageio_ffmpeg
from moviepy import AudioFileClip
from playwright.sync_api import sync_playwright

FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()
RECORDINGS_DIR = os.path.abspath("demo/raw_videos")
os.makedirs(RECORDINGS_DIR, exist_ok=True)

BASE_URL = "https://livingplus-pfpdmrspea-el.a.run.app"
SLIDES_URL = f"file:///{os.path.abspath('demo/deck.html').replace('\\', '/')}"

def merge_video_audio(video_path, audio_path, output_path):
    print(f"Merging {video_path} + {audio_path} -> {output_path}")
    cmd = [
        FFMPEG_EXE, "-y",
        "-i", video_path,
        "-i", audio_path,
        "-r", "30",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-ar", "44100",
        "-b:a", "192k",
        "-shortest",
        output_path
    ]
    subprocess.run(cmd, check=True)
    print(f"Merged successfully: {output_path}")

def record_scene3(browser):
    audio_path = os.path.abspath("demo/audio/scene3_vibecheck.mp3")
    duration = AudioFileClip(audio_path).duration
    print(f"\n=== RECORDING SCENE 3 (VibeCheck: {duration:.2f}s) ===")

    context = browser.new_context(
        record_video_dir=RECORDINGS_DIR,
        record_video_size={'width': 1920, 'height': 1080},
        viewport={'width': 1920, 'height': 1080}
    )
    page = context.new_page()

    start_time = time.time()
    page.goto(f"{BASE_URL}/", wait_until="networkidle")
    time.sleep(2)

    # 1. Click Palm Grove Women's Residence
    card_btn = page.get_by_role('button', name=re.compile('Palm Grove', re.I)).first
    card_btn.click()
    time.sleep(3)

    # 2. Click Request a bed
    page.locator('button:has-text("Request a bed")').first.click()
    time.sleep(2)

    # 3. Click Take VibeCheck
    page.locator('button:has-text("Take VibeCheck")').first.click()
    time.sleep(2)

    # 4. Click "Answer quick questions instead"
    page.locator('button:has-text("Answer quick questions instead")').first.click()
    time.sleep(2)

    # 5. Answer questions smoothly
    fieldsets = page.locator('fieldset').all()
    for fs in fieldsets:
        labels = fs.locator('label').all()
        if labels:
            labels[0].scroll_into_view_if_needed()
            labels[0].click()
            time.sleep(1.2)

    time.sleep(2)

    # 6. Click "See my matches"
    page.locator('button:has-text("See my matches")').first.click()
    time.sleep(3.5)

    # 7. Select Available bed (shows 94% match)
    bed_select = page.locator('label:has-text("Available bed") select').first
    if bed_select.count() > 0:
        bed_select.select_option(index=1)
    time.sleep(4)

    # 8. Fill Move-in date
    page.locator('label:has-text("Move-in date") input').first.fill('2026-12-01')
    time.sleep(1.5)

    # 9. Click Next
    page.locator('button.btn-primary:has-text("Next")').first.click()
    time.sleep(2)

    # 10. Fill Name & Phone
    page.locator('input[autocomplete="name"]').first.fill('Pooja Sundaram')
    time.sleep(1)
    page.locator('input[autocomplete="tel"]').first.fill('9840123456')
    time.sleep(1)

    # 11. Click Next to show verification summary
    page.locator('button.btn-primary:has-text("Next")').first.click()
    time.sleep(2)

    # Rest on verification step until duration finishes
    elapsed = time.time() - start_time
    remaining = max(2.0, duration - elapsed + 1.5)
    print(f"Scene 3 remaining wait: {remaining:.2f}s")
    time.sleep(remaining)

    video_path = page.video.path()
    page.close()
    context.close()

    out_mp4 = os.path.abspath("demo/scene3_final.mp4")
    merge_video_audio(video_path, audio_path, out_mp4)
    return out_mp4

def record_scene4(browser):
    audio_path = os.path.abspath("demo/audio/scene4_owner.mp3")
    duration = AudioFileClip(audio_path).duration
    print(f"\n=== RECORDING SCENE 4 (Owner Console: {duration:.2f}s) ===")

    context = browser.new_context(
        record_video_dir=RECORDINGS_DIR,
        record_video_size={'width': 1920, 'height': 1080},
        viewport={'width': 1920, 'height': 1080}
    )
    page = context.new_page()

    start_time = time.time()

    # Log in as Owner
    page.goto(f"{BASE_URL}/owner/login", wait_until="networkidle")
    page.fill('input[placeholder="Enter mobile number"]', '9555500001')
    page.fill('input[placeholder="••••••••"]', 'rDpNDsOYlD2dLqMlsRlQ')
    page.click('button[type="submit"]')
    page.wait_for_url(re.compile(r".*/owner$"), timeout=15000)
    time.sleep(3)

    # Scroll Today dashboard
    page.evaluate("window.scrollTo({ top: 350, behavior: 'smooth' })")
    time.sleep(2.5)
    page.evaluate("window.scrollTo({ top: 0, behavior: 'smooth' })")
    time.sleep(2)

    # Open "Ask the assistant"
    assistant_btn = page.locator('button:has-text("Ask the assistant"), button[aria-label="Open PG assistant"]')
    if assistant_btn.count() > 0:
        assistant_btn.first.click()
        time.sleep(2)

        sec = page.locator('section[aria-label="PG assistant"]')
        chat_input = sec.locator('input:not([type="file"])')
        send_btn = sec.locator('button[aria-label="Send"]')

        # Type first prompt: "Who owes rent right now?"
        if chat_input.count() > 0:
            chat_input.fill('Who owes rent right now?')
            time.sleep(1)
            send_btn.click()
            time.sleep(6.5)

            # Type notice prompt
            chat_input.fill('Post a notice to Palm Grove residents: water is off this Sunday from 10 to 1 for tank cleaning.')
            time.sleep(1.5)
            send_btn.click()
            time.sleep(6.5)

            # Click Confirm action button
            confirm_btn = sec.locator('button:has-text("Confirm action")')
            if confirm_btn.count() > 0:
                confirm_btn.click()
                time.sleep(2.5)

        # Close assistant
        close_btn = page.locator('button[aria-label="Close assistant"]')
        if close_btn.count() > 0:
            close_btn.click()
            time.sleep(1.5)

    # Meals & cleaning tab
    meals_tab = page.locator('aside button:has-text("Meals & cleaning")')
    if meals_tab.count() > 0:
        meals_tab.click()
        time.sleep(2.5)

        # Select Harbour Point
        pg_select = page.locator('section[aria-labelledby="kitchen-heading"] select, select')
        if pg_select.count() > 0:
            try:
                options = pg_select.first.locator('option').all_inner_texts()
                for opt in options:
                    if 'harbour' in opt.lower():
                        pg_select.first.select_option(label=opt)
                        break
            except Exception:
                pass
        time.sleep(3.5)

    # Residents & KYC
    kyc_tab = page.locator('aside button:has-text("Residents & KYC")')
    if kyc_tab.count() > 0:
        kyc_tab.click()
        time.sleep(2.5)

        # Look for Arjun Kumar or Check out button
        checkout_btn = page.locator('button:has-text("Check out")')
        if checkout_btn.count() > 0:
            checkout_btn.first.click()
            time.sleep(2)

            # Compare move-in and move-out photos
            compare_btn = page.locator('button:has-text("Compare move-in and move-out photos")')
            if compare_btn.count() > 0:
                compare_btn.click()
                time.sleep(4.5)

            # Cancel checkout form
            cancel_btn = page.locator('button:has-text("Cancel")')
            if cancel_btn.count() > 0:
                cancel_btn.first.click()
                time.sleep(1.5)

    # PG pulse
    pulse_tab = page.locator('aside button:has-text("PG pulse")')
    if pulse_tab.count() > 0:
        pulse_tab.click()
        time.sleep(3)

        # Filter "Done by the assistant"
        ai_filter = page.locator('button:has-text("Done by the assistant")')
        if ai_filter.count() > 0:
            ai_filter.click()
            time.sleep(3)

    elapsed = time.time() - start_time
    remaining = max(2.0, duration - elapsed + 1.5)
    print(f"Scene 4 remaining wait: {remaining:.2f}s")
    time.sleep(remaining)

    video_path = page.video.path()
    page.close()
    context.close()

    out_mp4 = os.path.abspath("demo/scene4_final.mp4")
    merge_video_audio(video_path, audio_path, out_mp4)
    return out_mp4

def handle_resident_api(route):
    url = route.request.url
    if "stays" in url:
        route.fulfill(
            status=200, content_type="application/json",
            body=json.dumps([{
                "id": "stay-ananya-1", "name": "Ananya Rao", "status": "ACTIVE",
                "monthlyRent": 9800, "depositAmount": 9800, "depositReceived": 9800,
                "moveInDate": "2026-10-01T00:00:00.000Z",
                "property": { "id": "prop-palm-grove", "name": "Palm Grove Women's Residence", "address": "42 Canal Bank Road, Adyar", "locality": "Adyar", "city": "Chennai" },
                "bed": { "label": "Bed A", "room": { "roomNumber": "101", "roomType": "DOUBLE", "foodIncluded": False, "foodCharge": 0 } },
                "rentEntries": [
                    { "id": "rent-1", "period": "2026-11", "entryType": "RENT", "amount": 9800, "paidAmount": 0, "status": "OVERDUE", "dueDate": "2026-11-05" },
                    { "id": "rent-2", "period": "2026-11", "entryType": "ELECTRICITY", "amount": 650, "paidAmount": 0, "status": "OVERDUE", "dueDate": "2026-11-10" }
                ]
            }])
        )
    elif "notifications" in url:
        route.fulfill(
            status=200, content_type="application/json",
            body=json.dumps({
                "notifications": [{
                    "id": "notif-1", "type": "NOTICE", "title": "Water Tank Cleaning Notice",
                    "message": "Water is off this Sunday from 10 to 1 for tank cleaning.", "createdAt": "2026-11-20T10:00:00.000Z"
                }]
            })
        )
    else:
        route.fulfill(status=200, content_type="application/json", body="[]")

def record_scene5(browser):
    audio_path = os.path.abspath("demo/audio/scene5_resident.mp3")
    duration = AudioFileClip(audio_path).duration
    print(f"\n=== RECORDING SCENE 5 (Resident Portal: {duration:.2f}s) ===")

    context = browser.new_context(
        record_video_dir=RECORDINGS_DIR,
        record_video_size={'width': 1920, 'height': 1080},
        viewport={'width': 1920, 'height': 1080}
    )

    # Intercept tenant API calls
    context.route(re.compile(r".*/api/pg/tenant/.*"), lambda route: handle_resident_api(route))

    page = context.new_page()
    start_time = time.time()

    page.goto(f"{BASE_URL}/stay/palm-grove-womens-residence")
    page.evaluate("""() => {
        const token = 'demo-token';
        const user = { id: 'pg-demo-tenant-ananya', name: 'Ananya Rao', phone: '9000000001', role: 'PG_TENANT' };
        localStorage.setItem('residentToken', token);
        localStorage.setItem('residentUser', JSON.stringify(user));
        localStorage.setItem('residentSite', 'palm-grove-womens-residence');
    }""")
    page.reload(wait_until="networkidle")
    time.sleep(3)

    # Click Money tab
    money_tab = page.locator('button:has-text("Money"), aside button:has-text("Money")')
    if money_tab.count() > 0:
        money_tab.first.click()
        time.sleep(3.5)

    # Click Notifications
    notif_btn = page.locator('button[aria-label*="unread notifications" i], button:has-text("Notifications")')
    if notif_btn.count() > 0:
        notif_btn.first.click()
        time.sleep(3.5)

    # Click Maintenance / Requests tab
    maint_tab = page.locator('button:has-text("Requests"), button:has-text("Maintenance")')
    if maint_tab.count() > 0:
        maint_tab.first.click()
        time.sleep(3)

    elapsed = time.time() - start_time
    remaining = max(2.0, duration - elapsed + 1.5)
    print(f"Scene 5 remaining wait: {remaining:.2f}s")
    time.sleep(remaining)

    video_path = page.video.path()
    page.close()
    context.close()

    out_mp4 = os.path.abspath("demo/scene5_final.mp4")
    merge_video_audio(video_path, audio_path, out_mp4)
    return out_mp4

def record_scene6(browser):
    audio_path = os.path.abspath("demo/audio/scene6_google_tech.mp3")
    duration = AudioFileClip(audio_path).duration
    print(f"\n=== RECORDING SCENE 6 (Google Tech: {duration:.2f}s) ===")

    context = browser.new_context(
        record_video_dir=RECORDINGS_DIR,
        record_video_size={'width': 1920, 'height': 1080},
        viewport={'width': 1920, 'height': 1080}
    )
    page = context.new_page()

    # Slide 7 for 22s
    page.goto(f"{SLIDES_URL}#slide7")
    time.sleep(22.0)

    # Slide 8 for remaining duration
    page.goto(f"{SLIDES_URL}#slide8")
    time.sleep(max(3.0, duration - 21.0))

    video_path = page.video.path()
    page.close()
    context.close()

    out_mp4 = os.path.abspath("demo/scene6_final.mp4")
    merge_video_audio(video_path, audio_path, out_mp4)
    return out_mp4

def record_scene7(browser):
    audio_path = os.path.abspath("demo/audio/scene7_business_close.mp3")
    duration = AudioFileClip(audio_path).duration
    print(f"\n=== RECORDING SCENE 7 (Business & Close: {duration:.2f}s) ===")

    context = browser.new_context(
        record_video_dir=RECORDINGS_DIR,
        record_video_size={'width': 1920, 'height': 1080},
        viewport={'width': 1920, 'height': 1080}
    )
    page = context.new_page()

    # Slide 4 for 15s
    page.goto(f"{SLIDES_URL}#slide4")
    time.sleep(15.0)

    # Slide 12 for 14s
    page.goto(f"{SLIDES_URL}#slide12")
    time.sleep(14.0)

    # Slide 13 for remaining duration
    page.goto(f"{SLIDES_URL}#slide13")
    time.sleep(max(3.0, duration - 28.0))

    video_path = page.video.path()
    page.close()
    context.close()

    out_mp4 = os.path.abspath("demo/scene7_final.mp4")
    merge_video_audio(video_path, audio_path, out_mp4)
    return out_mp4

def concatenate_all():
    scenes = [
        "demo/scene1_final.mp4",
        "demo/scene2_final.mp4",
        "demo/scene3_final.mp4",
        "demo/scene4_final.mp4",
        "demo/scene5_final.mp4",
        "demo/scene6_final.mp4",
        "demo/scene7_final.mp4"
    ]
    concat_list = os.path.abspath("demo/concat_list.txt")
    with open(concat_list, "w", encoding="utf-8") as f:
        for s in scenes:
            f.write(f"file '{os.path.abspath(s).replace(chr(92), '/')}'\n")

    final_output = os.path.abspath("demo/livingplus_demo.mp4")
    print(f"\n=== CONCATENATING ALL 7 SCENES INTO {final_output} ===")
    cmd = [
        FFMPEG_EXE, "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", concat_list,
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-r", "30",
        "-c:a", "aac",
        "-ar", "44100",
        "-b:a", "192k",
        final_output
    ]
    subprocess.run(cmd, check=True)
    print(f"\n🎉 DEMO VIDEO CREATION COMPLETE! Output: {final_output}")
    size_mb = os.path.getsize(final_output) / (1024 * 1024)
    print(f"Final Video File Size: {size_mb:.2f} MB")

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            headless=True
        )
        record_scene3(browser)
        record_scene4(browser)
        record_scene5(browser)
        record_scene6(browser)
        record_scene7(browser)
        browser.close()

    concatenate_all()

if __name__ == "__main__":
    main()
