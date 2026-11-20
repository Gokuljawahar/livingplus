import os
from playwright.sync_api import sync_playwright

path = os.path.abspath("demo/deck.html").replace("\\", "/")
with sync_playwright() as p:
    b = p.chromium.launch(
        executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        headless=True
    )
    page = b.new_page(viewport={'width': 1920, 'height': 1080})
    page.goto(f"file:///{path}#slide1")
    page.screenshot(path="demo/test_slide1.png")
    page.goto(f"file:///{path}#slide3")
    page.screenshot(path="demo/test_slide3.png")
    b.close()
    print("SLIDES OK")
