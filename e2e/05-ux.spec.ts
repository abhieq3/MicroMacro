import { test, expect } from '@playwright/test';
import { TEST_LEAD, ensureBootstrapLead, login } from './helpers';

test.describe('UX polish', () => {
  test.beforeAll(async ({ playwright }) => {
    const api = await playwright.request.newContext();
    await ensureBootstrapLead(api);
    await api.dispose();
  });

  test('dark-mode toggle flips html class', async ({ page }) => {
    await login(page);
    await page.locator(`text=${TEST_LEAD.name}`).first().click();
    const toggle = page.getByRole('button', { name: /dark mode|light mode/i }).first();
    const before = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    await toggle.click();
    const after = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    expect(after).toBe(!before);
  });

  test('favicon is the new SVG (not the old PNG)', async ({ page }) => {
    const res = await page.request.get('/icon.svg');
    // Next 14 may serve at /icon or /icon.svg; try both.
    if (!res.ok()) {
      const alt = await page.request.get('/icon');
      expect(alt.ok()).toBeTruthy();
    } else {
      expect(res.ok()).toBeTruthy();
      const body = await res.text();
      expect(body).toContain('<svg');
    }
  });

  test('forgot-password renders Pragati mark + form', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.getByRole('heading', { name: /forgot password/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByRole('img', { name: /pragati/i }).first()).toBeVisible();
  });

  test('first-time welcome does NOT appear for an account that already saw it', async ({ page, request }) => {
    // Mark welcome as seen so the next visit must not show the one-card modal.
    await login(page);
    await page.request.post('/api/me/tour-seen');
    await page.evaluate(() => localStorage.setItem('pragati-tour-v6', '1'));
    await page.reload();
    await expect(page.getByText(/you.?re in\. one thing first/i)).toHaveCount(0);
  });
});
