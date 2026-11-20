# Pio Languisan — Developer & Deployment Guide

## 1. Architecture Overview
- **Frontend**: React 19 + TypeScript + Tailwind CSS v4 (`@tailwindcss/vite`) bundled via Vite 8.
  - Client routing for admin pages (`src/lib/adminRouter.ts`) supports both root hosting (`/`) and GitHub Pages subpath (`/PioOrlyLanguisan/`) with static fallback (`public/404.html` -> `?p=...` query restoration).
  - HTTP client (`src/lib/apiClient.ts`) targets `VITE_API_BASE_URL` with credentials (`credentials: 'include'`), CSRF header forwarding (`x-csrf-token`), `Bearer` token header support, and a 15s `AbortController` timeout.
- **Backend**: Node.js 22+ + Express 4 (`server.ts`) executing TypeScript cleanly (`npm run dev` via `tsx server.ts` or `npm start` via `node server.ts` in Node 22 native TypeScript strip-types mode).
- **Database Layer (`db/caseRepository.ts`)**: Dual-adapter interface (`CaseRepository`):
  - **Production (`postgres`)**: Enabled automatically when `CONSULTATION_DATABASE_URL` or `DATABASE_URL` is configured. Uses `postgres` driver with `sql.begin` transactions, advisory locks, canonical migrations (`001`, `002`, `003`), default-deny Supabase RLS, and PostgreSQL `site_content` JSONB storage.
  - **Local / Isolated Tests (`file`)**: Uses transactional write lock & atomic `tmp -> rename` writes to `DATA_STORE_PATH` (`data/store.json`). Do not use the filesystem adapter as a multi-instance production store.

---

## 2. Environment Variables (`.env.example`)

Never commit real secrets to Git. Set variables via host secret managers (Railway, GitHub Actions, Supabase):

| Variable | Required In Prod | Purpose |
|---|---|---|
| `CONSULTATION_DATABASE_URL` | Yes | PostgreSQL / Supabase connection URI (`sslmode=require` in production) |
| `SESSION_SECRET` | Recommended (`>= 32` chars) | Production session signing/entropy guard (server logs warning if unset in prod) |
| `ADMIN_BOOTSTRAP_TOKEN` | Initial setup | Authorizes `POST /api/auth/bootstrap` to create the first `super_admin` |
| `ADMIN_PASSCODE` | Optional | Legacy executive passcode access (disabled cleanly if unset) |
| `ALLOWED_ORIGINS` | Yes (decoupled FE/BE) | Comma-separated CORS origin allowlist (e.g., `https://ybtech7.github.io`) |
| `PUBLIC_APP_URL` | Yes (decoupled FE/BE) | Base frontend URL for password recovery & invite links (`https://ybtech7.github.io/PioOrlyLanguisan`) |
| `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_REFRESH_TOKEN` | Optional | Enables Gmail API dispatch for consultation confirmations & password reset emails |
| `CONSULTATION_EMAIL_FROM` / `CONSULTATION_EMAIL_TO` | Optional | Sender/recipient mailboxes when Gmail OAuth is active |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Optional | Enables server-side `@google/genai` Service Advisor & Scope Builder |
| `VITE_API_BASE_URL` | GitHub Pages build | Backend API origin baked into static bundle (`https://welcome-page-production-6941f322.up.railway.app`) |
| `VITE_BASE_PATH` | GitHub Pages build | Subpath prefix (`/PioOrlyLanguisan/`) |

---

## 3. Local Development & Verification Commands

```bash
# Install dependencies
npm install

# Run full-stack development server (Express + Vite HMR middlewares on port 3000)
npm run dev

# Static TypeScript verification
npm run lint

# Unit, Security & API test suite (Vitest)
npm run test:api

# With PostgreSQL integration tests enabled:
TEST_CONSULTATION_DATABASE_URL=postgresql://postgres:test@localhost:5432/portfolio_test npm run test:api

# Root build & GitHub Pages subpath build verification
npm run build
npm run build:gh-pages
npm run verify:gh-pages

# End-to-End Browser Tests (Playwright Chromium)
npm run test:e2e
# (If running against preinstalled system Chromium binary, pass PLAYWRIGHT_EXECUTABLE_PATH=...)
```

---

## 4. Key Engineering & Governance Rules
1. **Completed Case Reopen Governance**: `server.ts` (`handleUpdateCase`) rejects `staff` attempts to transition a `Completed` case (`403`) and requires `admin`/`super_admin` to include `statusNote.trim().length >= 5` (`400`), clearing `completedAt` to `null` upon reopen.
2. **CSV Formula-Injection Protection**: `sanitizeCsvCell` in `src/lib/caseAnalytics.ts` prefixes leading `=`, `+`, `-`, `@`, `\t`, or `\r` characters (even after whitespace) with `'` before CSV quoting.
3. **Notification Synchronization**: `AdminPortal` polls `/api/admin/notifications` and triggers `refreshDashboard({ silent: true })` every 60 seconds while `document.visibilityState === 'visible'`. Notifications UI explicitly describes this as synchronized polling (not push real-time).
4. **Asset & Portrait Preservation**: Never modify `public/assets/images/portrait-pio-languisan.png` or `pl-circular-emblem.png`. Always resolve paths via `resolveAssetUrl()` so subpath builds under `/PioOrlyLanguisan/` load every image cleanly (`scripts/verify-dist.mjs` checks portrait SHA-256 integrity on every build).

---

## 5. CI/CD Pipeline (`.github/workflows/deploy.yml`)
1. Spins up a live `postgres:18` service container.
2. Executes `db/migrations/001`, `002`, and `003` (twice for idempotency) plus `supabase/migrations/20261120000002_canonical_case_management_reconcile.sql` on an isolated database (`portfolio_reconcile_test`).
3. Runs `npm run lint` and `npm run test:api` against `TEST_CONSULTATION_DATABASE_URL`.
4. Builds `dist/` with `VITE_BASE_PATH=/PioOrlyLanguisan/` and `VITE_API_BASE_URL` pointing to the Railway backend.
5. Verifies `dist/` via `npm run verify:gh-pages` and deploys to GitHub Pages on `main` pushes.
