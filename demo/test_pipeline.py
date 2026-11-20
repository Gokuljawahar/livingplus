import os, time, subprocess
import imageio_ffmpeg
from moviepy import AudioFileClip
from playwright.sync_api import sync_playwright

FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()
RECORDINGS_DIR = os.path.abspath("demo/raw_videos")
os.makedirs(RECORDINGS_DIR, exist_ok=True)
SLIDES_URL = f"file:///{os.path.abspath('demo/deck.html').replace('\\', '/')}"

def test_scene1():
    audio_path = os.path.abspath("demo/audio/scene1_hook.mp3")
    audio_duration = AudioFileClip(audio_path).duration
    print(f"Scene 1 audio duration: {audio_duration:.2f}s")

    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            headless=True
        )
        context = browser.new_context(
            record_video_dir=RECORDINGS_DIR,
            record_video_size={'width': 1920, 'height': 1080},
            viewport={'width': 1920, 'height': 1080}
        )
        page = context.new_page()

        # Slide 1 for half the duration
        page.goto(f"{SLIDES_URL}#slide1")
        time.sleep(audio_duration * 0.45)

        # Switch to Slide 3
        page.goto(f"{SLIDES_URL}#slide3")
        time.sleep(audio_duration * 0.55 + 1.0)

        video_path = page.video.path()
        page.close()
        context.close()
        browser.close()

    print(f"Raw video recorded: {video_path}")
    
    # Merge video and audio with ffmpeg
    out_scene1 = os.path.abspath("demo/scene1_final.mp4")
    cmd = [
        FFMPEG_EXE, "-y",
        "-i", video_path,
        "-i", audio_path,
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        out_scene1
    ]
    subprocess.run(cmd, check=True)
    print(f"Scene 1 merged successfully: {out_scene1}")

if __name__ == "__main__":
    test_scene1()
