import time
from playwright.sync_api import sync_playwright

BASE_URL = "https://livingplus-pfpdmrspea-el.a.run.app"

def test_routes():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            headless=True
        )
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()
        page.on("console", lambda msg: print(f"CONSOLE [{msg.type}]:", msg.text))
        page.on("pageerror", lambda err: print("PAGE ERROR:", err))

        page.goto(f"{BASE_URL}/stay/palm-grove-womens-residence", wait_until="domcontentloaded")
        page.fill('input[placeholder="Phone number"]', '9000000001')
        page.click('button:has-text("Send code")')
        time.sleep(3)
        
        # Check all error elements or toasts
        toasts = page.locator('div[role="status"], [class*="toast"], [class*="alert"]').all_inner_texts()
        print("Toasts/Alerts:", toasts)

        browser.close()

if __name__ == "__main__":
    test_routes()
