"""Re-record slide-based scenes (1, 6, 7) using updated deck.html with new logo,
then concatenate all 7 scenes into demo_video.mp4"""
import os, time, subprocess
import imageio_ffmpeg
from moviepy import AudioFileClip
from playwright.sync_api import sync_playwright

FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__)))
RECORDINGS_DIR = os.path.join(BASE_DIR, "raw_videos")
os.makedirs(RECORDINGS_DIR, exist_ok=True)

DECK_PATH = os.path.join(BASE_DIR, "deck.html").replace("\\", "/")
SLIDES_URL = f"file:///{DECK_PATH}"

AUDIO_DIR = os.path.join(BASE_DIR, "audio")

def merge_video_audio(video_path, audio_path, output_path):
    cmd = [
        FFMPEG_EXE, "-y",
        "-i", video_path,
        "-i", audio_path,
        "-r", "30",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-ar", "44100", "-b:a", "192k",
        "-shortest", output_path
    ]
    print(f"  Merging → {os.path.basename(output_path)}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print("FFMPEG ERROR:", result.stderr[-2000:])
        raise RuntimeError("merge failed")
    size = os.path.getsize(output_path) / 1024 / 1024
    print(f"  Done: {size:.2f} MB")

def record_scene1(browser):
    print("\n--- Recording Scene 1 (Hook/Intro) ---")
    audio_path = os.path.join(AUDIO_DIR, "scene1_hook.mp3")
    duration = AudioFileClip(audio_path).duration
    print(f"  Audio duration: {duration:.2f}s")
    context = browser.new_context(
        record_video_dir=RECORDINGS_DIR,
        record_video_size={"width": 1920, "height": 1080},
        viewport={"width": 1920, "height": 1080}
    )
    page = context.new_page()
    # Slide 1 (hook): ~16 seconds
    page.goto(f"{SLIDES_URL}#slide1")
    page.wait_for_load_state("networkidle")
    time.sleep(16.0)
    # Slide 3 (problem statement): remaining time
    page.goto(f"{SLIDES_URL}#slide3")
    page.wait_for_load_state("networkidle")
    remaining = max(3.0, duration - 15.0)
    time.sleep(remaining)
    video_path = page.video.path()
    page.close()
    context.close()
    out = os.path.join(BASE_DIR, "scene1_final.mp4")
    merge_video_audio(video_path, audio_path, out)

def record_scene6(browser):
    print("\n--- Recording Scene 6 (Google Tech) ---")
    audio_path = os.path.join(AUDIO_DIR, "scene6_google_tech.mp3")
    duration = AudioFileClip(audio_path).duration
    print(f"  Audio duration: {duration:.2f}s")
    context = browser.new_context(
        record_video_dir=RECORDINGS_DIR,
        record_video_size={"width": 1920, "height": 1080},
        viewport={"width": 1920, "height": 1080}
    )
    page = context.new_page()
    # Slide 7 (tech stack): ~22 seconds
    page.goto(f"{SLIDES_URL}#slide7")
    page.wait_for_load_state("networkidle")
    time.sleep(22.0)
    # Slide 8 (AI features): remaining time
    page.goto(f"{SLIDES_URL}#slide8")
    page.wait_for_load_state("networkidle")
    remaining = max(3.0, duration - 21.0)
    time.sleep(remaining)
    video_path = page.video.path()
    page.close()
    context.close()
    out = os.path.join(BASE_DIR, "scene6_final.mp4")
    merge_video_audio(video_path, audio_path, out)

def record_scene7(browser):
    print("\n--- Recording Scene 7 (Business Close) ---")
    audio_path = os.path.join(AUDIO_DIR, "scene7_business_close.mp3")
    duration = AudioFileClip(audio_path).duration
    print(f"  Audio duration: {duration:.2f}s")
    context = browser.new_context(
        record_video_dir=RECORDINGS_DIR,
        record_video_size={"width": 1920, "height": 1080},
        viewport={"width": 1920, "height": 1080}
    )
    page = context.new_page()
    # Slide 4 (solution overview): ~15s
    page.goto(f"{SLIDES_URL}#slide4")
    page.wait_for_load_state("networkidle")
    time.sleep(15.0)
    # Slide 12 (traction/metrics): ~14s
    page.goto(f"{SLIDES_URL}#slide12")
    page.wait_for_load_state("networkidle")
    time.sleep(14.0)
    # Slide 13 (CTA/close): remaining time
    page.goto(f"{SLIDES_URL}#slide13")
    page.wait_for_load_state("networkidle")
    remaining = max(3.0, duration - 28.0)
    time.sleep(remaining)
    video_path = page.video.path()
    page.close()
    context.close()
    out = os.path.join(BASE_DIR, "scene7_final.mp4")
    merge_video_audio(video_path, audio_path, out)

def concatenate_all():
    print("\n--- Concatenating all 7 scenes → demo_video.mp4 ---")
    scenes = [os.path.join(BASE_DIR, f"scene{i}_final.mp4") for i in range(1, 8)]
    for s in scenes:
        if not os.path.exists(s):
            raise FileNotFoundError(f"Missing: {s}")
        print(f"  ✓ {os.path.basename(s)} ({os.path.getsize(s)/1024/1024:.2f} MB)")
    
    output = os.path.join(BASE_DIR, "demo_video.mp4")
    cmd = [FFMPEG_EXE, "-y"]
    for s in scenes:
        cmd.extend(["-i", s])
    n = len(scenes)
    filter_str = "".join([f"[{i}:v:0][{i}:a:0]" for i in range(n)])
    filter_str += f"concat=n={n}:v=1:a=1[outv][outa]"
    cmd.extend([
        "-filter_complex", filter_str,
        "-map", "[outv]", "-map", "[outa]",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30",
        "-c:a", "aac", "-ar", "44100", "-b:a", "192k",
        output
    ])
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print("FFMPEG CONCAT ERROR:", result.stderr[-3000:])
        raise RuntimeError("concat failed")
    size = os.path.getsize(output) / 1024 / 1024
    print(f"\n✅ demo_video.mp4 created: {size:.2f} MB")
    print(f"   Path: {output}")

if __name__ == "__main__":
    print("=== LivingPlus Demo Video — Logo Update ===")
    print(f"Slides URL: {SLIDES_URL}")
    print(f"FFmpeg: {FFMPEG_EXE}")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            headless=True
        )
        record_scene1(browser)
        record_scene6(browser)
        record_scene7(browser)
        browser.close()
    
    concatenate_all()
    
    print("\n=== All done! ===")
    print("Output: demo/demo_video.mp4")
