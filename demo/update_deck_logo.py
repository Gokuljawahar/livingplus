import re
from playwright.sync_api import sync_playwright

with open('demo/deck.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace .brand-logo and .brand-name CSS with .brand-img
old_css = """.brand-logo {
      width: 44px;
      height: 44px;
      background: linear-gradient(135deg, #2DD4A7 0%, #0EA5E9 100%);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      color: #071116;
      font-size: 24px;
      box-shadow: 0 0 25px rgba(45, 212, 167, 0.4);
    }
    .brand-name {
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #FFFFFF;
    }
    .brand-name span { color: #2DD4A7; }"""

new_css = """.brand-img {
      height: 64px;
      width: auto;
      object-fit: contain;
      border-radius: 12px;
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.12);
      transition: transform 0.2s ease;
    }"""

content = content.replace(old_css, new_css)

# Replace all occurrences of brand divs with brand-img
old_brand = """<div class="brand">
        <div class="brand-logo">L+</div>
        <div class="brand-name">Living<span>Plus</span></div>
      </div>"""

new_brand = """<div class="brand">
        <img src="logo.png" alt="LivingPlus" class="brand-img" />
      </div>"""

content = content.replace(old_brand, new_brand)

with open('demo/deck.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated demo/deck.html with demo/logo.png!")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True)
    page = b.new_page(viewport={'width': 1920, 'height': 1080})
    
    # Slide 1
    page.goto('file:///' + r'C:/Users/Admin/Desktop/Projects/livingplus/demo/deck.html'.replace('\\', '/') + '#slide1')
    page.wait_for_timeout(1000)
    page.screenshot(path='demo/test_slide1.png')
    
    # Slide 3
    page.goto('file:///' + r'C:/Users/Admin/Desktop/Projects/livingplus/demo/deck.html'.replace('\\', '/') + '#slide3')
    page.wait_for_timeout(1000)
    page.screenshot(path='demo/test_slide3.png')
    
    b.close()

print("Saved demo/test_slide1.png and demo/test_slide3.png!")
