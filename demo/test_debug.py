import time, json, re
from playwright.sync_api import sync_playwright

BASE_URL = "https://livingplus-pfpdmrspea-el.a.run.app"

def test_debug():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            headless=True
        )
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        
        context.route(re.compile(r".*/api/pg/tenant/.*"), lambda route: route.fulfill(
            status=200, content_type="application/json", body="[]"
        ))

        page = context.new_page()

        page.goto(f"{BASE_URL}/stay/palm-grove-womens-residence")
        
        page.evaluate("""() => {
            const token = 'demo-token';
            const user = { id: 'pg-demo-tenant-ananya', name: 'Ananya Rao', phone: '9000000001', role: 'PG_TENANT' };
            localStorage.setItem('residentToken', token);
            localStorage.setItem('residentUser', JSON.stringify(user));
            localStorage.setItem('residentSite', 'palm-grove-womens-residence');
        }""")
        
        page.reload(wait_until="networkidle")
        time.sleep(2)
        
        print("Body text preview:")
        print(page.locator('body').inner_text()[:400].replace('\n', ' | '))

        browser.close()

if __name__ == "__main__":
    test_debug()
