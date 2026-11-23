import { resolve } from 'node:path';
import { expect, test } from 'playwright/test';

type AxeResults = {
  violations: Array<{ id: string; impact: string | null; description: string; nodes: Array<{ target: string[]; failureSummary: string | null }> }>;
};

declare global {
  interface Window {
    axe: { _running?: boolean; run: (context: Document | Element, options: unknown) => Promise<AxeResults> };
  }
}

async function expectNoAccessibilityViolations(page: import('playwright/test').Page, scopeSelector?: string) {
  await page.evaluate(async () => {
    const finiteAnimations = document.getAnimations().filter((animation) =>
      animation.effect?.getComputedTiming().endTime !== Infinity,
    );
    await Promise.all(finiteAnimations.map((animation) => animation.finished.catch(() => undefined)));
  });
  if (scopeSelector) {
    await page.waitForFunction(() => typeof window.axe?.run === 'function' && !window.axe._running);
  } else {
    await page.addScriptTag({ path: resolve(process.cwd(), '../node_modules/axe-core/axe.min.js') });
  }
  const results = await page.evaluate((selector) => {
    const context = selector ? document.querySelector(selector) : document;
    if (!context) throw new Error(`Accessibility audit root not found: ${selector}`);
    return window.axe.run(context, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
    });
  }, scopeSelector);
  const violations = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodeCount: violation.nodes.length,
    targets: violation.nodes.slice(0, 3).map((node) => node.target),
  }));
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
}

const user = {
  id: 42,
  email: 'smoke@example.test',
  displayName: 'Smoke Tester',
  timezone: 'Asia/Kolkata',
  createdAt: '2026-01-01T00:00:00.000Z',
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path === '/api/auth/me') {
      await route.fulfill({ status: 401, json: { error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } } });
      return;
    }
    if (path === '/api/auth/login' && request.method() === 'POST') {
      await route.fulfill({ status: 200, json: user });
      return;
    }
    if (path === '/api/auth/logout' && request.method() === 'POST') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    if (path === '/api/transactions/unexpected-quota') {
      await route.fulfill({ status: 200, json: { month: '2026-01', quota: 3, used: 0, remaining: 3, enabled: true } });
      return;
    }
    if (path === '/api/transactions') {
      await route.fulfill({
        status: 200,
        json: { data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } },
      });
      return;
    }
    if (path === '/api/categories') {
      await route.fulfill({ status: 200, json: [] });
      return;
    }
    await route.fulfill({ status: 200, json: {} });
  });
});

test('preserves a protected destination through login and logout', async ({ page }) => {
  await page.goto('/transactions');
  await expect(page.getByRole('heading', { name: 'Sign in to CoinXP' })).toBeVisible();

  await page.getByLabel('Email').fill(user.email);
  await page.locator('#login-password').fill('Secure123!');
  await page.getByRole('button', { name: /sign in/i }).click();

  await expect(page).toHaveURL(/\/transactions$/);
  await expect(page.getByRole('heading', { name: 'Transactions', exact: true })).toBeVisible();
  await expect(page.getByText(user.displayName)).toBeVisible();

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign in to CoinXP' })).toBeVisible();
});

test('shows the responsive navigation on mobile', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'This assertion is intended for a mobile browser project.');

  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await expect(page.getByRole('link', { name: /coinxp/i })).toBeVisible();
});

test('keeps transaction errors recoverable on desktop and mobile', async ({ page }) => {
  let transactionAttempts = 0;
  await page.unrouteAll();
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path === '/api/auth/me') {
      await route.fulfill({ status: 200, json: user });
      return;
    }
    if (path === '/api/transactions' && request.method() === 'GET') {
      transactionAttempts += 1;
      if (transactionAttempts === 1) {
        await route.fulfill({ status: 503, json: { error: { code: 'SERVICE_UNAVAILABLE', message: 'Try again.' } } });
        return;
      }
      await route.fulfill({ status: 200, json: { data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } } });
      return;
    }
    if (path === '/api/categories') {
      await route.fulfill({ status: 200, json: [] });
      return;
    }
    await route.fulfill({ status: 200, json: {} });
  });

  await page.goto('/transactions');
  await expect(page.getByRole('heading', { name: 'Transactions', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Retry');
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('heading', { name: 'No transactions yet' })).toBeVisible();
  expect(transactionAttempts).toBeGreaterThanOrEqual(2);
});

test('login and registration forms pass automated WCAG checks', async ({ page }) => {
  for (const route of ['/login', '/register']) {
    await page.goto(route);
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoAccessibilityViolations(page);
  }
});

test('motion lab flame, medallion, and calendar stories pass automated WCAG checks', async ({ page }) => {
  const storyIds = [
    'motion-lab-streak-flame--interactive',
    'motion-lab-badge-medallion--rare-reveal',
    'motion-lab-streak-calendar--full-year',
  ];

  for (const storyId of storyIds) {
    await page.goto(`http://127.0.0.1:6006/iframe.html?id=${storyId}&viewMode=story`);
    await expect(page.locator('#storybook-root svg').first()).toBeVisible();
    await expectNoAccessibilityViolations(page, '#storybook-root');
    if (!process.env.CI) {
      await expect(page.locator('#storybook-root')).toHaveScreenshot(`${storyId}.png`, {
        animations: 'disabled',
        caret: 'hide',
        scale: 'css',
      });
    }
  }
});
