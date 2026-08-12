import { APIRequestContext, Page, expect } from '@playwright/test';

// Unique-per-run prefix so tests don't collide if the dev server is reused.
const RUN_ID = String(Date.now()).slice(-6);

export const TEST_LEAD = {
  email: `lead-${RUN_ID}@pragati.test`,
  password: 'TestPass!23',
  name: 'Test Lead',
  title: 'Team Lead',
};

export const TEST_LEAD_2 = {
  email: `lead2-${RUN_ID}@pragati.test`,
  password: 'TestPass!23',
  name: 'Second Lead',
  title: 'Team Lead',
};

/** First-run only: register the bootstrap lead. Idempotent — returns true if
 *  this run created the account, false if the workspace was already set up. */
export async function ensureBootstrapLead(api: APIRequestContext) {
  const status = await api.get('/api/system/status');
  const { initialized } = await status.json();
  if (initialized) return false;

  const res = await api.post('/api/auth/register', {
    data: {
      email: TEST_LEAD.email,
      password: TEST_LEAD.password,
      name: TEST_LEAD.name,
      title: TEST_LEAD.title,
    },
  });
  if (!res.ok()) {
    throw new Error(`register failed: ${res.status()} ${await res.text()}`);
  }
  return true;
}

/** Log in via the form and wait for the dashboard. */
export async function login(page: Page, who = TEST_LEAD) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(who.email);
  await page.getByLabel(/password/i).fill(who.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/^\/(?!login)/, { timeout: 15_000 });
}

/** Quick check that all the navigation links in the sidebar work. */
export async function clickEverySidebarLink(page: Page) {
  const links = ['Dashboard', 'Projects', 'Team', 'Settings'];
  for (const label of links) {
    const link = page.getByRole('link', { name: new RegExp(`^${label}`, 'i') }).first();
    if (await link.count()) {
      await link.click();
      // Page must not be in an error state.
      await expect(
        page.locator('text=/internal server error|application error|something went wrong/i'),
      ).toHaveCount(0, { timeout: 5_000 });
    }
  }
}
