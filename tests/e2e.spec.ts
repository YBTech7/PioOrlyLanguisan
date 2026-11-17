import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { name: '320px', width: 320, height: 640 },
  { name: '375px', width: 375, height: 812 },
  { name: '390px', width: 390, height: 844 },
  { name: '768px', width: 768, height: 1024 },
  { name: '1024px', width: 1024, height: 768 },
  { name: '1440px', width: 1440, height: 900 },
  { name: '1920px', width: 1920, height: 1080 },
];

test.describe('Pio Languisan Portfolio Platform E2E', () => {
  test('renders cleanly with zero console/page/asset errors and intact original portrait', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedAssetResponses: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });
    page.on('response', (res) => {
      const url = res.url();
      // Static vite preview intentionally has no /api/* backend; only asset/html requests must succeed
      if (!url.includes('/api/') && res.status() >= 400) {
        failedAssetResponses.push(`${res.status()} ${url}`);
      }
    });

    await page.route('**/api/content', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    await page.goto('./', { waitUntil: 'networkidle' });

    await expect(page).toHaveTitle(/Pio Languisan/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Operational discipline and intelligent systems'
    );

    // Scroll through page so lazy-loaded visual assets load cleanly
    await page.locator('#about img').scrollIntoViewIfNeeded();
    await page.locator('#projects img').first().scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, 0));

    // Verify all images (original portrait + 3 visual assets) decoded successfully
    const imageStates = await page.evaluate(async () => {
      const imgs = Array.from(document.querySelectorAll('img'));
      await Promise.all(
        imgs.map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise((resolve) => {
                img.addEventListener('load', resolve, { once: true });
                img.addEventListener('error', resolve, { once: true });
              })
        )
      );
      return imgs.map((img) => ({
        alt: img.alt,
        src: img.getAttribute('src') || '',
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      }));
    });

    expect(imageStates.length).toBeGreaterThanOrEqual(5);
    for (const img of imageStates) {
      expect(img.complete, `Image not complete: ${img.src}`).toBe(true);
      expect(img.naturalWidth, `Image broken (naturalWidth 0): ${img.src}`).toBeGreaterThan(0);
    }

    // Verify original portrait preserves static non-distorted CSS rules
    const portrait = page.locator('img.profile-photo');
    await expect(portrait).toBeVisible();
    const portraitStyles = await portrait.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        borderRadius: style.borderRadius,
        filter: style.filter,
        transform: style.transform,
        animationName: style.animationName,
        opacity: style.opacity,
      };
    });
    expect(portraitStyles.borderRadius).toBe('0px');
    expect(portraitStyles.filter).toBe('none');
    expect(portraitStyles.transform).toBe('none');
    expect(portraitStyles.animationName).toBe('none');
    expect(portraitStyles.opacity).toBe('1');

    // Verify zero console errors, page errors, and broken assets
    expect(consoleErrors, `Console errors: ${consoleErrors.join('\n')}`).toEqual([]);
    expect(pageErrors, `Page errors: ${pageErrors.join('\n')}`).toEqual([]);
    expect(failedAssetResponses, `Failed asset HTTP responses: ${failedAssetResponses.join('\n')}`).toEqual([]);
  });

  test('supports interactive tier switching, project filtering, modal/Esc, FAQ toggle, and anchor scroll margin', async ({
    page,
  }) => {
    await page.route('**/api/content', (route) =>
      route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' })
    );
    await page.goto('./', { waitUntil: 'networkidle' });

    // Skip link & semantic landmarks
    const skipLink = page.getByRole('link', { name: 'Skip to main content' });
    await skipLink.focus();
    await expect(skipLink).toBeFocused();
    await expect(page.locator('main#main-content')).toBeVisible();

    // Check section scroll-mt-20
    const aboutScrollMargin = await page
      .locator('#about')
      .evaluate((el) => window.getComputedStyle(el).scrollMarginTop);
    expect(aboutScrollMargin).toBe('80px');

    // Client Tier tablist switching
    const enterpriseTab = page.getByRole('tab', { name: 'Enterprise Clients' });
    await enterpriseTab.click();
    await expect(enterpriseTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Multi-Tier Escalation Consistency')).toBeVisible();

    // Project domain filter
    await page.getByRole('button', { name: 'Data Analytics', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Executive Operations & SLA Telemetry Hub' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'AI-Assisted Client Intake & Service Scoping Engine' })
    ).toHaveCount(0);

    await page.getByRole('button', { name: 'All', exact: true }).click();

    // Open project modal and close with Escape
    await page.getByRole('button', { name: 'Inspect Blueprint Details' }).first().click();
    const projectDialog = page.getByRole('dialog');
    await expect(projectDialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(projectDialog).toHaveCount(0);

    // FAQ accordion toggle
    const secondFaq = page.getByRole('button', {
      name: /Can multiple service pillars be combined/i,
    });
    await expect(secondFaq).toHaveAttribute('aria-expanded', 'false');
    await secondFaq.click();
    await expect(secondFaq).toHaveAttribute('aria-expanded', 'true');
  });

  test('validates consultation submission, AI scope + drawer fallbacks, and Admin Portal without disclosed passcode', async ({
    page,
  }) => {
    await page.route('**/api/content', (route) =>
      route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' })
    );

    await page.route('**/api/inquiries', async (route) => {
      const payload = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          inquiry: {
            id: 'INQ-2026-TEST1234',
            ...payload,
            status: 'New',
            createdAt: '2026-11-17T12:00:00.000Z',
          },
        }),
      });
    });

    await page.route('**/api/assistant/scope', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          scope: {
            recommendedTier: 'smb',
            recommendedService: 'data-analytics',
            recommendedTimeline: 'Within 30 days',
            executiveSummary: 'Consolidate weekly spreadsheets into a single SLA reporting model.',
            actionPlan: ['Audit data sources', 'Standardize KPI metrics', 'Deploy executive dashboard'],
          },
        }),
      });
    });

    await page.route('**/api/assistant', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'AI Service Advisor is not configured on this server.' }),
      });
    });

    await page.goto('./', { waitUntil: 'networkidle' });

    // AI Scope Builder -> apply to form
    await page.locator('#ai-scope-input').fill('We need cleaner SLA spreadsheets and support KPIs');
    await page.getByRole('button', { name: 'Generate Scope' }).click();
    await expect(page.getByText(/Consolidate weekly spreadsheets/i)).toBeVisible();
    await page.getByRole('button', { name: 'Apply to Consultation Form' }).click();

    // Form validation rejects invalid email
    await page.locator('#consult-name').fill('Jordan Taylor');
    await page.locator('#consult-email').fill('bad-email');
    await page.getByRole('button', { name: 'Submit Consultation Request' }).click();
    await expect(page.getByRole('alert')).toContainText('valid work or personal email');

    // Valid submission succeeds
    await page.locator('#consult-email').fill('jordan@acme-ops.example');
    await page.getByRole('button', { name: 'Submit Consultation Request' }).click();
    await expect(page.getByText('INQ-2026-TEST1234')).toBeVisible();

    // AI Advisor Drawer shows clean unavailable message when backend returns 503
    await page.getByRole('button', { name: 'Open Gemini Service Advisor' }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await drawer.getByLabel('Ask Service Guidance Advisor').fill('How can you help our support team?');
    await drawer.getByRole('button', { name: 'Send message' }).click();
    await expect(drawer.getByRole('alert')).toContainText('not configured');
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);

    // Admin Portal does NOT disclose hardcoded passcode
    await page.getByRole('button', { name: 'Admin Console' }).click();
    const adminDialog = page.getByRole('dialog');
    await expect(adminDialog).toBeVisible();
    const dialogText = await adminDialog.innerText();
    expect(dialogText).not.toContain('PL-EXEC-2026');
    await page.keyboard.press('Escape');
  });

  for (const vp of VIEWPORTS) {
    test(`has no horizontal overflow at ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
      await page.route('**/api/content', (route) =>
        route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' })
      );
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('./', { waitUntil: 'networkidle' });

      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth - document.documentElement.clientWidth;
      });
      expect(overflow, `Horizontal overflow detected at ${vp.name}: ${overflow}px`).toBeLessThanOrEqual(1);
    });
  }
});
