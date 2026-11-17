import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import {
  INITIAL_FAQS,
  INITIAL_INSIGHTS,
  INITIAL_PROJECTS,
  SERVICE_OFFERINGS,
  CLIENT_TIER_SOLUTIONS,
  WORKFLOW_VISUAL_URL,
} from './src/data/profileData.ts';
import type {
  BrandSettings,
  FaqItem,
  InquiryRecord,
  InquiryStatus,
  InsightArticle,
  ProjectCase,
} from './src/types.ts';

interface PersistentStore {
  inquiries: InquiryRecord[];
  projects: ProjectCase[];
  insights: InsightArticle[];
  faqs: FaqItem[];
  brand: BrandSettings;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');

const DEFAULT_BRAND: BrandSettings = {
  customPortraitDataUrl: null,
  customLogoDataUrl: null,
  motionEnabled: true,
  motionSensitivity: 1,
};

function ensureStore(): PersistentStore {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_PATH)) {
    const initial: PersistentStore = {
      inquiries: [
        {
          id: 'INQ-2026-101',
          name: 'Elena Rostova',
          email: 'elena@northstar-ops.example',
          company: 'Northstar Logistics',
          tier: 'smb',
          serviceDomain: 'data-analytics',
          timeline: 'Within 30 days',
          message:
            'Looking to consolidate weekly customer support and account renewal spreadsheets into a single executive KPI dashboard.',
          status: 'Reviewed' as InquiryStatus,
          createdAt: '2026-11-15T14:20:00.000Z',
          notes: 'Discovery call briefing drafted.',
        } as unknown as InquiryRecord,
      ],
      projects: INITIAL_PROJECTS,
      insights: INITIAL_INSIGHTS,
      faqs: INITIAL_FAQS,
      brand: DEFAULT_BRAND,
    };
    // Ensure valid status enum on seeded record
    initial.inquiries[0].status = 'In Review';
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }

  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PersistentStore>;
    return {
      inquiries: Array.isArray(parsed.inquiries) ? parsed.inquiries : [],
      projects:
        Array.isArray(parsed.projects) && parsed.projects.length > 0
          ? parsed.projects
          : INITIAL_PROJECTS,
      insights:
        Array.isArray(parsed.insights) && parsed.insights.length > 0
          ? parsed.insights
          : INITIAL_INSIGHTS,
      faqs:
        Array.isArray(parsed.faqs) && parsed.faqs.length > 0
          ? parsed.faqs
          : INITIAL_FAQS,
      brand: { ...DEFAULT_BRAND, ...(parsed.brand || {}) },
    };
  } catch {
    return {
      inquiries: [],
      projects: INITIAL_PROJECTS,
      insights: INITIAL_INSIGHTS,
      faqs: INITIAL_FAQS,
      brand: DEFAULT_BRAND,
    };
  }
}

function saveStore(store: PersistentStore): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please verify your key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const SYSTEM_CONTEXT = `You are the Service Advisor for Pio Languisan (PL — Technology · Operations · Analytics).
Your role is to help prospective individual, startup, small-to-medium business (SMB), and enterprise clients understand how Pio's actual experience applies to their goals.

Core Service Pillars:
${SERVICE_OFFERINGS.map(
  (s) => `- ${s.index}. ${s.title} (${s.id}): ${s.summary} Deliverables: ${s.deliverables.join(', ')}.`
).join('\n')}

Client Tiers:
${CLIENT_TIER_SOLUTIONS.map(
  (t) => `- ${t.label} (${t.id}): ${t.description} Typical timeline: ${t.typicalTimeline}.`
).join('\n')}

Guidelines:
1. Be concise, executive, practical, and grounded strictly in the six service areas above (technical support, customer service, data analytics, administrative operations, account management, and web creation).
2. Never invent fabricated past employers, degrees, certifications, or fake client names.
3. Recommend concrete deliverables and suggest scheduling a consultation when ready.`;

const activeAdminTokens = new Map<string, number>();

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  const expiresAt = activeAdminTokens.get(token);
  if (!expiresAt || Date.now() > expiresAt) {
    activeAdminTokens.delete(token);
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
    return;
  }
  next();
}

function formatGeminiError(err: unknown): { status: number; message: string } {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('GEMINI_API_KEY')) {
    return {
      status: 503,
      message:
        'Gemini service key is unavailable. Please configure GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (msg.includes('403') || msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID')) {
    return {
      status: 403,
      message:
        'API key validation failed. Please verify your GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message:
        'Service quota temporarily reached. Please retry in a moment or check quota in Settings > Secrets.',
    };
  }
  return {
    status: 500,
    message: msg || 'Unable to process AI request at this time.',
  };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '6mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  app.get('/api/content', (_req, res) => {
    const store = ensureStore();
    res.json({
      projects: store.projects,
      insights: store.insights,
      faqs: store.faqs,
      brand: store.brand,
    });
  });

  app.post('/api/inquiries', (req, res) => {
    const { name, email, company, tier, serviceDomain, timeline, message } = req.body ?? {};
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedEmail = typeof email === 'string' ? email.trim() : '';
    const trimmedMessage = typeof message === 'string' ? message.trim() : '';

    if (trimmedName.length < 2) {
      res.status(400).json({ error: 'Please enter your full name.' });
      return;
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(trimmedEmail)) {
      res.status(400).json({ error: 'Please provide a valid email address.' });
      return;
    }
    if (trimmedMessage.length < 10) {
      res.status(400).json({
        error: 'Please include at least a brief description (10+ characters) of your goals.',
      });
      return;
    }

    const store = ensureStore();
    const record: InquiryRecord = {
      id: `INQ-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      name: trimmedName,
      email: trimmedEmail,
      company: typeof company === 'string' && company.trim() ? company.trim() : 'Independent',
      tier: tier || 'startup',
      serviceDomain: serviceDomain || 'technical-support',
      timeline: typeof timeline === 'string' && timeline.trim() ? timeline.trim() : 'Within 30 days',
      message: trimmedMessage,
      status: 'New',
      createdAt: new Date().toISOString(),
    };

    store.inquiries.unshift(record);
    saveStore(store);

    res.status(201).json({ inquiry: record });
  });

  app.post('/api/assistant', async (req, res) => {
    try {
      const { messages } = req.body ?? {};
      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: 'Conversation messages are required.' });
        return;
      }

      const ai = getGeminiClient();
      const transcript = messages
        .slice(-10)
        .map((m: { role?: string; content?: string }) =>
          `${m.role === 'assistant' ? 'Advisor' : 'Client'}: ${String(m.content || '').trim()}`
        )
        .join('\n\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Respond directly to the latest Client message in this conversation:\n\n${transcript}`,
        config: {
          systemInstruction: SYSTEM_CONTEXT,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const reply = response.text?.trim();
      if (!reply) {
        res.status(502).json({ error: 'No response generated. Please try rephrasing your question.' });
        return;
      }

      res.json({ reply });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/assistant/scope', async (req, res) => {
    try {
      const { goal } = req.body ?? {};
      if (typeof goal !== 'string' || goal.trim().length < 5) {
        res.status(400).json({ error: 'Please describe your goal or challenge first.' });
        return;
      }

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Evaluate this prospective client goal and map it to Pio Languisan's services:\n"${goal.trim()}"`,
        config: {
          systemInstruction: SYSTEM_CONTEXT,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              recommendedTier: {
                type: Type.STRING,
                description: "Must be one of: 'individual', 'startup', 'smb', 'enterprise'",
              },
              recommendedService: {
                type: Type.STRING,
                description:
                  "Must be one of: 'technical-support', 'customer-service', 'data-analytics', 'admin-operations', 'account-management', 'web-creation'",
              },
              recommendedTimeline: {
                type: Type.STRING,
                description: "Suggested engagement timeline, e.g. 'Within 30 days' or '2–4 Weeks'",
              },
              executiveSummary: {
                type: Type.STRING,
                description: 'Concise 2-sentence executive summary of the recommended scope.',
              },
              actionPlan: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3 concrete milestone steps for the initial sprint.',
              },
            },
            required: [
              'recommendedTier',
              'recommendedService',
              'recommendedTimeline',
              'executiveSummary',
              'actionPlan',
            ],
          },
        },
      });

      const raw = (response.text ?? '{}').trim();
      const parsed = JSON.parse(raw);
      res.json({ scope: parsed });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/admin/login', (req, res) => {
    const { passcode } = req.body ?? {};
    const expected = process.env.ADMIN_PASSCODE || 'PL-EXEC-2026';
    if (typeof passcode !== 'string' || passcode.trim() !== expected) {
      res.status(401).json({ error: 'Invalid executive passcode.' });
      return;
    }

    const token = crypto.randomBytes(24).toString('hex');
    activeAdminTokens.set(token, Date.now() + 1000 * 60 * 60 * 8);
    res.json({ token });
  });

  app.get('/api/admin/dashboard', requireAdmin, (_req, res) => {
    const store = ensureStore();
    res.json({
      inquiries: store.inquiries,
      projects: store.projects,
      brand: store.brand,
    });
  });

  app.patch('/api/admin/inquiries/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { status, notes } = req.body ?? {};
    const store = ensureStore();
    const target = store.inquiries.find((item) => item.id === id);
    if (!target) {
      res.status(404).json({ error: 'Inquiry not found.' });
      return;
    }
    const validStatuses: InquiryStatus[] = ['New', 'In Review', 'Scheduled', 'Completed'];
    if (status && validStatuses.includes(status)) {
      target.status = status;
    }
    if (typeof notes === 'string') {
      target.notes = notes;
    }
    saveStore(store);
    res.json({ inquiry: target });
  });

  app.post('/api/admin/projects', requireAdmin, (req, res) => {
    const { title, domain, tier, timeframe, metricValue, metricLabel, summary, architecture } =
      req.body ?? {};
    if (!title || !domain || !summary) {
      res.status(400).json({ error: 'Title, domain, and summary are required.' });
      return;
    }
    const store = ensureStore();
    const newProject: ProjectCase = {
      id: `proj-${Date.now()}`,
      title: String(title).trim(),
      domain: String(domain).trim(),
      tier: String(tier || 'SMB & Enterprise').trim(),
      timeframe: String(timeframe || '4 Weeks').trim(),
      metricValue: String(metricValue || '+35%').trim(),
      metricLabel: String(metricLabel || 'Operational efficiency gain').trim(),
      summary: String(summary).trim(),
      architecture: Array.isArray(architecture)
        ? architecture.map((a) => String(a).trim()).filter(Boolean)
        : ['Structured operational framework', 'Automated reporting baseline'],
      imageUrl: WORKFLOW_VISUAL_URL,
    };
    store.projects.unshift(newProject);
    saveStore(store);
    res.status(201).json({ project: newProject, projects: store.projects });
  });

  app.delete('/api/admin/projects/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const store = ensureStore();
    const next = store.projects.filter((p) => p.id !== id);
    if (next.length === store.projects.length) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    store.projects = next;
    saveStore(store);
    res.json({ projects: store.projects });
  });

  app.post('/api/admin/brand', requireAdmin, (req, res) => {
    const { customPortraitDataUrl, customLogoDataUrl, motionEnabled, motionSensitivity } =
      req.body ?? {};
    const store = ensureStore();
    store.brand = {
      customPortraitDataUrl:
        customPortraitDataUrl === undefined
          ? store.brand.customPortraitDataUrl
          : customPortraitDataUrl,
      customLogoDataUrl:
        customLogoDataUrl === undefined ? store.brand.customLogoDataUrl : customLogoDataUrl,
      motionEnabled:
        typeof motionEnabled === 'boolean' ? motionEnabled : store.brand.motionEnabled,
      motionSensitivity:
        typeof motionSensitivity === 'number'
          ? Math.min(2, Math.max(0, motionSensitivity))
          : store.brand.motionSensitivity,
    };
    saveStore(store);
    res.json({ brand: store.brand });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
