import time
from playwright.sync_api import sync_playwright

BASE_URL = "https://livingplus-pfpdmrspea-el.a.run.app"

def test_demo_flow():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            headless=True
        )
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        print("--- SCENE 2: GUEST DISCOVERY ---")
        page.goto(f"{BASE_URL}/", wait_until="networkidle")
        time.sleep(2)
        page.screenshot(path="demo/scene2_guest_home.png")
        
        # Check campus or office filter
        # Let's inspect buttons / select
        filter_btn = page.query_selector('button:has-text("Near my campus or office"), select, [aria-label*="campus" i]')
        print("Filter element:", filter_btn)
        # Try to find Tidel Park
        tidel = page.locator('text=Tidel Park')
        print("Tidel Park locator count:", tidel.count())

        print("--- SCENE 4: OWNER CONSOLE ---")
        page.goto(f"{BASE_URL}/owner/login", wait_until="networkidle")
        page.fill('input[placeholder="Enter mobile number"]', '9555500001')
        page.fill('input[placeholder="••••••••"]', 'rDpNDsOYlD2dLqMlsRlQ')
        page.click('button[type="submit"]')
        page.wait_for_timeout(4000)
        print("Owner URL:", page.url)
        page.screenshot(path="demo/scene4_owner_today.png")

        # Check navigation tabs on Owner
        nav_links = page.locator('nav a, nav button, [role="tab"]').all_inner_texts()
        print("Owner nav items:", nav_links)

        browser.close()

if __name__ == "__main__":
    test_demo_flow()
