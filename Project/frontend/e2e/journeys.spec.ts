import { expect, test, type Page } from '@playwright/test';

/** Reads the 6-digit demo code the development API returns (shown as a toast). */
async function demoCode(page: Page): Promise<string> {
  const toast = page.getByText(/Demo code: \d{6}/);
  await expect(toast).toBeVisible();
  return (await toast.textContent())!.match(/\d{6}/)![0];
}

test('a guest browses, opens full PG detail page, and verifies once to request a bed', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText("Harbour Point Men's PG").first()).toBeVisible();
  await expect(page.getByText('Northstar Student Living').first()).toBeVisible();

  await page.getByPlaceholder(/Search PG name, locality or landmark/).fill('Velachery');
  await expect(page.getByText('Northstar Student Living').first()).toBeVisible();
  await expect(page.getByText("Harbour Point Men's PG")).toHaveCount(0);

  // Card -> full PG detail overview (/pg/:slug) -> three steps: bed, details, verify.
  await page.getByRole('link', { name: /Northstar Student Living/ }).first().click();
  await expect(page).toHaveURL(/\/pg\/northstar-student-living$/);
  await expect(page.getByRole('heading', { name: 'Northstar Student Living' })).toBeVisible();
  await expect(page.getByText('All facilities & amenities')).toBeVisible();
  await expect(page.getByText('Rooms & sharing options')).toBeVisible();
  await expect(page.getByRole('button', { name: /Verify phone to view contact/i })).toBeVisible();

  await page.getByRole('button', { name: 'Request a bed' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('Step 1 of 3 · Choose a bed')).toBeVisible();
  await sheet.getByLabel('Available bed').selectOption({ index: 1 });
  await sheet.getByLabel('Move-in date').fill('2026-12-20');
  await sheet.getByRole('button', { name: 'Next' }).click();
  await sheet.getByLabel('Full name').fill('E2E Guest');
  await sheet.getByLabel('Phone', { exact: true }).fill('9811122233');
  await sheet.getByRole('button', { name: 'Next' }).click();
  await expect(sheet.getByText('Step 3 of 3 · Verify your phone')).toBeVisible();
  await sheet.getByRole('button', { name: /send code/i }).click();
  await sheet.getByLabel(/verification code/i).fill(await demoCode(page));
  await sheet.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(sheet.getByText(/is verified/)).toBeVisible();
  await sheet.getByRole('button', { name: 'Send request' }).click();

  // Verifying in the form signed the guest in: My requests opens without a second code.
  await expect(page).toHaveURL(/\/requests$/);
  await expect(page.getByText('Northstar Student Living').first()).toBeVisible();
  await expect(page.getByText(/pending/i).first()).toBeVisible();
});

test('VibeCheck matches a guest with the residents of each room on the PG detail page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Palm Grove Women's Residence/ }).first().click();
  await expect(page).toHaveURL(/\/pg\/palm-grove-womens-residence$/);

  await page.getByRole('button', { name: 'Take VibeCheck' }).click();
  const sheet = page.getByRole('dialog');
  // The test server runs without AI, so use the quick questions (the AI path is covered by unit tests).
  await sheet.getByRole('button', { name: 'Answer quick questions instead' }).click();
  for (const group of await sheet.getByRole('group').all()) await group.locator('label').first().click();
  await expect(sheet.getByText(/^(\d) of \1 answered$/)).toBeVisible();
  // Palm Grove has no AC rooms, so the quick questions leave out room temperature.
  await expect(sheet.getByText('What room temperature do you like?')).toHaveCount(0);
  await sheet.getByRole('button', { name: 'See my matches' }).click();
  // Ananya (seeded) shares Room 101: early sleeper, tidy, quiet, like this guest.
  await expect(sheet.getByText('Beds, best match first')).toBeVisible();
  await expect(sheet.getByText(/% match$/).first()).toBeVisible();
  await sheet.getByRole('radio').first().check();
  await expect(sheet.getByText(/% VibeCheck match with the resident of this room/)).toBeVisible();
  await expect(sheet.getByText('You both sleep before 11 pm', { exact: true })).toBeVisible();
  await expect(sheet.getByText('Ananya')).toHaveCount(0);
});

test('owner submits inquiry on landing page, ops onboards via /admin, and PG goes live on marketplace', async ({ page }) => {
  // 1. Owner submits "List Your PG" inquiry from the landing page
  await page.goto('/');
  await page.getByRole('button', { name: /List Your PG/i }).first().click();
  const leadDialog = page.getByRole('dialog');
  await leadDialog.getByPlaceholder(/Suresh Krishnan/i).fill('E2E Partner Owner');
  await leadDialog.getByPlaceholder(/98400 12345/i).fill('9877711223');
  await leadDialog.getByPlaceholder(/GreenLeaf Executive Stay/i).fill('Emerald Crest Residency');
  await leadDialog.getByPlaceholder(/Velachery, OMR/i).fill('Madipakkam');
  await leadDialog.getByPlaceholder(/Door no, street name/i).fill('9, Medavakkam Main Road');
  await leadDialog.getByRole('button', { name: /Request free onboarding call/i }).click();
  await expect(leadDialog.getByText('We received your PG details!')).toBeVisible();
  await leadDialog.getByRole('button', { name: /Back to marketplace/i }).click();

  // 2. Ops signs in at /admin/login, picks up the lead, and publishes the PG
  await page.goto('/admin/login');
  await page.getByLabel(/Mobile number or Ops email/i).fill('9555500099');
  await page.getByLabel('Password', { exact: true }).fill('Admin@e2e-pass1');
  await page.getByRole('button', { name: /Sign in to Onboarding Ops/i }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await expect(page.getByText('Emerald Crest Residency').first()).toBeVisible();
  const leadCard = page.locator('article', { hasText: 'Emerald Crest Residency' });
  await leadCard.getByRole('button', { name: /Start Onboarding/i }).click();
  await expect(page).toHaveURL(/\/admin\/onboard$/);

  await page.getByPlaceholder(/Calm lake-view PG/i).fill('Brand new rooms near Velachery & Madipakkam');
  await page.getByRole('button', { name: /Publish Live to Marketplace/i }).click();
  await expect(page.getByText('Emerald Crest Residency is live!')).toBeVisible();

  // 3. Guest discovers the newly published PG on / and opens its detail page
  await page.goto('/');
  await expect(page.getByText('Emerald Crest Residency').first()).toBeVisible();
  await page.getByRole('link', { name: /Emerald Crest Residency/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Emerald Crest Residency' })).toBeVisible();
  await expect(page.getByText('Inspected & Listed by Living Plus')).toBeVisible();
  await expect(page.getByText('Brand new rooms near Velachery & Madipakkam')).toBeVisible();
});

test('My requests asks a new visitor to verify their phone', async ({ page }) => {
  await page.goto('/requests');
  await expect(page.getByRole('heading', { name: 'My booking requests' })).toBeVisible();
  await expect(page.getByRole('button', { name: /send code/i })).toBeVisible();
});

test('a resident finds their PG, signs in on its site and opens their stay', async ({ page }) => {
  await page.goto('/stay');
  await page.getByPlaceholder('PG name or locality').fill('palm');
  await page.getByRole('link', { name: /Palm Grove Women's Residence/ }).click();
  await expect(page).toHaveURL(/\/stay\/palm-grove-womens-residence$/);
  await expect(page.getByRole('heading', { name: "Palm Grove Women's Residence" })).toBeVisible();

  await page.getByPlaceholder('Phone number').fill('9000000001');
  await page.getByRole('button', { name: /code/i }).first().click();
  const code = await demoCode(page);
  await page.getByLabel('6-digit verification code').fill(code);
  await page.getByRole('button', { name: /verify|sign in|continue/i }).first().click();

  await expect(page.getByText(/Ananya/).first()).toBeVisible();
});

test('old addresses land in the right area', async ({ page }) => {
  await page.goto('/login');
  await expect(page).toHaveURL(/\/owner\/login$/);
  await page.goto('/pg/resident');
  await expect(page).toHaveURL(/\/stay$/);
  await page.goto('/stay/no-such-pg');
  await expect(page.getByText('PG site not found')).toBeVisible();
});
