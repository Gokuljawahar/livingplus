import { expect, test, type Page } from '@playwright/test';

/** Reads the 6-digit demo code the development API returns (shown as a toast). */
async function demoCode(page: Page): Promise<string> {
  const toast = page.getByText(/Demo code: \d{6}/);
  await expect(toast).toBeVisible();
  return (await toast.textContent())!.match(/\d{6}/)![0];
}

test('a guest verifies their phone, browses seeded PGs and searches', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('98765 43210').fill('9811122233');
  await page.getByRole('button', { name: /send code/i }).click();
  const code = await demoCode(page);
  await page.getByLabel('6-digit verification code').fill(code);
  await page.getByRole('button', { name: /verify & browse/i }).click();

  await expect(page.getByText("Harbour Point Men's PG").first()).toBeVisible();
  await expect(page.getByText('Northstar Student Living').first()).toBeVisible();

  await page.getByPlaceholder(/Search PG name, locality or landmark/).fill('Velachery');
  await expect(page.getByText('Northstar Student Living').first()).toBeVisible();
  await expect(page.getByText("Harbour Point Men's PG")).toHaveCount(0);
});

test('the platform admin signs in and sees every operator', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Mobile number').fill('e2e-admin');
  await page.getByLabel('Password', { exact: true }).fill('E2e@admin-pass1');
  await page.getByRole('button', { name: /sign in/i }).click();

  await expect(page).toHaveURL(/\/pg\/operators/);
  await expect(page.getByText('Palm Grove Women\'s Residence').first()).toBeVisible();
  await page.getByRole('textbox', { name: /search operators/i }).fill('cedar');
  await expect(page.getByText('Cedar House Co-Living').first()).toBeVisible();
  await expect(page.getByText('Palm Grove Women\'s Residence')).toHaveCount(0);
});

test('a resident signs in with a code and opens their stay', async ({ page }) => {
  await page.goto('/pg/resident');
  await page.getByPlaceholder('Phone number').fill('9000000001');
  await page.getByRole('button', { name: /code/i }).first().click();
  const code = await demoCode(page);
  await page.getByLabel('6-digit verification code').fill(code);
  await page.getByRole('button', { name: /verify|sign in|continue/i }).first().click();

  await expect(page.getByText(/Ananya/).first()).toBeVisible();
});
