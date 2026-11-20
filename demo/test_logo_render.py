import base64
from playwright.sync_api import sync_playwright

with open('demo/logo_cropped.png', 'rb') as f:
    b64_cropped = base64.b64encode(f.read()).decode('utf-8')

with open('Project/frontend/src/assets/logo.png', 'rb') as f:
    b64_full = base64.b64encode(f.read()).decode('utf-8')

html = f'''<!DOCTYPE html>
<html>
<body style="background: #0F2027; padding: 40px; font-family: sans-serif; color: white;">
  <h2>Option 1: Cropped logo.png (height 64px)</h2>
  <div style="display: flex; align-items: center; gap: 20px; background: rgba(255,255,255,0.05); padding: 15px 25px; border-radius: 12px;">
    <img src="data:image/png;base64,{b64_cropped}" style="height: 64px; border-radius: 8px;" />
    <span style="font-size: 20px; color: #94A3B8;">Top Bar Header</span>
  </div>

  <h2 style="margin-top: 40px;">Option 2: Cropped logo.png (height 80px)</h2>
  <div style="display: flex; align-items: center; gap: 20px; background: rgba(255,255,255,0.05); padding: 15px 25px; border-radius: 12px;">
    <img src="data:image/png;base64,{b64_cropped}" style="height: 80px; border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);" />
    <span style="font-size: 20px; color: #94A3B8;">Top Bar Header</span>
  </div>

  <h2 style="margin-top: 40px;">Option 3: Full uncropped logo.png (height 70px)</h2>
  <div style="display: flex; align-items: center; gap: 20px; background: rgba(255,255,255,0.05); padding: 15px 25px; border-radius: 12px;">
    <img src="data:image/png;base64,{b64_full}" style="height: 70px; border-radius: 8px;" />
    <span style="font-size: 20px; color: #94A3B8;">Top Bar Header</span>
  </div>
</body>
</html>'''

with open('demo/test_logo_opts.html', 'w', encoding='utf-8') as f:
    f.write(html)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', headless=True)
    page = b.new_page(viewport={'width': 1200, 'height': 800})
    page.goto('file:///' + r'C:/Users/Admin/Desktop/Projects/livingplus/demo/test_logo_opts.html'.replace('\\', '/'))
    page.screenshot(path='demo/test_logo_opts.png')
    b.close()

print('Comparison saved to demo/test_logo_opts.png!')
