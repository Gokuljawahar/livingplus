import time, json
from playwright.sync_api import sync_playwright

BASE_URL = "https://livingplus-pfpdmrspea-el.a.run.app"

def test_resident_mock():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            headless=True
        )
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        # Intercept tenant API calls
        def handle_stays(route):
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps([{
                    "id": "stay-ananya-1",
                    "name": "Ananya Rao",
                    "status": "ACTIVE",
                    "monthlyRent": 9800,
                    "depositAmount": 9800,
                    "depositReceived": 9800,
                    "moveInDate": "2026-10-01T00:00:00.000Z",
                    "property": {
                        "id": "prop-palm-grove",
                        "name": "Palm Grove Women's Residence",
                        "address": "42 Canal Bank Road, Adyar",
                        "locality": "Adyar",
                        "city": "Chennai"
                    },
                    "bed": {
                        "label": "Bed A",
                        "room": {
                            "roomNumber": "101",
                            "roomType": "DOUBLE",
                            "foodIncluded": False,
                            "foodCharge": 0
                        }
                    },
                    "rentEntries": [
                        {
                            "id": "rent-1",
                            "period": "2026-11",
                            "entryType": "RENT",
                            "amount": 9800,
                            "paidAmount": 0,
                            "status": "OVERDUE",
                            "dueDate": "2026-11-05"
                        },
                        {
                            "id": "rent-2",
                            "period": "2026-11",
                            "entryType": "ELECTRICITY",
                            "amount": 650,
                            "paidAmount": 0,
                            "status": "OVERDUE",
                            "dueDate": "2026-11-10"
                        }
                    ]
                }])
            )

        def handle_notifications(route):
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps({
                    "notifications": [
                        {
                            "id": "notif-1",
                            "type": "NOTICE",
                            "title": "Water Tank Cleaning Notice",
                            "message": "Water is off this Sunday from 10 to 1 for tank cleaning.",
                            "createdAt": "2026-11-20T10:00:00.000Z"
                        }
                    ]
                })
            )

        def handle_maintenance(route):
            route.fulfill(status=200, content_type="application/json", body="[]")

        def handle_claims(route):
            route.fulfill(status=200, content_type="application/json", body="[]")

        page.route("**/pg/tenant/stays", handle_stays)
        page.route("**/pg/tenant/notifications", handle_notifications)
        page.route("**/pg/tenant/maintenance", handle_maintenance)
        page.route("**/pg/tenant/payment-claims", handle_claims)

        # 1. Visit the site to establish origin
        page.goto(f"{BASE_URL}/stay/palm-grove-womens-residence", wait_until="domcontentloaded")
        
        # 2. Set localStorage on this origin
        page.evaluate("""() => {
            localStorage.setItem('residentToken', 'mock-demo-token');
            localStorage.setItem('residentSite', 'palm-grove-womens-residence');
            localStorage.setItem('residentUser', JSON.stringify({
                id: 'pg-demo-tenant-ananya',
                name: 'Ananya Rao',
                phone: '9000000001',
                role: 'PG_TENANT'
            }));
        }""")
        
        # 3. Reload so AuthProvider and ResidentPortal read the stored session!
        page.reload(wait_until="networkidle")
        time.sleep(2)
        print("Reloaded URL:", page.url)
        page.screenshot(path="demo/scene5_resident_reloaded.png")
        
        visible_text = page.locator('body').inner_text()
        print("Page text preview:", visible_text[:300].replace('\n', ' | '))

        browser.close()

if __name__ == "__main__":
    test_resident_mock()
