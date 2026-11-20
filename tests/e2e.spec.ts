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
      'Executive operations, technical support, and analytics'
    );

    // Ensure no floating fixed AI advisor button overlaps content
    await expect(page.locator('button.fixed.bottom-5.right-5')).toHaveCount(0);

    // Scroll through page so lazy-loaded visual assets load cleanly
    await page.locator('#about img').scrollIntoViewIfNeeded();
    await page.locator('#projects img').first().scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, 0));

    // Verify all images (new portrait + 3 visual assets) decoded successfully
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

    expect(imageStates.length).toBeGreaterThanOrEqual(7);
    for (const img of imageStates) {
      expect(img.complete, `Image not complete: ${img.src}`).toBe(true);
      expect(img.naturalWidth, `Image broken (naturalWidth 0): ${img.src}`).toBeGreaterThan(0);
    }

    // Verify circular PL emblem in header & footer: optimized dimensions, decorative screen reader treatment, zero square frame
    const brandLink = page.getByRole('banner').getByRole('link', { name: 'Pio Languisan' });
    await expect(brandLink).toBeVisible();
    const headerBrandInfo = await brandLink.evaluate((anchor) => {
      const img = anchor.querySelector('img');
      const span = anchor.querySelector('span');
      const aRect = anchor.getBoundingClientRect();
      const imgRect = img?.getBoundingClientRect();
      const spanRect = span?.getBoundingClientRect();
      const imgStyle = img ? window.getComputedStyle(img) : null;
      return {
        anchorHeight: aRect.height,
        imgSrc: img?.getAttribute('src') || '',
        imgAlt: img?.getAttribute('alt'),
        imgAriaHidden: img?.getAttribute('aria-hidden'),
        imgWidthAttr: img?.getAttribute('width'),
        imgHeightAttr: img?.getAttribute('height'),
        naturalWidth: img?.naturalWidth || 0,
        naturalHeight: img?.naturalHeight || 0,
        borderWidth: imgStyle?.borderWidth || '',
        borderRadius: imgStyle?.borderRadius || '',
        verticalCenterDiff:
          imgRect && spanRect
            ? Math.abs(
                imgRect.top + imgRect.height / 2 - (spanRect.top + spanRect.height / 2)
              )
            : 999,
      };
    });
    expect(headerBrandInfo.anchorHeight).toBeGreaterThanOrEqual(44);
    expect(headerBrandInfo.imgSrc).toMatch(/assets\/images\/pl-circular-emblem\.png$/);
    expect(headerBrandInfo.imgAlt).toBe('');
    expect(headerBrandInfo.imgAriaHidden).toBe('true');
    expect(headerBrandInfo.imgWidthAttr).toBe('36');
    expect(headerBrandInfo.imgHeightAttr).toBe('36');
    expect(headerBrandInfo.naturalWidth).toBe(256);
    expect(headerBrandInfo.naturalHeight).toBe(256);
    expect(headerBrandInfo.borderWidth).toBe('0px');
    expect(headerBrandInfo.borderRadius).toBe('0px');
    expect(headerBrandInfo.verticalCenterDiff).toBeLessThanOrEqual(4);

    // Verify footer uses the same circular emblem consistently
    const footerEmblem = page.locator('footer img').first();
    await expect(footerEmblem).toHaveAttribute('src', /assets\/images\/pl-circular-emblem\.png$/);
    await expect(footerEmblem).toHaveAttribute('aria-hidden', 'true');
    await expect(footerEmblem).toHaveAttribute('alt', '');

    // Verify new portrait alt text, filename, natural aspect, and static non-distorted CSS rules
    const portrait = page.getByAltText('Portrait of Pio Languisan');
    await expect(portrait).toBeVisible();
    await expect(portrait).toHaveAttribute('src', /assets\/images\/portrait-pio-languisan\.png$/);
    const portraitStyles = await portrait.evaluate((el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        borderRadius: style.borderRadius,
        filter: style.filter,
        transform: style.transform,
        animationName: style.animationName,
        opacity: style.opacity,
        rectWidth: rect.width,
        rectHeight: rect.height,
        naturalWidth: (el as HTMLImageElement).naturalWidth,
        naturalHeight: (el as HTMLImageElement).naturalHeight,
      };
    });
    expect(portraitStyles.naturalWidth).toBe(1199);
    expect(portraitStyles.naturalHeight).toBe(1312);
    expect(portraitStyles.borderRadius).toBe('0px');
    expect(portraitStyles.filter).toBe('none');
    expect(portraitStyles.transform).toBe('none');
    expect(portraitStyles.animationName).toBe('none');
    expect(portraitStyles.opacity).toBe('1');
    expect(portraitStyles.rectWidth).toBeGreaterThan(200);
    expect(portraitStyles.rectHeight).toBeGreaterThan(220);

    // Verify keyboard focus & Enter scroll-to-top on header brand link
    await page.locator('#contact').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await brandLink.focus();
    await expect(brandLink).toBeFocused();
    await page.keyboard.press('Enter');
    await expect
      .poll(() => page.evaluate(() => window.scrollY), { timeout: 2500 })
      .toBeLessThan(120);

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

    // Check section scroll-mt-20 and navigation heading visibility below sticky 64px header
    const aboutScrollMargin = await page
      .locator('#about')
      .evaluate((el) => window.getComputedStyle(el).scrollMarginTop);
    expect(aboutScrollMargin).toBe('80px');

    await page.getByRole('navigation', { name: 'Primary Navigation' }).getByRole('link', { name: 'Services' }).click();
    await page.waitForTimeout(300);
    const servicesHeadingTop = await page.locator('#services h2').evaluate((el) => el.getBoundingClientRect().top);
    expect(servicesHeadingTop).toBeGreaterThanOrEqual(64);

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

    // Header Book Consultation CTA scrolls contact section into view
    await page.getByRole('banner').getByRole('button', { name: 'Book Consultation' }).click();
    await page.waitForTimeout(300);
    const contactTop = await page.locator('#contact h2').evaluate((el) => el.getBoundingClientRect().top);
    expect(contactTop).toBeGreaterThanOrEqual(64);
    expect(contactTop).toBeLessThan(900);

    // Mobile menu toggle, keyboard focus & drawer navigation
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileToggle = page.getByRole('button', { name: 'Open navigation menu' });
    await mobileToggle.focus();
    await expect(mobileToggle).toBeFocused();
    await mobileToggle.click();
    const mobileDrawer = page.locator('#mobile-navigation-drawer');
    await expect(mobileDrawer).toBeVisible();
    const mobileAbout = mobileDrawer.getByRole('link', { name: 'About' });
    await mobileAbout.focus();
    await expect(mobileAbout).toBeFocused();
    await mobileAbout.click();
    await expect(mobileDrawer).toHaveCount(0);
  });

  test('validates consultation submission, AI scope + drawer fallbacks, and Admin Portal without disclosed passcode', async ({
    page,
  }) => {
    await page.route('**/api/content', (route) =>
      route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' })
    );

    const seenPayloads: Array<Record<string, unknown>> = [];
    const seenSubmissionKeys: string[] = [];
    let inquiryCalls = 0;
    await page.route('**/api/inquiries', async (route) => {
      const payload = route.request().postDataJSON();
      seenPayloads.push(payload);
      seenSubmissionKeys.push(payload.submissionKey);
      inquiryCalls += 1;
      if (inquiryCalls === 1) {
        // Simulate incomplete API response without a valid tracking ID
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ inquiry: { id: '' } }),
        });
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          inquiry: {
            id: 'INQ-2026-TEST1234',
            caseNumber: 'CASE-000001',
            ...payload,
            status: 'New',
            priority: 'Normal',
            assignedTo: null,
            followUpAt: null,
            deadlineAt: null,
            createdAt: '2026-11-17T12:00:00.000Z',
            updatedAt: '2026-11-17T12:00:00.000Z',
            version: 1,
          },
        }),
      });
    });

    await page.route('**/api/auth/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          hasAdminUsers: true,
          bootstrapConfigured: true,
          passcodeConfigured: true,
          storageMode: 'file',
          mailerConfigured: false,
        }),
      });
    });

    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Authentication required.' }),
      });
    });

    await page.route('**/api/auth/login', async (route) => {
      const body = route.request().postDataJSON();
      if (body?.password === 'wrong-password') {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Invalid email or password.' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'e2e-admin-token',
          expiresInMs: 3600000,
          user: {
            id: 'user-super-1',
            email: body?.email || 'admin@piolanguisan.example',
            name: 'Pio Languisan',
            role: 'super_admin',
            mfaEnabled: false,
          },
        }),
      });
    });

    await page.route('**/api/auth/logout', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.route('**/api/auth/forgot-password', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Password recovery email delivery is not configured on this server.',
        }),
      });
    });

    const mockCases = [
      {
        id: 'INQ-2026-SENT01',
        caseNumber: 'CASE-000001',
        name: 'Jordan Taylor',
        email: 'jordan@acme-ops.example',
        phone: '+639171234567',
        phoneCountryCode: 'PH',
        company: 'Acme Ops',
        tier: 'smb',
        serviceDomain: 'data-analytics',
        timeline: 'Within 30 days',
        message: 'Need cleaner SLA reporting.',
        status: 'New',
        priority: 'Normal',
        assignedTo: null,
        followUpAt: null,
        deadlineAt: null,
        createdAt: '2026-11-18T10:00:00.000Z',
        updatedAt: '2026-11-18T10:00:00.000Z',
        version: 1,
        emailStatus: 'sent',
        emailAttempts: 1,
        providerMessageId: '193a8f10ab',
        lastEmailHttpStatus: 200,
        lastEmailStage: 'gmail_accepted',
      },
      {
        id: 'INQ-2026-QUEUED02',
        caseNumber: 'CASE-000002',
        name: 'Riley Chen',
        email: 'riley@startup.example',
        company: '',
        tier: 'startup',
        serviceDomain: 'technical-support',
        timeline: 'Immediate (1–2 weeks)',
        message: 'Support queue triage setup.',
        status: 'New',
        priority: 'Normal',
        assignedTo: null,
        followUpAt: null,
        deadlineAt: null,
        createdAt: '2026-11-18T09:00:00.000Z',
        updatedAt: '2026-11-18T09:00:00.000Z',
        version: 1,
        emailStatus: 'pending',
        emailAttempts: 0,
      },
    ];

    const mockAnalytics = {
      kpis: {
        totalRequests: 2,
        newRequests: 2,
        pendingRequests: 0,
        followUpRequests: 0,
        completedRequests: 0,
        overdueCases: 0,
        dueSoonCases: 0,
        completionRate: 0,
      },
      previousKpis: null,
      byStatus: [
        { key: 'New', label: 'New', count: 2, percentage: 100 },
        { key: 'Pending', label: 'Pending', count: 0, percentage: 0 },
        { key: 'Follow Up', label: 'Follow Up', count: 0, percentage: 0 },
        { key: 'Completed', label: 'Completed', count: 0, percentage: 0 },
      ],
      byServiceDomain: [
        { key: 'technical-support', label: '01. Technical Support & Systems', count: 1, percentage: 50 },
        { key: 'customer-service', label: '02. Customer Service Operations', count: 0, percentage: 0 },
        { key: 'data-analytics', label: '03. Data Analytics & Executive Reporting', count: 1, percentage: 50 },
        { key: 'admin-operations', label: '04. Administrative & Business Operations', count: 0, percentage: 0 },
        { key: 'account-management', label: '05. Strategic Account Management', count: 0, percentage: 0 },
        { key: 'web-creation', label: '06. Web Creation & AI Workflows', count: 0, percentage: 0 },
      ],
      byTimeline: [
        { key: 'Immediate (1–2 weeks)', label: 'Immediate (1–2 weeks)', count: 1, percentage: 50, overdueCount: 0, dueSoonCount: 0 },
        { key: 'Within 30 days', label: 'Within 30 days', count: 1, percentage: 50, overdueCount: 0, dueSoonCount: 0 },
        { key: 'This quarter', label: 'This quarter', count: 0, percentage: 0, overdueCount: 0, dueSoonCount: 0 },
        { key: 'Advisory / Ongoing', label: 'Advisory / Ongoing', count: 0, percentage: 0, overdueCount: 0, dueSoonCount: 0 },
      ],
      serviceDomainMatrix: [],
      timelineMatrix: [],
      monthlyTrends: [{ month: '2026-11', submitted: 2, completed: 0 }],
    };

    await page.route('**/api/admin/dashboard', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          inquiries: mockCases,
          cases: mockCases,
          projects: [],
          users: [],
          unreadNotifications: 1,
          analytics: mockAnalytics,
          brand: {
            customPortraitDataUrl: null,
            customLogoDataUrl: null,
            motionEnabled: true,
            motionSensitivity: 1,
          },
        }),
      });
    });

    await page.route('**/api/admin/analytics*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAnalytics),
      });
    });

    await page.route('**/api/admin/cases?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: mockCases,
          total: mockCases.length,
          page: 1,
          pageSize: 15,
          totalPages: 1,
          statusCounts: { All: 2, New: 2, Pending: 0, 'Follow Up': 0, Completed: 0 },
        }),
      });
    });

    await page.route('**/api/admin/cases/INQ-2026-SENT01', async (route) => {
      if (route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON();
        mockCases[0] = { ...mockCases[0], status: body.status || 'Pending' };
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ inquiry: mockCases[0], caseRecord: mockCases[0] }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          caseRecord: mockCases[0],
          statusHistory: [
            {
              id: 'h1',
              caseId: 'INQ-2026-SENT01',
              previousStatus: null,
              newStatus: 'New',
              changedBy: null,
              changedByEmail: 'public-form',
              note: 'Created',
              changedAt: '2026-11-18T10:00:00.000Z',
            },
          ],
          notes: [],
          activity: [],
        }),
      });
    });

    await page.route('**/api/admin/cases/INQ-2026-SENT01/notes', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          note: {
            id: 'note-1',
            caseId: 'INQ-2026-SENT01',
            authorId: null,
            authorEmail: 'admin@piolanguisan.example',
            content: 'Confirmed in inbox.',
            createdAt: '2026-11-18T11:00:00.000Z',
            updatedAt: '2026-11-18T11:00:00.000Z',
          },
        }),
      });
    });

    await page.route('**/api/admin/notifications*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ notifications: [], unreadCount: 0 }),
      });
    });

    await page.route('**/api/admin/activity*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ activity: [] }),
      });
    });

    await page.route('**/api/admin/sessions*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessions: [] }),
      });
    });

    await page.route('**/api/admin/invitations*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ invitations: [] }),
      });
    });

    await page.route('**/api/admin/audit-events*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ events: [] }),
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

    // Keyboard searchable country picker supports shared +1 territories and pasted + numbers
    await page.locator('#consult-email').fill('jordan@acme-ops.example');
    const countryBtn = page.locator('#consult-phone-country');
    await expect(countryBtn).toContainText('Philippines (+63)');
    await countryBtn.focus();
    await page.keyboard.press('ArrowDown');
    const countrySearch = page.locator('#consult-phone-country-search');
    await expect(countrySearch).toBeFocused();
    await countrySearch.fill('+1');
    await expect(page.getByRole('option', { name: /United States \(\+1\)/ })).toBeVisible();
    await expect(page.getByRole('option', { name: /Canada \(\+1\)/ })).toBeVisible();
    await countrySearch.fill('Canada');
    await page.keyboard.press('Enter');
    await expect(countryBtn).toContainText('Canada (+1)');
    await expect(page.locator('#consult-phone')).toBeFocused();

    // Invalid phone number triggers field-level validation error while preserving selection
    await page.locator('#consult-phone').fill('12345');
    await page.getByRole('button', { name: 'Submit Consultation Request' }).click();
    await expect(page.locator('#consult-phone-error')).toContainText('Canada (+1)');
    await expect(countryBtn).toContainText('Canada (+1)');
    await expect(page.locator('#consult-phone')).toHaveValue('12345');

    // Pasting a complete international +63 number updates country & submits normalized E.164 on retry
    await page.locator('#consult-phone').fill('+63 917 123 4567');
    await expect(countryBtn).toContainText('Philippines (+63)');

    // First submit gets incomplete response: entries (including phone & country) preserved & retry error shown
    await page.getByRole('button', { name: 'Submit Consultation Request' }).click();
    await expect(page.getByRole('alert')).toContainText('could not confirm your tracking ID');
    await expect(page.locator('#consult-name')).toHaveValue('Jordan Taylor');
    await expect(page.locator('#consult-email')).toHaveValue('jordan@acme-ops.example');
    await expect(page.locator('#consult-phone')).toHaveValue('+63 917 123 4567');
    await expect(countryBtn).toContainText('Philippines (+63)');

    // Retry sends identical submissionKey and normalized E.164 phone, displaying case reference & tracking ID
    await page.getByRole('button', { name: 'Submit Consultation Request' }).click();
    await expect(page.getByText('CASE-000001')).toBeVisible();
    await expect(page.getByText('INQ-2026-TEST1234')).toBeVisible();
    expect(seenSubmissionKeys.length).toBe(2);
    expect(seenSubmissionKeys[0]).toBeTruthy();
    expect(seenSubmissionKeys[0]).toBe(seenSubmissionKeys[1]);
    expect(seenPayloads[0].phone).toBe('+639171234567');
    expect(seenPayloads[1].phone).toBe('+639171234567');

    // Submit another email-only inquiry without a contact number (optional field)
    await page.getByRole('button', { name: 'Submit Another Request' }).click();
    await page.locator('#consult-name').fill('Riley Chen');
    await page.locator('#consult-email').fill('riley@startup.example');
    await page.locator('#consult-message').fill('Email-only consultation inquiry without phone.');
    await page.getByRole('button', { name: 'Submit Consultation Request' }).click();
    await expect(page.getByText('INQ-2026-TEST1234')).toBeVisible();
    expect(seenPayloads[2].phone).toBeUndefined();

    // AI Advisor Drawer shows clean unavailable message when backend returns 503
    await page.getByRole('button', { name: 'Open Gemini Service Advisor' }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await drawer.getByLabel('Ask Service Guidance Advisor').fill('How can you help our support team?');
    await drawer.getByRole('button', { name: 'Send message' }).click();
    await expect(drawer.getByRole('alert')).toContainText('not configured');
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);

    // Clicking footer Admin Console navigates to dedicated /admin/login route without leaking secrets
    await page.getByRole('link', { name: 'Admin Console' }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByRole('heading', { name: 'Secure Dashboard Access' })).toBeVisible();
    const loginBodyText = await page.locator('main').innerText();
    expect(loginBodyText).not.toContain('PL-EXEC-2026');

    // Test password visibility toggle, Remember email, and Forgot password route
    const passwordInput = page.locator('#admin-login-password');
    await expect(passwordInput).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(passwordInput).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Hide password' }).click();
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Navigate to Forgot Password & observe honest 503 when mailer is unconfigured
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await expect(page).toHaveURL(/\/admin\/forgot-password$/);
    await page.locator('#recovery-email').fill('admin@piolanguisan.example');
    await page.getByRole('button', { name: 'Send Recovery Link' }).click();
    await expect(page.getByRole('alert')).toContainText('not configured');
    await page.getByRole('button', { name: 'Back to Admin Sign In' }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);

    // Unauthenticated protected route attempt (?p=/admin/cases) redirects cleanly to /admin/login?redirect=...
    await page.goto('./?p=%2Fadmin%2Fcases', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/admin\/login\?redirect=%2Fadmin%2Fcases$/);

    // Invalid credentials show safe error without disclosing existence
    await page.locator('#admin-login-email').fill('admin@piolanguisan.example');
    await page.locator('#admin-login-password').fill('wrong-password');
    await page.getByRole('button', { name: 'Secure Sign In' }).click();
    await expect(page.getByRole('alert')).toContainText('Invalid email or password.');

    // Check Remember email & sign in cleanly -> redirects back to /admin/cases (requested protected route)
    await page.getByLabel('Remember email').check();
    await page.locator('#admin-login-password').fill('SuperValidPassword!2026');
    await page.getByRole('button', { name: 'Secure Sign In' }).click();
    await expect(page).toHaveURL(/\/admin\/cases$/);

    // Confirm localStorage remembered email ONLY (never password or token)
    const storageDump = await page.evaluate(() => ({ ...window.localStorage }));
    expect(storageDump.pl_admin_remembered_email).toBe('admin@piolanguisan.example');
    expect(JSON.stringify(storageDump)).not.toContain('SuperValidPassword!2026');
    expect(JSON.stringify(storageDump)).not.toContain('e2e-admin-token');

    // Navigate to Overview KPIs
    await page.getByRole('button', { name: 'Overview' }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
    await expect(page.getByText('Total Requests')).toBeVisible();
    await expect(page.getByText('Completion Rate')).toBeVisible();

    // Navigate to All Cases and change status
    await page.getByRole('button', { name: /All Cases/ }).click();
    await expect(page).toHaveURL(/\/admin\/cases$/);
    await page
      .getByLabel('Status for Jordan Taylor', { exact: true })
      .selectOption('Pending');
    await expect(page.getByText('Updated CASE-000001 status to Pending.')).toBeVisible();

    // Open Case Detail page -> tel: link, Gmail status, and add internal note
    await page.getByRole('button', { name: 'CASE-000001' }).first().click();
    await expect(page).toHaveURL(/\/admin\/cases\/INQ-2026-SENT01$/);
    const telLink = page.getByRole('link', { name: '+639171234567' });
    await expect(telLink).toBeVisible();
    await expect(telLink).toHaveAttribute('href', 'tel:+639171234567');
    await expect(page.getByText('Accepted by Gmail', { exact: true })).toBeVisible();
    await expect(page.getByText('Gmail ID: 193a8f10ab')).toBeVisible();
    await page.locator('#case-internal-note').fill('Confirmed in inbox.');
    await page.getByRole('button', { name: 'Add Internal Note' }).click();
    await expect(page.getByText('Internal note recorded.')).toBeVisible();

    // Navigate to Service Domain Analytics and Target Timelines
    await page.getByRole('button', { name: 'Service Domain Analytics' }).click();
    await expect(page).toHaveURL(/\/admin\/analytics$/);
    await expect(page.getByText('Service Domain × Status Matrix')).toBeVisible();
    await page.getByRole('button', { name: 'Target Timelines' }).click();
    await expect(page).toHaveURL(/\/admin\/analytics\?tab=timelines$/);
    await expect(page.getByText('Target Timeline × Status Matrix')).toBeVisible();

    // Verify Admin Dashboard mobile responsive drawer & zero horizontal overflow at 390x844
    await page.setViewportSize({ width: 390, height: 844 });
    const adminOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(adminOverflow).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'Open admin navigation menu' }).click();
    await page.getByRole('button', { name: 'Overview' }).last().click();
    await expect(page.getByText('Total Requests')).toBeVisible();

    // Logout clears state and redirects to /admin/login; browser Back never exposes protected dashboard
    await page.getByRole('button', { name: 'Open admin navigation menu' }).click();
    await page.getByRole('button', { name: 'Logout' }).last().click();
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.locator('#admin-login-email')).toHaveValue('admin@piolanguisan.example');
    const loginMobileOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(loginMobileOverflow).toBeLessThanOrEqual(1);

    await page.goBack();
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByText('Total Requests')).toHaveCount(0);
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

  test('keeps searchable country picker usable on mobile with tel keyboard hints and zero overflow', async ({
    page,
  }) => {
    await page.route('**/api/content', (route) =>
      route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' })
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./', { waitUntil: 'networkidle' });

    const phoneInput = page.locator('#consult-phone');
    await phoneInput.scrollIntoViewIfNeeded();
    await expect(phoneInput).toHaveAttribute('type', 'tel');
    await expect(phoneInput).toHaveAttribute('inputmode', 'tel');
    await expect(phoneInput).toHaveAttribute('autocomplete', 'tel');

    await page.locator('#consult-phone-country').click();
    await expect(page.locator('#consult-phone-country-listbox')).toBeVisible();
    await page.locator('#consult-phone-country-search').fill('United');
    await expect(page.getByRole('option', { name: 'United States (+1)' })).toBeVisible();

    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth - document.documentElement.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);

    await page.keyboard.press('Escape');
    await expect(page.locator('#consult-phone-country-listbox')).toHaveCount(0);

    // Direct Inquiries contact links and operating hours on mobile
    const contactSection = page.locator('#contact');
    const emailLink = contactSection.getByRole('link', { name: 'pioorly.languisan@gmail.com' });
    const businessPhoneLink = contactSection.getByRole('link', { name: '+63 929 439 1755' });
    await expect(emailLink).toHaveAttribute('href', 'mailto:pioorly.languisan@gmail.com');
    await expect(businessPhoneLink).toHaveAttribute('href', 'tel:+639294391755');
    await expect(contactSection).toContainText('8:00 AM–5:00 PM PST');
    await expect(contactSection).not.toContainText('pio.executive@gmail.com');

    await emailLink.focus();
    await expect(emailLink).toBeFocused();
    await businessPhoneLink.focus();
    await expect(businessPhoneLink).toBeFocused();
  });

  test('renders Direct Inquiries links, hours, and keyboard focus cleanly on desktop', async ({
    page,
  }) => {
    await page.route('**/api/content', (route) =>
      route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' })
    );
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('./', { waitUntil: 'networkidle' });

    const contactSection = page.locator('#contact');
    await contactSection.scrollIntoViewIfNeeded();
    const emailLink = contactSection.getByRole('link', { name: 'pioorly.languisan@gmail.com' });
    const businessPhoneLink = contactSection.getByRole('link', { name: '+63 929 439 1755' });

    await expect(emailLink).toBeVisible();
    await expect(emailLink).toHaveAttribute('href', 'mailto:pioorly.languisan@gmail.com');
    await expect(businessPhoneLink).toBeVisible();
    await expect(businessPhoneLink).toHaveAttribute('href', 'tel:+639294391755');
    await expect(contactSection).toContainText('8:00 AM–5:00 PM PST');
    await expect(contactSection).not.toContainText('pio.executive@gmail.com');

    await emailLink.focus();
    await expect(emailLink).toBeFocused();
    await businessPhoneLink.focus();
    await expect(businessPhoneLink).toBeFocused();
  });
});
