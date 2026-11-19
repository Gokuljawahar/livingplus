import { expect, test, type Page } from '@playwright/test';

const OWNER = { phone: '9555500001', password: 'Owner@e2e-pass1' };
const OWNER_VIEWS = [
  'Overview', 'Properties & Beds', 'Bookings', 'Room changes', 'Tenants & KYC', 'Activity', 'Maintenance',
  'Rent Ledger', 'Payment claims', 'Expenses', 'Utilities', 'Reports', 'Staff'
];
const shotDir = process.env.E2E_SCREENSHOT_DIR;

/** Fails the test on browser errors, crashed scripts or server errors. */
function watchForErrors(page: Page): () => void {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) problems.push(`console: ${message.text()}`); });
  page.on('response', (response) => { if (response.status() >= 500) problems.push(`HTTP ${response.status()} ${response.url()}`); });
  return () => expect(problems, problems.join('\n')).toEqual([]);
}

async function shot(page: Page, name: string) {
  if (shotDir) await page.screenshot({ path: `${shotDir}/${name}.png`, fullPage: true });
}

test('the owner opens every workspace view and logs an expense', async ({ page }) => {
  const assertClean = watchForErrors(page);
  await page.goto('/owner/login');
  await page.getByLabel('Mobile number').fill(OWNER.phone);
  await page.getByLabel('Password', { exact: true }).fill(OWNER.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/owner$/);

  const nav = page.locator('aside');
  for (const view of OWNER_VIEWS) {
    await nav.getByRole('button', { name: view, exact: true }).click();
    await page.waitForLoadState('networkidle');
    await shot(page, `owner-${view.toLowerCase().replace(/[^a-z]+/g, '-')}`);
  }
  await expect(page.getByText("Harbour Point Men's PG").first()).toBeAttached();

  await nav.getByRole('button', { name: 'Expenses', exact: true }).click();
  await page.getByPlaceholder('Amount').fill('1234');
  await page.getByPlaceholder('Note (optional)').fill('E2E plumbing');
  await page.getByRole('button', { name: 'Log expense' }).click();
  await expect(page.getByText('E2E plumbing').first()).toBeVisible();
  await shot(page, 'owner-expense-logged');

  // Schema validation still guards the form when the browser's checks are bypassed.
  await page.locator('form', { has: page.getByRole('button', { name: 'Log expense' }) }).evaluate((form: HTMLFormElement) => { form.noValidate = true; });
  await page.getByPlaceholder('Amount').fill('');
  await page.getByRole('button', { name: 'Log expense' }).click();
  await expect(page.getByText('Enter the expense amount')).toBeVisible();

  await nav.getByRole('button', { name: 'Properties & Beds', exact: true }).click();
  await page.getByLabel('Room number').fill('E2E-1');
  await page.getByLabel('Monthly rent').fill('7000');
  await page.getByLabel('Number of beds').fill('2');
  await page.getByRole('button', { name: 'Add room', exact: true }).click();
  await expect(page.getByText('Room and beds added')).toBeVisible();
  await shot(page, 'owner-room-added');

  await nav.getByRole('button', { name: 'Maintenance', exact: true }).click();
  await page.getByPlaceholder('Issue title').fill('E2E fan noise');
  await page.getByPlaceholder('Describe the issue').fill('Ceiling fan rattles in room 101.');
  await page.getByRole('button', { name: 'Create ticket' }).click();
  await expect(page.getByText('E2E fan noise').first()).toBeVisible();
  await shot(page, 'owner-ticket-created');
  assertClean();
});

test('a resident opens the portal sections after signing in', async ({ page }) => {
  const assertClean = watchForErrors(page);
  await page.goto('/stay/palm-grove-womens-residence');
  await page.getByPlaceholder('Phone number').fill('9000000001');
  await page.getByRole('button', { name: /code/i }).first().click();
  const toast = page.getByText(/Demo code: \d{6}/);
  await expect(toast).toBeVisible();
  const code = (await toast.textContent())!.match(/\d{6}/)![0];
  await page.getByLabel('6-digit verification code').fill(code);
  await page.getByRole('button', { name: /verify|sign in|continue/i }).first().click();
  await expect(page.getByText(/Ananya/).first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  await shot(page, 'resident-portal');

  const nav = page.locator('aside');
  for (const section of ['Money', 'Food', 'Services', 'Maintenance', 'Room change', 'Notifications', 'Profile', 'My stays']) {
    await nav.getByRole('button', { name: section, exact: true }).click();
    await page.waitForLoadState('networkidle');
    await shot(page, `resident-${section.toLowerCase().replace(/[^a-z]+/g, '-')}`);
  }

  await nav.getByRole('button', { name: 'Maintenance', exact: true }).click();
  await page.getByRole('button', { name: 'Report an issue' }).first().click();
  await page.getByPlaceholder('What needs attention?').fill('E2E window latch');
  await page.getByPlaceholder('Describe the issue and where it is.').fill('Bedroom window latch is broken.');
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByText('E2E window latch').first()).toBeVisible();
  await shot(page, 'resident-ticket-filed');
  assertClean();
});
