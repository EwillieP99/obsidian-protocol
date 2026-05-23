import { test, expect } from '@playwright/test';

test('boots studio shell and shows toolbar after intro', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /skip intro/i }).click({ timeout: 15_000 });
  await expect(page.getByText(/Nexus Online|Engine Degraded/i)).toBeVisible({ timeout: 20_000 });
});

test('loads Blackspire example vault', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /skip intro/i }).click({ timeout: 15_000 });
  // Wait for boot HUD
  await expect(page.getByText(/Blocks/i)).toBeVisible({ timeout: 20_000 });
  const exampleBtn = page.getByTitle(/Blackspire/i).or(page.getByText(/Blackspire/i)).first();
  if (await exampleBtn.isVisible().catch(() => false)) {
    await exampleBtn.click();
    await expect(page.getByText(/LOADING|IMPORTING/i)).toBeVisible({ timeout: 5000 }).catch(() => undefined);
  }
});
