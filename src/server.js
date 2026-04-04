/**
 * Shreenika AI — Traditional Voice Pipeline
 * Main Express Server with Complete Module Integration
 *
 * Date: 2026-03-19
 * Status: Full Module Integration (Agents, Contacts, Calls)
 */

// Load environment variables FIRST — before any module reads process.env
require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const mongoose   = require('mongoose');
const logger     = require('./utils/logger');
const WebSocket  = require('ws');
const multer     = require('multer');
const pdfParse   = require('pdf-parse');
const xlsx       = require('xlsx');
const streamMeta  = require('./shared/stream-meta.js'); // CallSid → {agentId, campaignId}
const { AudioCacheService } = require('./modules/voice/audio-cache.service.js');
const { SttService } = require('./utils/stt.service.js'); // STT side-channel (transcript + cache fingerprint)
const ContextCacheService = require('./utils/context-cache.service.js'); // Context Caching Layer 2

// ── Multer: store uploads in memory (no disk writes) ──
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── Language-matched filler phrases ──
// Used when Gemini takes >800ms to respond after user speech ends
const FILLERS = {
  'hi-IN':    ['हाँ...', 'ठीक है...', 'बिल्कुल...', 'जी हाँ...', 'समझ गया...'],
  'hi':       ['हाँ...', 'ठीक है...', 'बिल्कुल...', 'जी हाँ...'],
  'en-IN':    ['Sure...', 'Of course...', 'Let me check...', 'Absolutely...', 'Right...'],
  'en-US':    ['Sure...', 'Of course...', 'Let me check...', 'Absolutely...'],
  'en':       ['Sure...', 'Of course...', 'Let me check...', 'Absolutely...'],
  'mr-IN':    ['हो...', 'ठीक आहे...', 'नक्की...', 'बघतो...'],
  'mr':       ['हो...', 'ठीक आहे...', 'नक्की...'],
  'ta-IN':    ['சரி...', 'நிச்சயமாக...', 'பார்க்கிறேன்...'],
  'ta':       ['சரி...', 'நிச்சயமாக...'],
  'te-IN':    ['సరే...', 'తప్పకుండా...', 'చూస్తాను...'],
  'te':       ['సరే...', 'తప్పకుండా...'],
  'kn-IN':    ['ಸರಿ...', 'ಖಂಡಿತ...', 'ನೋಡುತ್ತೇನೆ...'],
  'bn-IN':    ['হ্যাঁ...', 'অবশ্যই...', 'দেখছি...'],
  'gu-IN':    ['હા...', 'બિલ્કુલ...', 'જોઉં છું...'],
  'default':  ['Sure...', 'Let me check...', 'One moment...', 'Absolutely...']
};

function getRandomFiller(language) {
  const lang = language || 'en-IN';
  const list = FILLERS[lang] || FILLERS[lang.split('-')[0]] || FILLERS['default'];
  return list[Math.floor(Math.random() * list.length)];
}

// Import Services
const AgentService = require('./modules/voice/agent.service');
const ContactService = require('./modules/contact/contact.service');
const CallService = require('./modules/call/call.service');
const { PsychologyEngine, PSYCHOLOGY_PRINCIPLES } = require('./modules/voice/psychology.engine');
const cacheService = require('./modules/voice/cache.service');
const BillingService = require('./modules/billing/billing.service');
const { requireMinutes, requireAgentSlot, requireDocSlot } = require('./modules/billing/plan-enforce.middleware');

// Import Routes
const passport          = require('passport');
const { requireAuth, requireSuperAdmin } = require('./modules/auth/auth.middleware.js');
const authRoutes        = require('./modules/auth/auth.routes.js');
const voipRoutes        = require('./modules/voip/voip.routes.js');
const campaignRoutes    = require('./modules/campaign/campaign.routes.js');
const callRoutes        = require('./modules/call/call.routes.js');
const twilioWebhook     = require('./modules/twilio/twilio.webhook.js');
const { handleSansPBXStream } = require('./modules/call/sanspbx-stream.handler.js');
const adminRoutes       = require('./modules/admin/admin.routes.js');
const { recoverOnBoot } = require('./modules/campaign/campaign-worker.service.js');

// Initialize Express app
const app = express();

// Middleware - CORS FIRST before helmet
const ALLOWED_ORIGINS = [
  // Local development
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  // Production Cloud Run frontend
  'https://shreenika-ai-frontend-507468019722.us-central1.run.app',
];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    // Allow any localhost port
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return callback(null, true);
    }
    // Allow known production origins
    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('CORS: Not allowed — ' + origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token']
}));
app.use(helmet({
  contentSecurityPolicy: false  // Disabled for local testing — inline scripts in talk-to-agent.html
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`[${req.method}] ${req.path}`, {
    timestamp: new Date().toISOString(),
    ip: req.ip
  });
  next();
});

// ============================================================
// AUTH ROUTES
// ============================================================
app.use(passport.initialize());
app.use('/auth', authRoutes);

// 🔹 TEMPORARY LOCAL TESTING BYPASS (REMOVE BEFORE PRODUCTION)
app.post('/auth/local-testing', async (req, res) => {
  try {
    const User = require('./modules/auth/user.model.js');
    const bcrypt = require('bcryptjs');
    const jwt = require('jsonwebtoken');
    const testEmail = 'test@local.shreenika';
    let user = await User.findOne({ email: testEmail });
    if (!user) {
      user = await User.create({ email: testEmail, name: 'Test User', password: await bcrypt.hash('test123456', 10), role: 'user', emailVerified: true, isActive: true });
    }
    const token = jwt.sign({ id: user._id.toString(), role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, user: { id: user._id.toString(), name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    return res.status(500).json({ message: 'Local testing failed: ' + err.message });
  }
});

// ============================================================
// VOIP ROUTES
// ============================================================
app.use('/voip', voipRoutes);

// ============================================================
// SUPER ADMIN ROUTES — requireAuth + requireSuperAdmin on all
// Registered at both /admin and /api/admin for frontend compatibility
// ============================================================
app.use('/admin',     requireAuth, requireSuperAdmin, adminRoutes);
app.use('/api/admin', requireAuth, requireSuperAdmin, adminRoutes);

// ============================================================
// CAMPAIGN ROUTES  (auth required — see campaign.routes.js)
// ============================================================
app.use('/api/campaigns', campaignRoutes);
app.use('/campaigns', requireAuth, campaignRoutes); // frontend calls /campaigns (without /api prefix)

// ============================================================
// TWILIO WEBHOOKS  (no auth — Twilio cannot send JWT tokens)
// ============================================================
app.use('/twilio', twilioWebhook);

// ============================================================
// SANSPBX WEBHOOKS  (no auth — SansPBX cannot send JWT tokens)
// ============================================================

// POST /sanspbx/status — SansPBX call status webhook (ringing, answered, completed, failed)
app.post('/sanspbx/status', async (req, res) => {
  res.sendStatus(200); // Acknowledge immediately
  try {
    const { callid, call_id, status, duration } = req.body;
    const sansPbxCallId = callid || call_id;
    if (!sansPbxCallId) return;

    const statusMap = {
      ringing:   'RINGING',
      answered:  'ANSWERED',
      completed: 'COMPLETED',
      failed:    'FAILED',
      'no-answer': 'NO_ANSWER',
    };

    const normalizedStatus = statusMap[status?.toLowerCase()] || status?.toUpperCase() || 'UNKNOWN';
    logger.info(`[SANSPBX/STATUS] callId=${sansPbxCallId} status=${normalizedStatus} duration=${duration}s`);

    const Call = require('./modules/call/call.model');
    await Call.findOneAndUpdate(
      { providerCallId: sansPbxCallId },
      {
        status:          normalizedStatus,
        durationSeconds: Number(duration) || 0,
        ...(normalizedStatus === 'COMPLETED' ? { endedAt: new Date() } : {}),
        ...(normalizedStatus === 'ANSWERED'  ? { answeredAt: new Date() } : {}),
      }
    );
  } catch (e) {
    logger.error('[SANSPBX/STATUS] Error:', e.message);
  }
});

// ============================================================
// HEALTH CHECK ENDPOINTS
// ============================================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '0.1.0'
  });
});

app.get('/api/status', (req, res) => {
  res.json({
    service: 'shreenika-ai-backend-traditional',
    status: 'running',
    modules: {
      agents: 'ready',
      contacts: 'ready',
      calls: 'ready',
      voice: 'initializing'
    },
    uptime_seconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});


// ============================================================
// MONGODB CONNECTION + ASYNC STARTUP
// ============================================================
async function initDB() {
  const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/shreenika-ai';
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    logger.info('[DB] MongoDB connected:', MONGO_URI);
  } catch (err) {
    logger.error('[DB] MongoDB connection failed:', err.message);
    logger.warn('[DB] Running WITHOUT persistent storage — data will be lost on restart');
  }
}

async function seedDefaultAgent() {
  try {
    const existing = await AgentService.getAllAgents();
    if (existing.length === 0) {
      await AgentService.createAgent({
        _fixedId: 'agent-default-001',
        agentName: 'Shreenika AI',
        agentRole: 'Sales Representative',
        agentObjective: 'Help customers understand our product plans and guide them toward the best fit for their needs',
        company: 'Shreenika AI',
        language: 'en-IN',
        primaryLanguage: 'en-IN',
        voiceId: 'Aoede',
        voiceTone: 'Professional and warm',
        voiceGender: 'FEMALE',
        characteristics: ['Professional', 'Empathetic', 'Confident', 'Persuasive'],
        welcomeMessage: "Hello! I'm Shreenika AI. I'm here to help you find the perfect solution for your needs. How can I assist you today?",
        systemPrompt: 'You are a Sales Representative for Shreenika AI. You help businesses adopt AI-powered voice agent technology. Focus on: explaining how AI voice agents save time and cost, the ease of setup, and the ROI businesses get from automating outbound calls. Always guide conversations toward booking a demo or starting a free trial.',
        psychologyPrinciples: ['RECIPROCITY', 'AUTHORITY', 'SOCIAL_PROOF', 'LIKING', 'SCARCITY', 'COMMITMENT'],
        callStartBehavior: 'waitForHuman',
        maxCallDuration: 3600,
        voicemailDetection: true,
        voicemailAction: 'hang_up',
        endCallOnSilence: 30000,
        industry: 'technology',
        description: 'Expert AI Sales Agent trained in all 6 Cialdini psychology principles with dynamic ratio blending',
        knowledgeBase: [
          {
            id: 'kb-001',
            title: 'Product Plans Overview',
            content: 'Starter Plan: ₹999/month — 100 AI calls, basic analytics. Pro Plan: ₹2999/month — 1000 AI calls, advanced analytics, priority support. Enterprise: Custom pricing — Unlimited calls, dedicated support, custom integration.',
            addedAt: new Date().toISOString()
          }
        ]
      });
      logger.info('[AGENT] Default agent seeded to MongoDB');
    } else {
      logger.info('[AGENT] Agents already exist in DB, skipping seed');
    }
  } catch (err) {
    logger.error('[AGENT] Seeding error:', err.message);
  }
}


// ============================================================
// TEST AGENT SESSION ENDPOINTS
// Called by TestAgentModal.tsx before opening WebSocket
// ============================================================

// Active test sessions store (in-memory)
const testSessions = {};

// POST /api/voice/test-agent/start
// Returns { sessionId, wsUrl, maxDuration }
// Requires auth + minutes balance (Test calls consume Gemini API minutes)
app.post('/api/voice/test-agent/start', requireAuth, requireMinutes, async (req, res) => {
  try {
    const { agentId } = req.body;

    // Get agent — use provided ID or fall back to first available
    let agent = agentId ? await AgentService.getAgentById(agentId) : null;
    if (!agent) {
      const allAgents = await AgentService.getAllAgents();
      agent = allAgents[0];
    }
    if (!agent) {
      return res.status(404).json({ success: false, error: 'No agent found. Please create an agent first.' });
    }

    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    testSessions[sessionId] = { agentId: agent._id || agent.id, startedAt: Date.now() };

    const baseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
    const wsBase  = baseUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
    const wsUrl   = `${wsBase}/live?agentId=${agent.agentId}&test=true`;

    logger.info('[TEST-AGENT] Session started:', sessionId, '| agent:', agent.agentName || agent.name);

    res.json({
      success: true,
      sessionId,
      wsUrl,
      maxDuration: agent.maxCallDuration || 3600,
      agentName: agent.agentName || agent.name
    });
  } catch (error) {
    logger.error('[TEST-AGENT] Start error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/voice/test-agent/:sessionId/end
app.post('/api/voice/test-agent/:sessionId/end', (req, res) => {
  const { sessionId } = req.params;
  if (testSessions[sessionId]) {
    const duration = Math.round((Date.now() - testSessions[sessionId].startedAt) / 1000);
    logger.info('[TEST-AGENT] Session ended:', sessionId, '| duration:', duration + 's');
    delete testSessions[sessionId];
  }
  res.json({ success: true, message: 'Session ended' });
});

// ============================================================
// AGENT MANAGEMENT ENDPOINTS
// ============================================================

// PUBLIC: Get all agents (NO AUTH REQUIRED for local testing)
app.get('/api/voice/agents', requireAuth, async (req, res) => {
  try {
    // SECURITY FIX: filter agents by the authenticated user's id — no cross-user data leakage
    const userId = req.user?.id || req.user?._id;
    const agents = await AgentService.getAllAgents(userId);
    logger.info('[AGENT] Fetched agents for user:', userId, '| count:', agents.length);
    res.json({
      success: true,
      agents: agents,
      count: agents.length,
      message: 'Agents retrieved successfully'
    });
  } catch (error) {
    logger.error('[AGENT] Error fetching agents:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUBLIC: Test endpoint - verify agent service
app.get('/api/test/agents-status', async (req, res) => {
  try {
    const agents = await AgentService.getAllAgents();
    res.json({
      agentsCount: agents.length,
      agents: agents,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREATE new agent — auth + plan limit enforcement
app.post('/api/voice/agents', requireAuth, requireAgentSlot(), async (req, res) => {
  try {
    // Attach userId so plan enforcement can count agents per user
    const agentData = { ...req.body, userId: req.user.id };
    const agent = await AgentService.createAgent(agentData);
    res.status(201).json({
      success: true,
      agent: agent,
      message: 'Agent created successfully'
    });
  } catch (error) {
    logger.error('[AGENT] Error creating agent:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// GET single agent
app.get('/api/voice/agents/:id', async (req, res) => {
  try {
    const agent = await AgentService.getAgentById(req.params.id);
    if (!agent) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }
    res.json({ success: true, agent: agent });
  } catch (error) {
    logger.error('[AGENT] Error fetching agent:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// UPDATE agent
app.put('/api/voice/agents/:id', async (req, res) => {
  try {
    const agent = await AgentService.updateAgent(req.params.id, req.body);
    if (!agent) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }
    res.json({ success: true, agent: agent, message: 'Agent updated successfully' });
  } catch (error) {
    logger.error('[AGENT] Error updating agent:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// DELETE agent
app.delete('/api/voice/agents/:id', async (req, res) => {
  try {
    await AgentService.deleteAgent(req.params.id);
    res.json({ success: true, message: 'Agent deleted successfully' });
  } catch (error) {
    logger.error('[AGENT] Error deleting agent:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET agent configuration
app.get('/api/voice/agents/:id/config', async (req, res) => {
  try {
    const config = await AgentService.getAgentConfig(req.params.id);
    if (!config) {
      return res.status(404).json({ success: false, message: 'Agent config not found' });
    }
    res.json({ success: true, config: config });
  } catch (error) {
    logger.error('[AGENT] Error fetching config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// KNOWLEDGE BASE — DOCUMENT UPLOAD (OCR)
// Accepts PDF or plain text. Extracts text and stores in agent knowledgeBase.
// ============================================================

// GET /api/voice/agents/:id/knowledge-base — list all docs for an agent
app.get('/api/voice/agents/:id/knowledge-base', requireAuth, async (req, res) => {
  try {
    const agent = await AgentService.getAgentById(req.params.id);
    if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });
    res.json({ success: true, documents: agent.knowledgeBase || [] });
  } catch (err) {
    logger.error('[KB] GET error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/voice/agents/:id/knowledge-base/upload', requireAuth, requireDocSlot, upload.single('file'), async (req, res) => {
  try {
    const agent = await AgentService.getAgentById(req.params.id);
    if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const { originalname, mimetype, buffer } = req.file;
    let extractedText = '';

    if (mimetype === 'application/pdf') {
      const parsed = await pdfParse(buffer);
      extractedText = parsed.text || '';
    } else if (mimetype === 'text/plain' || originalname.endsWith('.txt')) {
      extractedText = buffer.toString('utf8');
    } else {
      // For other file types (docx, etc.) — read raw text as fallback
      extractedText = buffer.toString('utf8').replace(/[^\x20-\x7E\n]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    if (!extractedText.trim()) {
      return res.status(400).json({ success: false, message: 'Could not extract text from file' });
    }

    // Limit per document: 15,000 characters to avoid bloating system instruction
    const MAX_CHARS = 15000;
    if (extractedText.length > MAX_CHARS) {
      extractedText = extractedText.substring(0, MAX_CHARS) + '\n[...document truncated at 15,000 characters]';
    }

    const doc = {
      id: `doc-${Date.now()}`,
      title: originalname,
      content: extractedText,
      size: `${Math.round(buffer.length / 1024)}KB`,
      type: mimetype,
      status: 'synced',
      uploadedAt: new Date().toISOString()
    };

    // Atomically push the new doc — avoids race conditions and silent failures
    const updated = await AgentService.addKnowledge(req.params.id, doc);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Agent not found — document not saved' });
    }

    logger.info('[KB] Document uploaded:', originalname, '| chars:', extractedText.length);
    res.json({ success: true, document: doc, message: 'Document uploaded and extracted successfully' });

  } catch (error) {
    logger.error('[KB] Upload error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE knowledge base document
app.delete('/api/voice/agents/:id/knowledge-base/:docId', async (req, res) => {
  try {
    // Atomically pull the doc — avoids race conditions and stale-read issues
    const updated = await AgentService.removeKnowledge(req.params.id, req.params.docId);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }

    res.json({ success: true, message: 'Document deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CONTACT MANAGEMENT ENDPOINTS  (MongoDB-backed, fully async)
// ============================================================

// ── Helper: parse a buffer into row objects regardless of file type ──────────
function parseContactFile(buffer, mimetype, originalname) {
  const ext = (originalname || '').split('.').pop().toLowerCase();

  // CSV — plain text parsing
  if (mimetype === 'text/csv' || ext === 'csv') {
    const text  = buffer.toString('utf8');
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row = {};
      headers.forEach((h, i) => { row[h] = values[i] || ''; });
      return row;
    });
  }

  // Excel (.xlsx / .xls)
  const wb   = xlsx.read(buffer, { type: 'buffer' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  return xlsx.utils.sheet_to_json(ws, { defval: '' });
}

// ── Normalise raw spreadsheet row → contact payload ─────────────────────────
function rowToContact(row) {
  // Accept flexible column names (case-insensitive)
  const get = (...keys) => {
    for (const k of keys) {
      const found = Object.keys(row).find(r => r.toLowerCase().replace(/[\s_]/g, '') === k.toLowerCase().replace(/[\s_]/g, ''));
      if (found && row[found] !== '' && row[found] !== undefined) return String(row[found]).trim();
    }
    return '';
  };

  return {
    firstName:  get('firstName', 'first_name', 'firstname', 'first'),
    lastName:   get('lastName',  'last_name',  'lastname',  'last'),
    email:      get('email', 'emailAddress', 'email_address'),
    phone:      get('phone', 'phoneNumber', 'phone_number', 'mobile', 'contact'),
    address:    get('address', 'officeAddress', 'office_address', 'location'),
    company: {
      name:      get('companyName', 'company', 'company_name', 'organization'),
      employees: Number(get('totalEmployees', 'employees', 'total_employees', 'employeeCount')) || undefined,
      website:   get('website', 'companyWebsite', 'company_website', 'url'),
    },
    jobTitle:   get('jobTitle', 'job_title', 'title', 'designation', 'position'),
    industry:   get('industry', 'sector'),
    notes:      get('notes', 'note', 'remarks', 'comments'),
  };
}

// GET all contacts — scoped to logged-in user
app.get('/api/contacts', requireAuth, async (req, res) => {
  try {
    const contacts = await ContactService.getAllContacts(req.query, req.user.id);
    res.json({ success: true, contacts, count: contacts.length });
  } catch (error) {
    logger.error('[CONTACT] Error fetching contacts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// CREATE one contact (manual form) — scoped to logged-in user
app.post('/api/contacts', requireAuth, async (req, res) => {
  try {
    const contact = await ContactService.createContact(req.body, req.user.id);
    res.status(201).json({ success: true, contact, message: 'Contact created successfully' });
  } catch (error) {
    logger.error('[CONTACT] Error creating contact:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// BULK IMPORT — CSV or Excel — scoped to logged-in user
app.post('/api/contacts/import', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const rows    = parseContactFile(req.file.buffer, req.file.mimetype, req.file.originalname);
    const ext     = (req.file.originalname || '').split('.').pop().toLowerCase();
    const source  = ext === 'csv' ? 'csv' : 'excel';
    const payload = rows.map(rowToContact).filter(r => r.firstName || r.phone);

    if (payload.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid rows found in file. Check column headers.' });
    }

    const result = await ContactService.bulkImportContacts(payload, source, req.user.id);
    logger.info(`[CONTACT] Bulk import: ${result.imported.length} imported, ${result.errors.length} errors`);
    res.json({
      success: true,
      imported: result.imported.length,
      errors:   result.errors,
      total:    result.total,
      message:  `${result.imported.length} contacts imported successfully`,
    });
  } catch (error) {
    logger.error('[CONTACT] Import error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET single contact
app.get('/api/contacts/:id', requireAuth, async (req, res) => {
  try {
    const contact = await ContactService.getContactById(req.params.id);
    if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
    res.json({ success: true, contact });
  } catch (error) {
    logger.error('[CONTACT] Error fetching contact:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// UPDATE contact
app.put('/api/contacts/:id', requireAuth, async (req, res) => {
  try {
    const contact = await ContactService.updateContact(req.params.id, req.body);
    if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
    res.json({ success: true, contact, message: 'Contact updated successfully' });
  } catch (error) {
    logger.error('[CONTACT] Error updating contact:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// DELETE contact
app.delete('/api/contacts/:id', requireAuth, async (req, res) => {
  try {
    await ContactService.deleteContact(req.params.id);
    res.json({ success: true, message: 'Contact deleted successfully' });
  } catch (error) {
    logger.error('[CONTACT] Error deleting contact:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// MARK contacted (called after a call)
app.post('/api/contacts/:id/mark-contacted', async (req, res) => {
  try {
    const contact = await ContactService.markContacted(req.params.id);
    res.json({ success: true, contact });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CALL MANAGEMENT ENDPOINTS  (MongoDB-backed, persistent)
// ============================================================
app.use('/api/calls', callRoutes);
app.use('/calls', requireAuth, callRoutes); // frontend calls /calls (without /api prefix)

// ── Contacts endpoints — frontend calls /contacts ──────────────────────────
app.get('/contacts', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const contacts = await ContactService.getAllContacts({}, userId);
    res.json({ success: true, contacts: contacts || [] });
  } catch (err) {
    logger.error('[CONTACTS] GET /contacts error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch contacts' });
  }
});

// Legacy shim kept for backward-compatibility — delegates to same route
// GET /api/agents/:id/call-stats
app.get('/api/agents/:id/call-stats', async (req, res) => {
  try {
    const Call = require('./modules/call/call.model.js');
    const mongoose = require('mongoose');
    const aId = req.params.id;
    if (!mongoose.isValidObjectId(aId)) {
      return res.status(400).json({ success: false, error: 'Invalid agent ID' });
    }
    const [stats] = await Call.aggregate([
      { $match: { agentId: new mongoose.Types.ObjectId(aId), archived: { $ne: true } } },
      { $group: {
        _id: null,
        totalCalls:    { $sum: 1 },
        completedCalls: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
        failedCalls:    { $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] } },
        avgDuration:    { $avg: '$durationSeconds' },
      }},
    ]);
    res.json({ success: true, stats: stats || { totalCalls: 0 } });
  } catch (error) {
    logger.error('[CALL] Error fetching stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// COMPATIBILITY: old outcome endpoint — maps to PUT /api/calls/:id
app.post('/api/calls/:id/outcome', async (req, res) => {
  try {
    const Call = require('./modules/call/call.model.js');
    const call = await Call.findByIdAndUpdate(
      req.params.id,
      { outcome: req.body.outcome },
      { new: true }
    );
    if (!call) {
      return res.status(404).json({ success: false, message: 'Call not found' });
    }
    res.json({ success: true, call, message: 'Outcome recorded' });
  } catch (error) {
    logger.error('[CALL] Error recording outcome:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ============================================================
// COMPLETE AI AGENT TEST ENDPOINT — A to Z (No Real Calls)
// Tests: Psychology, Language, Voice Config, Latency, Real Gemini Response, Role + Profile
// ============================================================

app.post('/api/voice/test-call', async (req, res) => {
  const startTime = Date.now();
  const psychologyEngine = new PsychologyEngine();

  try {
    const { agentId, input } = req.body;

    if (!agentId || !input) {
      return res.status(400).json({ success: false, error: 'agentId and input are required' });
    }

    const agent = await AgentService.getAgentById(agentId);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }

    logger.info('[AGENT_TEST] Starting complete test:', { agentId, inputLength: input.length });

    // STEP 1: Build psychology-enhanced prompt
    const selectedPrinciples = agent.psychologyPrinciples || ['RECIPROCITY', 'AUTHORITY', 'SOCIAL_PROOF'];
    const psychologyResult = psychologyEngine.buildEnhancedPrompt(agent, selectedPrinciples, input);

    // STEP 2: Check cache
    const cached = cacheService.get(agentId, input);
    let agentResponse = '';
    let cacheStatus = 'miss';
    let geminiLatencyMs = 0;

    if (cached) {
      agentResponse = cached.response;
      cacheStatus = cached.source; // 'personal' or 'global'
      logger.info('[AGENT_TEST] [CACHE] HIT from:', cached.source);
    } else {
      // STEP 3: Call REAL Gemini API (gemini-2.5-flash via Service Account)
      const geminiStart = Date.now();
      try {
        const { GoogleAuth } = require('google-auth-library');
        const path = require('path');

        const auth = new GoogleAuth({
          keyFile: path.join(__dirname, 'gen-lang-credentials.json'),
          scopes: ['https://www.googleapis.com/auth/generative-language']
        });
        const token = await auth.getAccessToken();

        const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
        const geminiBody = JSON.stringify({
          system_instruction: {
            parts: [{ text: psychologyResult.systemPrompt }]
          },
          contents: [{
            role: 'user',
            parts: [{ text: input }]
          }],
          generationConfig: {
            maxOutputTokens: 350,
            temperature: 0.75,
          }
        });

        const geminiResponse = await fetch(geminiUrl, {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          body: geminiBody
        });

        const geminiData = await geminiResponse.json();

        if (geminiData.candidates && geminiData.candidates[0]) {
          agentResponse = geminiData.candidates[0].content.parts[0].text;
          geminiLatencyMs = Date.now() - geminiStart;
          // Store in cache
          cacheService.set(agentId, input, agentResponse);
          cacheStatus = 'miss';
          logger.info('[AGENT_TEST] [GEMINI] gemini-2.5-flash response received in', geminiLatencyMs, 'ms');
        } else {
          throw new Error(geminiData.error?.message || 'No response from Gemini');
        }

      } catch (geminiErr) {
        geminiLatencyMs = Date.now() - geminiStart;
        logger.error('[AGENT_TEST] [GEMINI] Error:', geminiErr.message);
        return res.status(500).json({
          success: false,
          error: 'Gemini API error: ' + geminiErr.message,
          hint: 'Check service account credentials in src/gen-lang-credentials.json'
        });
      }
    }

    const totalLatencyMs = Date.now() - startTime;

    // STEP 4: Response quality scoring
    let responseQuality = 'Medium';
    let confidence = 0.75;
    if (totalLatencyMs < 1500 && agentResponse.length > 100) {
      responseQuality = 'Excellent';
      confidence = 0.95;
    } else if (totalLatencyMs < 3000 && agentResponse.length > 50) {
      responseQuality = 'Good';
      confidence = 0.85;
    } else if (totalLatencyMs > 5000) {
      responseQuality = 'Slow';
      confidence = 0.60;
    }

    const cacheStats = cacheService.getStats();

    // STEP 5: Build complete test result — flat output format for SimpleTestAgent display
    const testResult = {
      success: true,
      testId: 'test-' + Date.now(),
      agentId: agent._id || agent.id,

      // Agent Identity
      agent: {
        id: agent._id,
        name: agent.agentName || agent.name,
        role: agent.agentRole,
        objective: agent.agentObjective,
        company: agent.company,
        language: agent.language || agent.primaryLanguage || 'en-IN',
        voice: agent.voiceId || 'Aoede',
        voiceTone: agent.voiceTone || 'Professional and warm',
        characteristics: agent.characteristics || [],
        welcomeMessage: agent.welcomeMessage,
      },

      // Test Input
      input: input,

      // Output — format matches SimpleTestAgent.tsx expectations
      output: {
        agentResponse: agentResponse,
        responseLength: agentResponse.length,
        responseQuality: responseQuality,
        confidence: confidence,
        latencyMs: totalLatencyMs,
        geminiLatencyMs: geminiLatencyMs,
        cacheStatus: cacheStatus,
        psychologyApplied: psychologyResult.metadata.principlesApplied,
        taskRatio: psychologyResult.metadata.currentRatio.task,
        psychologyRatio: psychologyResult.metadata.currentRatio.psychology,
        sentimentDetected: psychologyResult.metadata.sentiment,
        objectionDetected: psychologyResult.metadata.isObjection,
        engagementLevel: psychologyResult.metadata.engagementLevel,
      },

      // Psychology Full Analysis
      psychology: {
        principlesApplied: psychologyResult.metadata.principlesApplied,
        currentRatio: psychologyResult.metadata.currentRatio,
        sentimentDetected: psychologyResult.metadata.sentiment,
        objectionDetected: psychologyResult.metadata.isObjection,
        engagementLevel: psychologyResult.metadata.engagementLevel,
        allPrinciples: Object.keys(PSYCHOLOGY_PRINCIPLES),
      },

      // Performance Metrics
      metrics: {
        totalLatencyMs: totalLatencyMs,
        geminiLatencyMs: geminiLatencyMs,
        cacheStatus: cacheStatus,
        cacheStats: cacheStats,
      },

      // Role + Profile
      profile: {
        systemPromptPreview: psychologyResult.systemPrompt.substring(0, 300) + '...',
        welcomeMessage: agent.welcomeMessage,
        maxCallDuration: agent.maxCallDuration,
        knowledgeBaseEnabled: (agent.knowledgeBase || []).length > 0,
        knowledgeBaseCount: (agent.knowledgeBase || []).length,
        industry: agent.industry,
      },

      timestamp: new Date().toISOString()
    };

    logger.info('[AGENT_TEST] Test COMPLETE:', {
      agentId,
      totalLatencyMs,
      geminiLatencyMs,
      cacheStatus,
      principlesApplied: psychologyResult.metadata.principlesApplied,
      responseQuality
    });

    res.json(testResult);

  } catch (error) {
    logger.error('[AGENT_TEST] Fatal error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      testId: 'test-' + Date.now()
    });
  }
});

// ============================================================
// VOICES ENDPOINT (both /api/voice and /voice prefixes)
// ============================================================

// Voices + language map + system instruction builder — shared module
const { GEMINI_VOICES, buildMasterSystemInstruction } = require('./utils/system-instruction');

app.get('/api/voice/voices/available', (req, res) => {
  res.json({ success: true, voices: GEMINI_VOICES });
});

// Frontend calls /api/voice/voices (without /available)
app.get('/api/voice/voices', (req, res) => {
  res.json({ success: true, voices: GEMINI_VOICES });
});

// Also serve without /api prefix (frontend calls /voice/voices/available)
app.get('/voice/voices/available', (req, res) => {
  res.json({ success: true, voices: GEMINI_VOICES });
});

// ============================================================
// BILLING MODULE — Full Stripe Integration
// ============================================================

// ── API Key Generator ─────────────────────────────────────────────────────────
// GET  /api/auth/api-key — return current API key (masked, last 8 chars visible)
// POST /api/auth/api-key — generate a new API key (replaces existing)

app.get('/api/auth/api-key', requireAuth, async (req, res) => {
  try {
    const UserModel = require('./modules/auth/user.model.js');
    const user = await UserModel.findById(req.user.id).select('apiKey').lean();
    if (!user?.apiKey) return res.json({ apiKey: null, masked: null });
    const masked = '••••••••••••••••••••••••' + user.apiKey.slice(-8);
    res.json({ masked, exists: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/auth/api-key', requireAuth, async (req, res) => {
  try {
    const crypto    = require('crypto');
    const UserModel = require('./modules/auth/user.model.js');
    const newKey    = 'sk-' + crypto.randomBytes(32).toString('hex');
    await UserModel.findByIdAndUpdate(req.user.id, { apiKey: newKey });
    const masked = '••••••••••••••••••••••••' + newKey.slice(-8);
    res.json({ apiKey: newKey, masked, message: 'API key generated. Copy it now — it will not be shown again.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================================

// GET /api/billing/status — current plan + limits (used by all sections)
app.get('/api/billing/status', requireAuth, async (req, res) => {
  try {
    const status = await BillingService.getBillingStatus(req.user.id);
    res.json(status);
  } catch (err) {
    logger.error('[BILLING] status error:', err.message);
    res.status(500).json({ message: 'Failed to get billing status' });
  }
});

// GET /billing/status — legacy alias (Dashboard uses this)
app.get('/billing/status', requireAuth, async (req, res) => {
  try {
    const status = await BillingService.getBillingStatus(req.user.id);
    res.json(status);
  } catch (err) {
    res.status(500).json({ message: 'Failed to get billing status' });
  }
});

// GET /billing/usage — usage stats + monthly breakdown for graphs
app.get('/billing/usage', requireAuth, async (req, res) => {
  try {
    const usage = await BillingService.getUsageStats(req.user.id);
    res.json(usage);
  } catch (err) {
    logger.error('[BILLING] usage error:', err.message);
    res.status(500).json({ message: 'Failed to get usage stats' });
  }
});

// GET /api/billing/usage — alias
app.get('/api/billing/usage', requireAuth, async (req, res) => {
  try {
    const usage = await BillingService.getUsageStats(req.user.id);
    res.json(usage);
  } catch (err) {
    res.status(500).json({ message: 'Failed to get usage stats' });
  }
});

// GET /api/billing/invoices — invoice history
app.get('/api/billing/invoices', requireAuth, async (req, res) => {
  try {
    const invoices = await BillingService.getInvoices(req.user.id);
    res.json({ success: true, invoices });
  } catch (err) {
    logger.error('[BILLING] invoices error:', err.message);
    res.status(500).json({ message: 'Failed to get invoices' });
  }
});

// GET /billing/invoices — alias (frontend calls without /api prefix)
app.get('/billing/invoices', requireAuth, async (req, res) => {
  try {
    const invoices = await BillingService.getInvoices(req.user.id);
    res.json({ success: true, invoices });
  } catch (err) {
    res.status(500).json({ message: 'Failed to get invoices' });
  }
});

// PUT /billing/plan — create Stripe checkout for plan upgrade (alias)
app.put('/billing/plan', requireAuth, async (req, res) => {
  try {
    const { newPlan, billingCycle = 'monthly' } = req.body;
    if (!newPlan) return res.status(400).json({ message: 'Plan is required' });
    const UserModel = require('./modules/auth/user.model.js');
    const user = await UserModel.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3011';
    const session = await BillingService.createCheckoutSession(
      req.user.id, user.email, user.name,
      { plan: newPlan, billingCycle, frontendUrl }
    );
    res.json({ requiresPayment: true, checkoutUrl: session.url, sessionId: session.sessionId });
  } catch (err) {
    logger.error('[BILLING] plan update error:', err.message);
    res.status(400).json({ message: err.message });
  }
});

// POST /billing/recharge — alias for minute recharge
app.post('/billing/recharge', requireAuth, async (req, res) => {
  try {
    const { minutes } = req.body;
    if (!minutes || minutes < 100) return res.status(400).json({ message: 'Minimum recharge is 100 minutes' });
    const UserModel = require('./modules/auth/user.model.js');
    const user = await UserModel.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const intent = await BillingService.createRechargeIntent(req.user.id, user.email, user.name, { minutes });
    res.json(intent);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// POST /api/billing/checkout — create Stripe checkout session for plan upgrade
app.post('/api/billing/checkout', requireAuth, async (req, res) => {
  try {
    const { plan, billingCycle } = req.body;
    const user = await require('./modules/auth/user.model.js').findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3011';
    const session = await BillingService.createCheckoutSession(
      req.user.id, user.email, user.name,
      { plan, billingCycle, frontendUrl }
    );
    res.json(session);
  } catch (err) {
    logger.error('[BILLING] checkout error:', err.message);
    res.status(400).json({ message: err.message });
  }
});

// POST /api/billing/recharge — create payment intent for minute recharge
app.post('/api/billing/recharge', requireAuth, async (req, res) => {
  try {
    const { minutes } = req.body;
    if (!minutes || minutes < 100) return res.status(400).json({ message: 'Minimum recharge is 100 minutes' });

    const user = await require('./modules/auth/user.model.js').findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const intent = await BillingService.createRechargeIntent(
      req.user.id, user.email, user.name, { minutes }
    );
    res.json(intent);
  } catch (err) {
    logger.error('[BILLING] recharge error:', err.message);
    res.status(400).json({ message: err.message });
  }
});

// POST /api/billing/webhook — Stripe webhook (raw body required)
app.post('/api/billing/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      const sig = req.headers['stripe-signature'];
      const result = await BillingService.handleWebhook(req.body, sig);
      res.json(result);
    } catch (err) {
      logger.error('[BILLING] webhook error:', err.message);
      res.status(400).json({ message: err.message });
    }
  }
);

// (Duplicate test-call route removed — full AI test endpoint is defined above)

// ============================================================
// ERROR HANDLING
// ============================================================

app.use((err, req, res, next) => {
  logger.error('[ERROR]', {
    message: err.message,
    stack: err.stack,
    path: req.path
  });

  res.status(err.status || 500).json({
    error: true,
    message: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
    timestamp: new Date().toISOString()
  });
});

// Serve talk-to-agent.html at http://localhost:5000/talk
const path = require('path');
app.get('/talk', (req, res) => {
  res.sendFile(path.join(__dirname, '../talk-to-agent.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: true,
    message: `Route not found: ${req.method} ${req.path}`,
    timestamp: new Date().toISOString()
  });
});

// ============================================================
// SERVER STARTUP
// ============================================================

const PORT = process.env.PORT || 5000;

// ── Create HTTP server synchronously so WebSocket + Socket.IO can attach ─────
const http      = require('http');
const { Server: SocketIOServer } = require('socket.io');
const server    = http.createServer(app);

// ── Socket.IO — real-time campaign progress ───────────────────────────────────
const io = new SocketIOServer(server, {
  // CRITICAL: destroyUpgrade:false prevents engine.io from destroying /live and
  // /twilio-stream WebSocket upgrade requests. Without this, engine.io intercepts
  // ALL http server upgrade events and schedules socket.destroy() for any path it
  // doesn't own — causing "Invalid frame header" on the raw ws.Server paths.
  // Frontend clients are forced to polling-only (transports:['polling'] in each
  // component), so Socket.IO WebSocket transport is never actually used.
  destroyUpgrade: false,
  cors: {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return cb(null, true);
      }
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      cb(new Error('Socket.IO CORS: Not allowed'));
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

io.on('connection', (socket) => {
  logger.info(`[SOCKET.IO] Client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    logger.info(`[SOCKET.IO] Client disconnected: ${socket.id}`);
  });
});

// Export io for lazy-loading in campaign-worker.service.js
module.exports = { app, server, io };

// ── Boot sequence: DB → seed → recover campaigns → start listening ────────────
(async () => {
  await initDB();
  await seedDefaultAgent();
  await recoverOnBoot();          // Pause any orphaned 'running' campaigns
  // AudioCacheService uses lazy GCS init — no explicit bucket warm-up needed
  server.listen(PORT, () => {
    logger.info(`[SERVER] Traditional Voice Pipeline started on port ${PORT}`);
    logger.info(`[MODULES] Agents | Contacts | Calls | Campaigns | VOIP | Socket.IO ready`);
    logger.info(`[ENVIRONMENT] ${process.env.NODE_ENV || 'development'}`);
    logger.info(`[TIMESTAMP] ${new Date().toISOString()}`);
    if (!process.env.PUBLIC_BASE_URL) {
      logger.warn(`[CONFIG] PUBLIC_BASE_URL not set — Twilio call initiation will be disabled.`);
      logger.warn(`[CONFIG] Set PUBLIC_BASE_URL=https://<ngrok-url> in .env to enable outbound calls.`);
    }
  });
})().catch(err => {
  logger.error('[BOOT] Fatal startup error:', err.message);
  process.exit(1);
});

// ============================================================
// GEMINI LIVE — WebSocket Proxy (Native Audio)
// Model: gemini-live-2.5-flash-native-audio (from .env)
// Protocol: Vertex AI BidiGenerateContent WebSocket
// Path: ws://localhost:5000/live
// Features: Master system instruction, tool calling (end_call, voicemail_detected),
//           welcome message, 90% duration reminder
// ============================================================

// ROOT CAUSE FIX — "Invalid frame header" in browser
// ─────────────────────────────────────────────────────────────────────────────
// When both wss (/live) and wssTwilio (/twilio-stream) are attached to the same
// http.Server via `server:`, Node.js fires the `upgrade` event to BOTH handlers.
// ws 8.x calls `abortHandshake(socket, 400)` for path mismatches — so wssTwilio
// was sending "HTTP/1.1 400 Bad Request" bytes onto the already-upgraded /live
// WebSocket socket.  Chrome sees byte 0x48 ('H') as a WebSocket frame header with
// RSV1=1, which is a protocol error → "Invalid frame header".
//
// FIX: use noServer:true on both servers and route upgrade requests manually with
// a single handler so only ONE server ever responds to any given upgrade.
// ─────────────────────────────────────────────────────────────────────────────
const wss = new WebSocket.Server({
  noServer: true,
  perMessageDeflate: { threshold: Infinity }
});

wss.on('connection', async (clientWs, req) => {
  // Force compress:false on EVERY outgoing frame to this client.
  // Cloud Run's HTTP/2 GFE proxy does NOT understand the perMessageDeflate RSV1 bit —
  // if a frame is compressed (RSV1=1), the proxy forwards it unmodified but the browser
  // rejects it with "Invalid frame header" because RSV1=1 without extension negotiation
  // appearing on the wire means a protocol error.  threshold:Infinity alone is not
  // always honoured by the ws library for already-negotiated sessions, so we override
  // the send method here as an absolute guarantee.
  const _origSend = clientWs.send.bind(clientWs);
  clientWs.send = function (data, options, cb) {
    if (typeof options === 'function') { cb = options; options = {}; }
    if (options === undefined || options === null) options = {};
    options = Object.assign({}, options, { compress: false });
    return _origSend(data, options, cb);
  };

  const qStr   = req.url.includes('?') ? req.url.split('?')[1] : '';
  const params = new URLSearchParams(qStr);
  const agentId = params.get('agentId');
  const isTestSession = params.get('test') === 'true';

  logger.info('[LIVE] New connection — agentId:', agentId, '| test:', isTestSession);

  const agent = await AgentService.getAgentById(agentId);
  if (!agent) {
    clientWs.send(JSON.stringify({ type: 'error', message: 'Agent not found: ' + agentId }));
    clientWs.close();
    return;
  }

  // For test sessions from browser — disable voicemail detection (no real phone call)
  if (isTestSession) {
    agent.voicemailDetection = false;
  }

  // Build master system instruction — snapshot locked for this call
  const masterInstruction = buildMasterSystemInstruction(agent);

  // Context Caching Layer 2 — attempt to use cached system instruction
  const modelNameForCache  = (process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-native-audio').replace(/-latest$/, '');
  const cachedContentName  = await ContextCacheService.getOrCreate(agent, masterInstruction, modelNameForCache);

  let geminiWs           = null;
  let durationTimer      = null;
  let fillerTimer        = null;
  let silenceTimer       = null;   // disconnect if human is silent for endCallOnSilence ms
  let endCallScheduled   = false;
  let billingDeducted    = false;  // guard — prevent double billing on end_call + close
  const callStartTime    = Date.now();
  const agentLanguage    = agent.language || agent.primaryLanguage || 'en-IN';
  // Normalize silence threshold: DB may store old seconds-based value (e.g. 15, 30) or new ms-based (30000)
  const rawSilence = agent.silenceDetectionMs || 30;
  const silenceThreshold = rawSilence < 1000 ? rawSilence * 1000 : rawSilence; // always results in ms

  // ── Transcript accumulator ────────────────────────────────────────────────
  // Each entry: { speaker: 'Agent' | 'Human', text: string }
  const transcriptParts = [];

  // callDocId is set when a campaign call creates a Call DB record
  // For test sessions it stays null — we still accumulate transcript in memory
  let liveCallDocId = params.get('callDocId') || null;

  // ── STT side-channel — transcribes browser audio to text (transcript + cache fingerprint) ──
  const liveSttService = new SttService({ languageCode: agentLanguage });
  liveSttService.on('transcript', ({ text }) => {
    if (!text) return;
    transcriptParts.push({ speaker: 'Human', text });
    logger.info('[LIVE] [STT] Human:', text.substring(0, 80));
  });
  liveSttService.start();

  function cleanup() {
    if (durationTimer) { clearTimeout(durationTimer); durationTimer = null; }
    if (fillerTimer)   { clearTimeout(fillerTimer);   fillerTimer   = null; }
    if (silenceTimer)  { clearTimeout(silenceTimer);  silenceTimer  = null; }
    liveSttService.destroy();
  }

  // Reset silence-disconnect timer — called every time user audio arrives
  function resetSilenceTimer() {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      if (endCallScheduled) return;
      logger.info('[LIVE] Silence timeout reached (' + silenceThreshold + 'ms) — disconnecting call');
      endCallScheduled = true;
      io.emit('CALL_STATUS_UPDATE', { event: 'call_ended', agentId, reason: 'silence_timeout', isTest: isTestSession });
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: 'ended', reason: 'silence_timeout' }));
      }
      cleanup();
      if (geminiWs) { try { geminiWs.close(); } catch (_) {} }
      if (clientWs) { try { clientWs.close(); } catch (_) {} }
    }, silenceThreshold);
  }

  // Inject a filler phrase — Gemini speaks it as a brief acknowledgement
  function injectFiller() {
    if (!geminiWs || geminiWs.readyState !== WebSocket.OPEN) return;
    if (endCallScheduled) return;
    const phrase = getRandomFiller(agentLanguage);
    geminiWs.send(JSON.stringify({
      clientContent: {
        turns: [{ role: 'user', parts: [{ text: `Say only this filler phrase right now: "${phrase}"` }] }],
        turnComplete: true   // FIX: was false — must be true so Gemini generates the audio response immediately
      }
    }));
    logger.info('[LIVE] [FILLER] Injected:', phrase, '| lang:', agentLanguage);
  }

  try {
    const { GoogleAuth } = require('google-auth-library');
    const auth = new GoogleAuth({
      // Use GOOGLE_APPLICATION_CREDENTIALS env var (works both locally and in Cloud Run)
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const token = await auth.getAccessToken();

    // Strip -latest suffix — Vertex AI model path does not use it
    const modelName = (process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-native-audio').replace(/-latest$/, '');
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || 'gen-lang-client-0348687456';
    // NOTE: v1beta1 is used (not v1) — gemini-live-2.5-flash-native-audio is a preview model
    // available on Vertex AI v1beta1 endpoint. The v1 endpoint rejects the setup without
    // sending setupComplete, causing the WebSocket to close immediately.
    const geminiUrl = 'wss://us-central1-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent';

    geminiWs = new WebSocket(geminiUrl, {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    geminiWs.on('open', () => {
      logger.info('[LIVE] Connected to Vertex AI Gemini Live, model:', modelName);

      // ── Map interruption sensitivity (0–1) to Gemini VAD enum ──
      // Keeping START_SENSITIVITY_LOW as default — HIGH triggers on backchannels
      // ("Hmm", "Achha", "Umm") and physically interrupts Gemini mid-sentence at
      // infrastructure level, overriding the system instruction backchannel rule.
      const sensitivity    = agent.interruptionSensitivity || 0.5;
      const speechStart    = sensitivity > 0.5 ? 'START_SENSITIVITY_HIGH' : 'START_SENSITIVITY_LOW';
      const speechEnd      = sensitivity > 0.5 ? 'END_SENSITIVITY_HIGH'   : 'END_SENSITIVITY_LOW';

      const setupMsg = {
        setup: {
          model: `projects/${projectId}/locations/us-central1/publishers/google/models/${modelName}`,
          generationConfig: {
            responseModalities: ['AUDIO'],
            // NOTE: inputAudioTranscription / outputAudioTranscription are NOT supported
            // on Vertex AI v1 — they cause Gemini to reject setup and close the WS without
            // sending setupComplete. These fields work only on AI Studio (v1beta).
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: agent.voiceId || 'Aoede'
                }
              },
              // languageCode tells Gemini which language to speak
              // Without this, Gemini defaults to English regardless of system instruction
              languageCode: agent.language || agent.primaryLanguage || 'en-IN'
            }
          },
          // ── Voice Activity Detection — wired to interruptionSensitivity ──
          realtimeInputConfig: {
            automaticActivityDetection: {
              startOfSpeechSensitivity: speechStart,
              endOfSpeechSensitivity:   speechEnd,
            }
          },
          // ── Affective dialog — NOT supported on Vertex AI (AI Studio only) — disabled ──
          // enableAffectiveDialog: true  ← causes "Unknown name" error on Vertex AI
          // ── Proactivity — NOT supported on Vertex AI — disabled ──
          // proactivity: { proactiveAudio: true }  ← causes "Unknown name" error on Vertex AI
          // Context Caching Layer 2: use cachedContent ID if available (75% token cost reduction)
          ...(cachedContentName
            ? { cachedContent: cachedContentName }
            : { systemInstruction: { parts: [{ text: masterInstruction }] } }
          ),
          tools: [{
            functionDeclarations: [
              {
                name: 'end_call',
                description: 'Call this function when the conversation has naturally concluded and it is time to hang up the call.',
                parameters: {
                  type: 'object',
                  properties: {
                    sentiment: {
                      type: 'string',
                      enum: ['positive', 'negative', 'neutral'],
                      description: 'Overall sentiment of the call'
                    },
                    summary: {
                      type: 'string',
                      description: 'Brief summary of what was discussed and agreed (for positive/neutral calls only)'
                    }
                  },
                  required: ['sentiment']
                }
              },
              // Only declare voicemail_detected tool when detection is enabled.
              // If the tool is declared but detection is disabled (e.g. test sessions),
              // Gemini still calls it — so we must omit the declaration entirely.
              ...(agent.voicemailDetection !== false ? [{
                name: 'voicemail_detected',
                description: 'Call this function immediately when you detect a voicemail system or automated phone system instead of a real human.',
                parameters: {
                  type: 'object',
                  properties: {}
                }
              }] : [])
            ]
          }]
        }
      };

      geminiWs.send(JSON.stringify(setupMsg));
      logger.info('[LIVE] Setup sent — voice:', agent.voiceId, '| maxDuration:', agent.maxCallDuration, 'sec');
    });

    // Gemini → Client: handle all incoming messages
    geminiWs.on('message', (rawData) => {
      try {
        const msg = JSON.parse(rawData.toString());

        // ── Setup complete ──
        if (msg.setupComplete !== undefined) {
          logger.info('[LIVE] Setup complete — sending welcome message + starting timers | silenceThreshold:', silenceThreshold + 'ms');

          // Start silence-disconnect timer — will reset every time user speaks.
          // For TEST sessions: skip — the browser AudioWorklet takes 1-2s to load.
          // Starting the timer here for test sessions causes the WS to close before
          // the frontend ever sends audio (e.g. silenceDetectionMs=3 → 3s timer fires first).
          // The timer will start naturally on the first audio chunk from the browser.
          if (!isTestSession) {
            resetSilenceTimer();
          }

          // Notify frontend — session is ready
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'ready', agentName: agent.agentName }));
          }

          // ── Emit real-time dashboard update — call started ──
          io.emit('CALL_STATUS_UPDATE', { event: 'call_started', agentId, isTest: isTestSession });

          // ── Call Start Behavior ──
          // 'waitForHuman'      → agent stays silent, human speaks first
          // 'startImmediately'  → agent speaks welcome message immediately (default)
          const callStartBehavior = agent.callStartBehavior || 'startImmediately';
          const welcomeMsg = agent.welcomeMessage;

          if (welcomeMsg && callStartBehavior !== 'waitForHuman') {
            setTimeout(() => {
              if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
                geminiWs.send(JSON.stringify({
                  clientContent: {
                    turns: [{ role: 'user', parts: [{ text: `SYSTEM: A new call has just connected. Greet the caller by speaking this opening message exactly as written: "${welcomeMsg}". After speaking it, stay silent and wait for the caller to respond. Do NOT call end_call now — the conversation has not started yet.` }] }],
                    turnComplete: true
                  }
                }));
                logger.info('[LIVE] Welcome message dispatched to Gemini');
              }
            }, 500);
          } else if (callStartBehavior === 'waitForHuman') {
            logger.info('[LIVE] callStartBehavior=waitForHuman — agent silent, waiting for human to speak first');
          }

          // 90% duration reminder timer — NOT a hard disconnect
          const maxDurationMs = (agent.maxCallDuration || 3600) * 1000;
          const reminderMs    = Math.floor(maxDurationMs * 0.9);
          const remainingSec  = Math.round((maxDurationMs - reminderMs) / 1000);

          durationTimer = setTimeout(() => {
            if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
              geminiWs.send(JSON.stringify({
                clientContent: {
                  turns: [{
                    role: 'user',
                    parts: [{ text: `SYSTEM REMINDER: You have approximately ${remainingSec} seconds remaining in this call. Please start concluding the conversation naturally and gracefully.` }]
                  }],
                  turnComplete: true
                }
              }));
              logger.info('[LIVE] 90% duration reminder sent — ~' + remainingSec + 's remaining');
            }
          }, reminderMs);

          return;
        }

        // ── Tool call from Gemini ──
        if (msg.toolCall && msg.toolCall.functionCalls) {
          for (const fc of msg.toolCall.functionCalls) {

            // end_call tool — natural conclusion
            if (fc.name === 'end_call' && !endCallScheduled) {
              const durationSec = Math.round((Date.now() - callStartTime) / 1000);

              // Hard server-side guard: reject end_call if called before 45 seconds.
              // Gemini occasionally calls end_call too eagerly on first human utterance.
              if (durationSec < 45) {
                logger.warn('[LIVE] [END_CALL] Rejected — too early at ' + durationSec + 's. Telling Gemini to continue.');
                if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
                  geminiWs.send(JSON.stringify({
                    toolResponse: {
                      functionResponses: [{
                        id: fc.id,
                        name: 'end_call',
                        response: { output: 'The conversation has just started. Do NOT end the call yet. Continue the conversation — ask follow-up questions and engage the caller.' }
                      }]
                    }
                  }));
                }
                endCallScheduled = false; // reset so it can be called again later
                return; // skip end_call processing
              }

              endCallScheduled = true;
              const sentiment  = (fc.args && fc.args.sentiment) || 'neutral';
              const summary    = (fc.args && fc.args.summary)   || '';

              logger.info('[LIVE] [END_CALL] Called — sentiment:', sentiment, '| duration:', durationSec + 's');

              // Notify frontend
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({
                  type: 'call_concluding',
                  sentiment,
                  summary,
                  durationSec
                }));
              }

              // For positive/neutral: send tool response so Gemini speaks the summary
              if ((sentiment === 'positive' || sentiment === 'neutral') && summary) {
                if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
                  geminiWs.send(JSON.stringify({
                    toolResponse: {
                      functionResponses: [{
                        id: fc.id,
                        name: 'end_call',
                        response: { output: 'Please speak the conclusion summary now, then say goodbye.' }
                      }]
                    }
                  }));
                }
              }

              // FIX: 5s delay (was 3s) — ensures Gemini's closing audio fully reaches the caller
              // before connection drops. Gives 2-3s buffer after Gemini finishes speaking.
              setTimeout(async () => {
                cleanup();
                logger.info('[LIVE] Call ended cleanly — sentiment:', sentiment);

                // ── Deduct minutes from user's balance ──
                if (!billingDeducted) {
                  billingDeducted = true;
                  try {
                    const jwt = require('jsonwebtoken');
                    let wsUserId = null;
                    const tokenParam = params.get('token');
                    if (tokenParam) {
                      const decoded = jwt.verify(tokenParam, process.env.JWT_SECRET);
                      wsUserId = decoded?.id;
                    }
                    if (wsUserId && durationSec > 0) {
                      await BillingService.deductMinutes(wsUserId, {
                        durationSeconds: durationSec,
                        source:   isTestSession ? 'test_agent' : 'campaign',
                        agentId,
                        cacheMinutes: 0,
                      });
                      logger.info('[LIVE] [BILLING] Deducted', Math.ceil(durationSec / 60), 'min from userId:', wsUserId);
                    }
                  } catch (billingErr) {
                    logger.error('[LIVE] [BILLING] Minute deduction failed:', billingErr.message);
                  }
                }

                // ── Save transcript + summary to Call DB record ──────────
                try {
                  if (liveCallDocId && transcriptParts.length > 0) {
                    const transcriptText = transcriptParts
                      .map(p => `${p.speaker}: ${p.text}`)
                      .join('\n');
                    const Call = require('./modules/call/call.model.js');
                    await Call.findByIdAndUpdate(liveCallDocId, {
                      transcript:       transcriptText,
                      transcriptStatus: 'completed',
                      ...(summary ? { summary } : {}),
                    });
                    logger.info('[LIVE] [TRANSCRIPT] Saved', transcriptParts.length, 'turns to call', liveCallDocId);
                  }
                } catch (transcriptErr) {
                  logger.error('[LIVE] [TRANSCRIPT] Save failed:', transcriptErr.message);
                }

                // ── Emit real-time dashboard update — call ended ──
                io.emit('CALL_STATUS_UPDATE', { event: 'call_ended', agentId, sentiment, durationSec, isTest: isTestSession });

                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(JSON.stringify({ type: 'call_ended', reason: 'natural_conclusion', sentiment, durationSec }));
                  clientWs.close();
                }
                if (geminiWs && geminiWs.readyState === WebSocket.OPEN) geminiWs.close();
              }, 5000);
            }

            // voicemail_detected tool — hang up immediately
            if (fc.name === 'voicemail_detected') {
              logger.info('[LIVE] [VOICEMAIL] Detected — hanging up immediately');
              cleanup();
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'call_ended', reason: 'voicemail_detected' }));
                clientWs.close();
              }
              if (geminiWs && geminiWs.readyState === WebSocket.OPEN) geminiWs.close();
            }
          }
          return;
        }

        // NOTE: inputTranscription / outputTranscription not used — not supported on Vertex AI v1.
        // Caller transcript is handled by liveSttService (Google STT side-channel, wired above).

        // ── Forward audio to client in TestAgentModal protocol ──
        if (msg.serverContent && msg.serverContent.modelTurn && msg.serverContent.modelTurn.parts) {
          // Cancel filler timer — Gemini is responding
          if (fillerTimer) { clearTimeout(fillerTimer); fillerTimer = null; }

          for (const part of msg.serverContent.modelTurn.parts) {
            if (part.inlineData && part.inlineData.data) {
              // Audio chunk — send as { type: 'AUDIO', audio: base64, sampleRate: 24000 }
              const mimeType = part.inlineData.mimeType || 'audio/pcm;rate=24000';
              const rateMatch = mimeType.match(/rate=(\d+)/);
              const sampleRate = rateMatch ? parseInt(rateMatch[1]) : 24000;
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'AUDIO', audio: part.inlineData.data, sampleRate }));
              }
            } else if (part.text) {
              // Text-only fallback — send to client
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'TEXT_FALLBACK', text: part.text }));
              }
            }
          }
        }

      } catch (e) {
        logger.error('[LIVE] Parse error from Gemini:', e.message);
      }
    });

    // Client → Gemini: forward audio and text input
    clientWs.on('message', (rawData) => {
      if (!geminiWs || geminiWs.readyState !== WebSocket.OPEN) return;
      try {
        const msg = JSON.parse(rawData.toString());

        if (msg.type === 'audio' || msg.type === 'AUDIO') {
          // Microphone PCM audio — base64-encoded
          // TestAgentModal sends { type: 'AUDIO', audio, sampleRate }
          // talk-to-agent.html sends { type: 'audio', data }
          const audioData  = msg.audio || msg.data;
          const sampleRate = msg.sampleRate || 16000;
          geminiWs.send(JSON.stringify({
            realtimeInput: {
              mediaChunks: [{ mimeType: `audio/pcm;rate=${sampleRate}`, data: audioData }]
            }
          }));

          // STT side-channel — only feed 16kHz audio (STT requires 16kHz LINEAR16)
          if (sampleRate === 16000 && audioData) {
            liveSttService.write(Buffer.from(audioData, 'base64'));
          }

          // Reset filler timer on each audio chunk — 800ms after last user audio chunk
          if (fillerTimer) clearTimeout(fillerTimer);
          fillerTimer = setTimeout(() => {
            fillerTimer = null;
            injectFiller();
          }, 800);

          // Reset silence-disconnect timer — resets on every user audio chunk
          resetSilenceTimer();
        } else if (msg.type === 'text') {
          // Text input — Gemini responds with native audio
          geminiWs.send(JSON.stringify({
            clientContent: {
              turns: [{ role: 'user', parts: [{ text: msg.text }] }],
              turnComplete: true
            }
          }));
          // Capture human text turn into transcript
          if (msg.text && msg.text.trim() && !msg.text.startsWith('SYSTEM:')) {
            transcriptParts.push({ speaker: 'Human', text: msg.text.trim() });
          }
          logger.info('[LIVE] Text → Gemini:', msg.text.substring(0, 80));
        }
      } catch (e) {
        logger.error('[LIVE] Client message error:', e.message);
      }
    });

    geminiWs.on('error', (err) => {
      logger.error('[LIVE] Gemini WS error:', err.message);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: 'error', message: 'Gemini error: ' + err.message }));
      }
    });

    geminiWs.on('close', (code, reason) => {
      const reasonStr = Buffer.isBuffer(reason) ? reason.toString('utf8') : String(reason || '');
      logger.info('[LIVE] Gemini WS closed — code:', code, '| reason:', reasonStr || '(none)');
      cleanup();
      if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
    });

  } catch (err) {
    logger.error('[LIVE] Init error:', err.message);
    cleanup();
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: 'error', message: 'Init failed: ' + err.message }));
      clientWs.close();
    }
  }

  clientWs.on('close', async () => {
    logger.info('[LIVE] Client disconnected');
    cleanup();
    if (geminiWs && geminiWs.readyState === WebSocket.OPEN) geminiWs.close();
    // Fallback billing: if user closed browser without triggering end_call, deduct here
    if (!billingDeducted) {
      billingDeducted = true;
      try {
        const durationSec = Math.round((Date.now() - callStartTime) / 1000);
        if (durationSec > 5) { // skip accidental <5s connections
          const jwt = require('jsonwebtoken');
          const tokenParam = params.get('token');
          if (tokenParam) {
            const decoded = jwt.verify(tokenParam, process.env.JWT_SECRET);
            const wsUserId = decoded?.id;
            if (wsUserId) {
              await BillingService.deductMinutes(wsUserId, {
                durationSeconds: durationSec,
                source: isTestSession ? 'test_agent' : 'campaign',
                agentId,
                cacheMinutes: 0,
              });
              logger.info('[LIVE] [BILLING] Fallback deduct on close:', Math.ceil(durationSec / 60), 'min userId:', wsUserId);
            }
          }
        }
      } catch (e) {
        logger.error('[LIVE] [BILLING] Fallback billing error:', e.message);
      }
    }
  });
});

// ============================================================
// TWILIO MEDIA STREAMS ↔ GEMINI LIVE BRIDGE
// Path: wss://host/twilio-stream
// Protocol: Twilio Media Streams (JSON text frames)
// Audio in:  mulaw 8kHz (Twilio) → PCM 16kHz (Gemini)
// Audio out: PCM 24kHz (Gemini)  → mulaw 8kHz (Twilio)
// ============================================================

// ── Pure-JS mu-law codec (ITU-T G.711) ──────────────────────
function mulawDecode(ulawByte) {
  ulawByte = ~ulawByte & 0xFF;
  const sign     = ulawByte & 0x80;
  const exponent = (ulawByte >> 4) & 0x07;
  const mantissa = ulawByte & 0x0F;
  const sample   = ((0x21 + mantissa * 2) << exponent) - 0x21;
  return sign ? -sample : sample;
}

function mulawEncode(sample) {
  const MU = 255, MAX = 32767;
  sample = Math.max(-MAX, Math.min(MAX, sample));
  const sign = sample < 0 ? 0x80 : 0;
  if (sample < 0) sample = -sample;
  const compressed = Math.log(1 + MU * sample / MAX) / Math.log(1 + MU);
  return (~(sign | Math.min(Math.floor(compressed * 128), 127))) & 0xFF;
}

// mulaw buffer → PCM 16-bit LE (8kHz)
function mulawToPcm(mulawBuf) {
  const out = Buffer.alloc(mulawBuf.length * 2);
  for (let i = 0; i < mulawBuf.length; i++) out.writeInt16LE(mulawDecode(mulawBuf[i]), i * 2);
  return out;
}

// PCM 16-bit LE (8kHz) → mulaw buffer
function pcmToMulaw(pcmBuf) {
  const samples = pcmBuf.length / 2;
  const out = Buffer.alloc(samples);
  for (let i = 0; i < samples; i++) out[i] = mulawEncode(pcmBuf.readInt16LE(i * 2));
  return out;
}

// Upsample PCM 8kHz → 16kHz (linear interpolation, 2×)
function upsample8to16(buf) {
  const n = buf.length / 2;
  const out = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const s0 = buf.readInt16LE(i * 2);
    const s1 = i + 1 < n ? buf.readInt16LE((i + 1) * 2) : s0;
    out.writeInt16LE(s0, i * 4);
    out.writeInt16LE(Math.round((s0 + s1) / 2), i * 4 + 2);
  }
  return out;
}

// Downsample PCM 24kHz → 8kHz (average every 3 samples — basic box filter)
function downsample24to8(buf) {
  const n24 = buf.length / 2;
  const n8  = Math.floor(n24 / 3);
  const out = Buffer.alloc(n8 * 2);
  for (let i = 0; i < n8; i++) {
    const s0 = buf.readInt16LE(i * 6);
    const s1 = buf.readInt16LE(i * 6 + 2);
    const s2 = buf.readInt16LE(i * 6 + 4);
    out.writeInt16LE(Math.round((s0 + s1 + s2) / 3), i * 2);
  }
  return out;
}

const wssTwilio    = new WebSocket.Server({ noServer: true, perMessageDeflate: { threshold: Infinity } });
const wssSansPBX   = new WebSocket.Server({ noServer: true, perMessageDeflate: { threshold: Infinity } });

// Single upgrade router — only the matching server handles each request.
// This prevents the non-matching server from calling abortHandshake(400)
// on a socket that has already received a 101 from the other server.
server.on('upgrade', (req, socket, head) => {
  const pathname = req.url.split('?')[0];
  if (pathname === '/live') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  } else if (pathname === '/twilio-stream') {
    wssTwilio.handleUpgrade(req, socket, head, (ws) => wssTwilio.emit('connection', ws, req));
  } else if (pathname === '/sanspbx-stream') {
    wssSansPBX.handleUpgrade(req, socket, head, (ws) => wssSansPBX.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

// SansPBX WebSocket connection handler
wssSansPBX.on('connection', (sansPbxWs, req) => {
  handleSansPBXStream(sansPbxWs, req).catch(err =>
    logger.error('[SANSPBX-STREAM] Unhandled error:', err.message)
  );
});

wssTwilio.on('connection', async (twilioWs, req) => {
  const qStr      = req.url.includes('?') ? req.url.split('?')[1] : '';
  const urlParams = new URLSearchParams(qStr);
  let agentId    = urlParams.get('agentId');
  let campaignId = urlParams.get('campaignId');
  let leadName   = urlParams.get('leadName') ? decodeURIComponent(urlParams.get('leadName')) : '';

  // Hoist so the start-message resolver can populate them before Gemini init
  let streamSid     = null;
  let callSid       = null;
  let liveCallDocId = null;

  // ── Cloud Run strips query-string from WebSocket upgrade requests ──────────
  // Workaround: POST /twilio/voice (plain HTTP — params intact) stores
  // { agentId, campaignId } in streamMeta keyed by Twilio CallSid.
  // We wait for Twilio's "start" message (arrives <1 s after WS connect)
  // to get the CallSid, then look up streamMeta.
  if (!agentId) {
    console.log('[TWILIO-STREAM] agentId not in WS URL — waiting for Twilio start message');
    const resolvedId = await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        twilioWs.removeListener('message', onStart);
        resolve(null);
      }, 8000);

      async function onStart(raw) {
        try {
          const m = JSON.parse(raw.toString());
          if (m.event === 'connected') return; // wait for 'start'
          if (m.event === 'start') {
            clearTimeout(timeout);
            twilioWs.removeListener('message', onStart);

            streamSid = m.streamSid;
            callSid   = m.callSid || null;
            console.log('[TWILIO-STREAM] start received — callSid:', callSid, '| streamSid:', streamSid);

            const meta = streamMeta.get(callSid);
            if (meta) {
              agentId    = meta.agentId;
              campaignId = meta.campaignId || campaignId;
              if (meta.leadName) leadName = meta.leadName;
              streamMeta.delete(callSid);
              console.log('[TWILIO-STREAM] Resolved agentId from meta:', agentId, '| leadName:', leadName || '(none)');
            } else {
              console.error('[TWILIO-STREAM] No streamMeta entry for callSid:', callSid, '| store size:', streamMeta.size);
            }

            // DB link (mirrors the main "start" handler — done here since msg is consumed)
            if (callSid) {
              try {
                const Call = require('./modules/call/call.model.js');
                const doc  = await Call.findOne({ twilioCallSid: callSid }).lean();
                if (doc) {
                  liveCallDocId = doc._id.toString();
                  console.log('[TWILIO-STREAM] Linked call doc:', liveCallDocId);
                } else {
                  console.warn('[TWILIO-STREAM] No Call doc for callSid:', callSid);
                }
              } catch (e) { console.error('[TWILIO-STREAM] DB link error:', e.message); }
            }

            resolve(agentId || null);
          }
        } catch (_) { resolve(null); }
      }
      twilioWs.on('message', onStart);
    });

    if (!resolvedId) {
      console.error('[TWILIO-STREAM] Could not resolve agentId — callSid:', callSid, '| closing');
      if (twilioWs.readyState === WebSocket.OPEN) twilioWs.close();
      return;
    }
  }

  logger.info('[TWILIO-STREAM] Session ready — agentId:', agentId, '| campaign:', campaignId);

  const agent = await AgentService.getAgentById(agentId).catch((err) => {
    logger.error('[TWILIO-STREAM] getAgentById error:', err.message);
    return null;
  });
  if (!agent) {
    logger.error('[TWILIO-STREAM] Agent not found — agentId:', agentId);
    if (twilioWs.readyState === WebSocket.OPEN) twilioWs.close();
    return;
  }

  // Pre-load contact call history for Client Intelligence Layer
  // Fetches last 5 completed calls for this phone number → injected into system instruction
  let agentForInstruction = agent.toObject ? agent.toObject() : { ...agent };
  try {
    if (liveCallDocId) {
      const CallModel = require('./modules/call/call.model.js');
      const callDoc   = await CallModel.findById(liveCallDocId).lean();
      const contactPhone = callDoc?.phoneNumber;
      if (contactPhone) {
        const history = await CallModel.find({
          phoneNumber: contactPhone,
          status: 'COMPLETED',
          _id: { $ne: liveCallDocId },
        }).sort({ createdAt: -1 }).limit(5)
          .select('durationSeconds sentiment summary createdAt usageCost').lean();
        if (history.length > 0) {
          agentForInstruction.clientData = {
            phoneNumber:   contactPhone,
            previousCalls: history.map(c => ({
              date:            c.createdAt,
              durationSeconds: c.durationSeconds,
              sentiment:       c.sentiment,
              summary:         c.summary,
              usageCost:       c.usageCost,
            })),
          };
          logger.info('[TWILIO-STREAM] Client intelligence: loaded', history.length, 'previous calls for', contactPhone);
        }
      }
    }
  } catch (e) {
    logger.warn('[TWILIO-STREAM] Client history lookup failed (non-critical):', e.message);
  }

  const masterInstruction = buildMasterSystemInstruction(agentForInstruction);
  const agentLanguage     = agent.language || agent.primaryLanguage || 'en-IN';

  // Context Caching Layer 2 — attempt to use cached system instruction
  // Returns cachedContentName string if cache hit/created, null if unsupported/error (fallback to inline)
  const modelNameForCache = (process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-native-audio').replace(/-latest$/, '');
  const cachedContentName = await ContextCacheService.getOrCreate(agent, masterInstruction, modelNameForCache);
  const rawSilence        = agent.silenceDetectionMs || 30;
  const silenceThreshold  = rawSilence < 1000 ? rawSilence * 1000 : rawSilence;

  let geminiWs        = null;
  // streamSid, callSid, liveCallDocId declared above (hoisted for start-msg resolution)
  let endCallScheduled = false;
  const callStartTime  = Date.now();
  const transcriptParts = [];
  let silenceTimer = null, durationTimer = null, fillerTimer = null;

  // ── Cache state for this call ──────────────────────────────────────────────
  const cacheUserId    = agent?.userId?.toString() || null;
  const cacheAgentId   = agentId || null;
  let   lastCallerText = '';           // latest transcribed caller utterance
  let   pendingAudioChunks = [];       // collect Gemini audio chunks for current turn
  let   cacheSecondsUsed = 0;          // cache seconds served this call (for billing)
  let   geminiSecondsUsed = 0;         // gemini seconds used this call (for billing)
  let   turnStartTime  = 0;            // when current Gemini turn started

  // NOTE: Filler injection is intentionally disabled for the Twilio pipeline.
  // Twilio sends 50 frames/sec continuously (including silence), making event-based
  // filler timers impossible to control — they always fire in a loop.
  // Gemini naturally says fillers ("Hmm...", "Achha...", "Bilkul...") via the system prompt.
  let billingDeducted = false; // guard — prevent double billing on end_call + close
  // Audio gate: block caller audio from reaching Gemini until welcome message is sent.
  // Without this, Twilio audio frames arrive during the 500ms welcome delay and Gemini
  // responds in its default English before the Hindi welcome instruction reaches it.
  let welcomeSent = false;
  // Filler loop gate: Gemini must NOT respond with any filler or speech until a real
  // human has spoken at least once. This prevents the recording tone / silence from
  // triggering Gemini into a filler loop ("Achha... Samajh gaya... Thik hai...").
  let humanHasSpoken = false;

  // ── STT side-channel — transcribes caller audio without touching Gemini audio path ──
  const sttService = new SttService({ languageCode: agentLanguage });
  sttService.on('transcript', ({ text }) => {
    if (!text) return;
    lastCallerText = text;
    transcriptParts.push({ speaker: 'Human', text });
    logger.info('[TWILIO-STREAM] [STT] Human:', text.substring(0, 80));

    // Cache lookup — check if we have a pre-recorded response for this phrase
    if (cacheUserId && cacheAgentId) {
      AudioCacheService.lookup(text, { agentId: cacheAgentId, userId: cacheUserId })
        .then(result => {
          if (result.hit && result.audioBuffer) {
            logger.info(`[AUDIO-CACHE] HIT — serving from cache:`, text.substring(0, 50));
            const durationMs = result.audioLengthMs || Math.round((result.audioBuffer.length / 48000) * 1000);
            cacheSecondsUsed += Math.ceil(durationMs / 1000);
            sendAudioToTwilio(result.audioBuffer.toString('base64'));
          }
        })
        .catch(err => logger.error('[AUDIO-CACHE] lookup error:', err.message));
    }
    pendingAudioChunks = [];
    turnStartTime = Date.now();
  });
  sttService.start();

  function cleanup() {
    if (silenceTimer)  { clearTimeout(silenceTimer);  silenceTimer  = null; }
    if (durationTimer) { clearTimeout(durationTimer); durationTimer = null; }
    sttService.destroy();
  }

  function resetSilenceTimer() {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      if (endCallScheduled) return;
      logger.info('[TWILIO-STREAM] Silence timeout (' + silenceThreshold + 'ms) — disconnecting');
      endCallScheduled = true;
      cleanup();
      io.emit('CALL_STATUS_UPDATE', { event: 'call_ended', agentId, reason: 'silence_timeout' });
      if (geminiWs) try { geminiWs.close(); } catch (_) {}
      if (twilioWs.readyState === WebSocket.OPEN) twilioWs.close();
    }, silenceThreshold);
  }

  // Send Gemini PCM 24kHz audio → convert → mulaw 8kHz → Twilio caller
  function sendAudioToTwilio(base64Pcm24) {
    if (!streamSid || twilioWs.readyState !== WebSocket.OPEN) return;
    try {
      const pcm24  = Buffer.from(base64Pcm24, 'base64');
      const pcm8   = downsample24to8(pcm24);
      const mulaw  = pcmToMulaw(pcm8);
      twilioWs.send(JSON.stringify({
        event: 'media',
        streamSid,
        media: { payload: mulaw.toString('base64') }
      }));
    } catch (err) {
      logger.error('[TWILIO-STREAM] sendAudio error:', err.message);
    }
  }

  // Save call results to DB + deduct billing minutes
  async function saveCallToDb(sentiment, summary, durationSec) {
    if (billingDeducted) return; // guard against double deduction (end_call + ws close)
    billingDeducted = true;
    if (!liveCallDocId) return;
    try {
      const Call = require('./modules/call/call.model.js');
      const transcriptText = transcriptParts.map(p => `${p.speaker}: ${p.text}`).join('\n');
      await Call.findByIdAndUpdate(liveCallDocId, {
        durationSeconds:  durationSec,
        status:           'COMPLETED',
        endedAt:          new Date(),
        transcript:       transcriptText || '',
        transcriptStatus: 'completed',
        sentiment:        sentiment ? (sentiment.charAt(0).toUpperCase() + sentiment.slice(1)) : 'Neutral',
        ...(summary ? { summary } : {}),
      });
      logger.info('[TWILIO-STREAM] Saved call to DB:', liveCallDocId);
    } catch (e) {
      logger.error('[TWILIO-STREAM] DB save error:', e.message);
    }

    // ── Deduct billing minutes for Twilio real call ───────────────────────────
    try {
      const twilioUserId = agent?.userId?.toString();
      if (twilioUserId && durationSec > 0) {
        const billingResult = await BillingService.deductMinutes(twilioUserId, {
          durationSeconds: durationSec,
          source:          'campaign',
          callId:          liveCallDocId,
          agentId,
          campaignId:      campaignId || undefined,
          cacheSeconds:    cacheSecondsUsed,    // actual cache seconds served this call
          geminiSeconds:   geminiSecondsUsed,   // actual Gemini seconds used this call
        });
        logger.info('[TWILIO-STREAM] [BILLING] Deducted', Math.ceil(durationSec / 60), 'min from userId:', twilioUserId);
        // Write usageCost back to Call document for display in UI
        if (billingResult?.weightedDeduction != null) {
          try {
            const Call2 = require('./modules/call/call.model.js');
            await Call2.findByIdAndUpdate(liveCallDocId, {
              usageCost: billingResult.weightedDeduction.toFixed(4) + ' min',
            });
          } catch (_) {}
        }
      } else {
        logger.warn('[TWILIO-STREAM] [BILLING] Skipped — no userId or zero duration. agent.userId:', agent?.userId);
      }
    } catch (billingErr) {
      logger.error('[TWILIO-STREAM] [BILLING] Minute deduction failed:', billingErr.message);
    }
  }

  // ── Connect to Gemini Live ─────────────────────────────────
  try {
    const { GoogleAuth } = require('google-auth-library');
    const auth  = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    const token = await auth.getAccessToken();

    const modelName = (process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-native-audio').replace(/-latest$/, '');
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || 'gen-lang-client-0348687456';
    // NOTE: v1beta1 matches /live path — preview model not available on v1 endpoint
    const geminiUrl = 'wss://us-central1-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent';

    geminiWs = new WebSocket(geminiUrl, { headers: { 'Authorization': 'Bearer ' + token } });

    geminiWs.on('open', () => {
      logger.info('[TWILIO-STREAM] Gemini connected — model:', modelName);
      // Twilio audio is 8kHz mulaw upsampled to 16kHz — not true 16kHz.
      // The speech signal is weaker than native browser audio.
      // Always use HIGH sensitivity so Gemini VAD reliably detects user speech.
      // LOW sensitivity misses most speech in 8kHz upsampled audio.
      geminiWs.send(JSON.stringify({
        setup: {
          model: `projects/${projectId}/locations/us-central1/publishers/google/models/${modelName}`,
          generationConfig: {
            responseModalities: ['AUDIO'],
            // NOTE: inputAudioTranscription / outputAudioTranscription removed —
            // not supported on Vertex AI v1, causes Gemini to reject setup silently.
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: agent.voiceId || 'Aoede' } },
              languageCode: agentLanguage
            }
          },
          realtimeInputConfig: {
            automaticActivityDetection: {
              // LOW = requires stronger audio signal to detect speech start — ignores Hmm/Umm/Haa backchannels
              startOfSpeechSensitivity: 'START_SENSITIVITY_LOW',
              // LOW = waits longer before deciding human has finished speaking — prevents mid-sentence cut-in
              endOfSpeechSensitivity:   'END_SENSITIVITY_LOW',
            }
          },
          // Context Caching Layer 2: use cachedContent ID if available (75% token cost reduction)
          // Falls back to inline systemInstruction if cache unsupported or unavailable
          ...(cachedContentName
            ? { cachedContent: cachedContentName }
            : { systemInstruction: { parts: [{ text: masterInstruction }] } }
          ),
          tools: [{
            functionDeclarations: [
              {
                name: 'end_call',
                description: 'Call this when the conversation has naturally concluded and it is time to hang up.',
                parameters: {
                  type: 'object',
                  properties: {
                    sentiment: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
                    summary:   { type: 'string', description: 'Brief call summary (positive/neutral only)' }
                  },
                  required: ['sentiment']
                }
              },
              ...(agent.voicemailDetection !== false ? [{
                name: 'voicemail_detected',
                description: 'Call immediately when you detect voicemail or automated system.',
                parameters: { type: 'object', properties: {} }
              }] : [])
            ]
          }]
        }
      }));
    });

    // ── Gemini → Twilio caller ─────────────────────────────────
    geminiWs.on('message', async (rawData) => {
      try {
        const msg = JSON.parse(rawData.toString());

        // Setup complete — start timers, send welcome
        if (msg.setupComplete !== undefined) {
          logger.info('[TWILIO-STREAM] Setup complete | silenceThreshold:', silenceThreshold + 'ms');
          resetSilenceTimer();
          io.emit('CALL_STATUS_UPDATE', { event: 'call_started', agentId, isTest: false });

          // Personalise welcome message with lead first name + language-appropriate title
          // Hindi → "<Name> ji"  |  English → "Mr./Ms. <Name>"  |  fallback → "<Name>"
          let welcomeMsg        = agent.welcomeMessage || '';
          const callStartBehavior = agent.callStartBehavior || 'startImmediately';

          if (welcomeMsg && leadName) {
            const lang = (agent.language || agent.primaryLanguage || '').toLowerCase();
            let nameGreeting;
            if (lang.includes('hindi')) {
              nameGreeting = `${leadName} ji`;
            } else if (lang.includes('english')) {
              nameGreeting = `Mr. ${leadName}`;
            } else {
              nameGreeting = leadName;
            }
            // Inject after standard opener (Hello/Hi/Namaste/Hey) or prepend
            const personalised = welcomeMsg.replace(
              /^(Hello|Hi|Namaste|Hey)[,.]?\s*/i,
              (match) => `${match}${nameGreeting}, `
            );
            welcomeMsg = personalised !== welcomeMsg ? personalised : `${nameGreeting}, ${welcomeMsg}`;
          }

          // Always open audio gate immediately — caller's "Hello?" must reach Gemini
          // before AI speaks, regardless of callStartBehavior.
          welcomeSent = true;

          if (welcomeMsg && callStartBehavior !== 'waitForHuman') {
            // Outbound call — instruct Gemini to wait for caller to speak first,
            // THEN respond with the greeting. This is correct cold-calling etiquette:
            // phone is answered → caller says "Hello?" → AI greets them.
            // Do NOT send the greeting immediately — let the caller speak first.
            if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
              geminiWs.send(JSON.stringify({
                clientContent: {
                  turns: [{ role: 'user', parts: [{ text: `SYSTEM: An outbound call just connected. The recipient has answered. Do NOT speak yet — wait silently for the caller to say something first (they will say "Hello?" or "Haan?" or similar). Once they speak, respond immediately with this exact greeting: "${welcomeMsg}". After the greeting, wait for them to respond. Do NOT call end_call now.` }] }],
                  turnComplete: true
                }
              }));
              logger.info('[TWILIO-STREAM] Wait-for-caller instruction sent. Greeting ready: "' + welcomeMsg.substring(0, 60) + '"');
            }
          }
          // waitForHuman mode: gate already open, no instruction needed — Gemini waits naturally

          // Graceful conclusion at exactly 4:00 minutes (Vertex AI hard-cuts at 5:00)
          // Inject conclusion instruction with 60 seconds of runway before infrastructure cut.
          const CONCLUSION_TIMER_MS = 4 * 60 * 1000; // 240,000ms — fixed, not % of maxDuration
          durationTimer = setTimeout(() => {
            if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
              geminiWs.send(JSON.stringify({
                clientContent: {
                  turns: [{ role: 'user', parts: [{ text: 'SYSTEM: The call has been running for 4 minutes. You must now conclude this conversation gracefully within the next 60 seconds. Summarise what was discussed, confirm any next steps, deliver a warm and complete closing, then call end_call. Do not start any new topics. Do not ask new questions. Bring the conversation to a natural and respectful close now.' }] }],
                  turnComplete: true
                }
              }));
              logger.info('[TWILIO-STREAM] 4-minute conclusion instruction sent to Gemini');
            }
          }, CONCLUSION_TIMER_MS);
          return;
        }

        // Tool calls
        if (msg.toolCall && msg.toolCall.functionCalls) {
          for (const fc of msg.toolCall.functionCalls) {

            if (fc.name === 'end_call' && !endCallScheduled) {
              const durationSec = Math.round((Date.now() - callStartTime) / 1000);

              // Hard server-side guard — reject end_call if called before 45 seconds
              if (durationSec < 45) {
                logger.warn('[TWILIO-STREAM] [END_CALL] Rejected — too early at ' + durationSec + 's. Telling Gemini to continue.');
                if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
                  geminiWs.send(JSON.stringify({
                    toolResponse: {
                      functionResponses: [{
                        id: fc.id,
                        name: 'end_call',
                        response: { output: 'The conversation has just started. Do NOT end the call yet. Continue engaging the caller.' }
                      }]
                    }
                  }));
                }
                endCallScheduled = false;
                continue; // skip to next function call
              }

              endCallScheduled = true;
              const sentiment  = (fc.args && fc.args.sentiment) || 'neutral';
              const summary    = (fc.args && fc.args.summary)   || '';
              logger.info('[TWILIO-STREAM] [END_CALL] sentiment:', sentiment, '| duration:', durationSec + 's');

              // Acknowledge end_call without telling Gemini to speak again.
              // Gemini already spoke the closing before calling end_call — if we say
              // "speak summary now" it repeats the last sentence. Just acknowledge.
              if (geminiWs.readyState === WebSocket.OPEN) {
                geminiWs.send(JSON.stringify({
                  toolResponse: {
                    functionResponses: [{ id: fc.id, name: 'end_call', response: { output: 'Acknowledged. Call ending.' } }]
                  }
                }));
              }

              // 10s for positive/neutral (Gemini may still be speaking last audio chunk),
              // 5s for negative calls (shorter close).
              const hangupDelay = (sentiment === 'positive' || sentiment === 'neutral') ? 10000 : 5000;
              setTimeout(async () => {
                cleanup();
                await saveCallToDb(sentiment, summary, durationSec);
                io.emit('CALL_STATUS_UPDATE', { event: 'call_ended', agentId, sentiment, durationSec });
                if (twilioWs.readyState === WebSocket.OPEN) twilioWs.close();
                if (geminiWs && geminiWs.readyState === WebSocket.OPEN) geminiWs.close();
              }, hangupDelay);
            }

            if (fc.name === 'voicemail_detected') {
              logger.info('[TWILIO-STREAM] Voicemail detected — hanging up');
              cleanup();
              if (twilioWs.readyState === WebSocket.OPEN) twilioWs.close();
              if (geminiWs && geminiWs.readyState === WebSocket.OPEN) geminiWs.close();
            }
          }
          return;
        }

        // NOTE: inputTranscription / outputTranscription from Gemini are NOT used here —
        // those fields require setup params not supported on Vertex AI v1.
        // Caller transcript is handled by sttService (Google STT side-channel, wired above).
        // Agent transcript is captured below from modelTurn text parts.

        // Audio response from Gemini → convert and play to caller + collect for cache
        // Also capture any text parts as Agent transcript
        if (msg.serverContent && msg.serverContent.modelTurn && msg.serverContent.modelTurn.parts) {
          for (const part of msg.serverContent.modelTurn.parts) {
            if (part.inlineData && part.inlineData.data) {
              sendAudioToTwilio(part.inlineData.data);
              // Collect audio chunks for cache recording after turn ends
              pendingAudioChunks.push(Buffer.from(part.inlineData.data, 'base64'));
            }
            // Capture Gemini text output as Agent transcript (sent alongside audio in v1beta1)
            if (part.text && part.text.trim()) {
              transcriptParts.push({ speaker: 'Agent', text: part.text.trim() });
            }
          }
        }

        // ── When Gemini turn completes → record caller+response to cache ──
        if (msg.serverContent && msg.serverContent.turnComplete && lastCallerText && pendingAudioChunks.length > 0) {
          const combinedAudio = Buffer.concat(pendingAudioChunks);
          const turnMs = Date.now() - turnStartTime;
          geminiSecondsUsed += Math.ceil(turnMs / 1000);

          if (cacheUserId && cacheAgentId && lastCallerText) {
            // Record hit and potentially save audio to GCS
            AudioCacheService.recordHit(lastCallerText, {
              agentId:  cacheAgentId,
              userId:   cacheUserId,
              language: agentLanguage,
            }).then(({ fingerprint, hitCount, shouldCache }) => {
              if (shouldCache && fingerprint && combinedAudio.length > 0) {
                const audioLengthMs = Math.round((combinedAudio.length / 48000) * 1000);
                AudioCacheService.saveAudioToCache(fingerprint, combinedAudio, {
                  userId: cacheUserId, agentId: cacheAgentId, audioLengthMs,
                }).then(saved => {
                  if (saved) logger.info(`[AUDIO-CACHE] Saved after ${hitCount} hits: "${lastCallerText.substring(0, 50)}"`);
                });
              }
            }).catch(err => logger.error('[AUDIO-CACHE] recordHit error:', err.message));
          }

          pendingAudioChunks = [];
          lastCallerText = '';
        }

      } catch (e) {
        logger.error('[TWILIO-STREAM] Gemini message error:', e.message);
      }
    });

    geminiWs.on('error', (err) => logger.error('[TWILIO-STREAM] Gemini error:', err.message));
    geminiWs.on('close', () => {
      logger.info('[TWILIO-STREAM] Gemini WS closed');
      cleanup();
      if (twilioWs.readyState === WebSocket.OPEN) twilioWs.close();
    });

  } catch (err) {
    logger.error('[TWILIO-STREAM] Init error:', err.message);
    twilioWs.close();
    return;
  }

  // ── Twilio → Gemini: handle incoming Media Stream frames ──
  twilioWs.on('message', async (rawData) => {
    try {
      const msg = JSON.parse(rawData.toString());

      if (msg.event === 'connected') {
        logger.info('[TWILIO-STREAM] Twilio Media Stream connected — protocol:', msg.protocol);
      }

      else if (msg.event === 'start') {
        streamSid = msg.streamSid;
        callSid   = msg.start && msg.start.callSid;
        logger.info('[TWILIO-STREAM] Stream started — callSid:', callSid, '| streamSid:', streamSid);

        // Link to Call DB record by Twilio CallSid
        try {
          const Call = require('./modules/call/call.model.js');
          const doc  = await Call.findOne({ twilioCallSid: callSid }).lean();
          if (doc) {
            liveCallDocId = doc._id.toString();
            logger.info('[TWILIO-STREAM] Linked to call doc:', liveCallDocId);
          } else {
            logger.warn('[TWILIO-STREAM] No Call doc found for callSid:', callSid);
          }
        } catch (e) { logger.error('[TWILIO-STREAM] DB lookup error:', e.message); }
      }

      else if (msg.event === 'media') {
        // Audio gate: drop frames until welcome message has been sent to Gemini.
        // This prevents Gemini from generating an English response to early audio
        // before the Hindi welcome instruction arrives (causes English-then-Hindi issue).
        if (!welcomeSent) return;
        if (!geminiWs || geminiWs.readyState !== WebSocket.OPEN) return;
        const mulawB64 = msg.media && msg.media.payload;
        if (!mulawB64) return;

        // mulaw 8kHz → PCM 16kHz → Gemini
        const mulaw  = Buffer.from(mulawB64, 'base64');
        const pcm8   = mulawToPcm(mulaw);
        const pcm16  = upsample8to16(pcm8);

        // Mark that real human audio has arrived — unlocks Gemini to respond
        if (!humanHasSpoken) {
          humanHasSpoken = true;
          logger.info('[TWILIO-STREAM] First human audio received — Gemini response unlocked');
          // Notify Gemini that real human is now speaking so it can respond naturally
          geminiWs.send(JSON.stringify({
            clientContent: {
              turns: [{ role: 'user', parts: [{ text: 'SYSTEM: The caller has started speaking. You may now respond naturally.' }] }],
              turnComplete: false
            }
          }));
        }

        geminiWs.send(JSON.stringify({
          realtimeInput: {
            mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: pcm16.toString('base64') }]
          }
        }));

        // STT side-channel — feed same PCM16 to Google STT for transcript + cache fingerprint
        sttService.write(pcm16);

        resetSilenceTimer();
      }

      else if (msg.event === 'stop') {
        logger.info('[TWILIO-STREAM] Stream stopped — callSid:', callSid);
        cleanup();
        if (geminiWs && geminiWs.readyState === WebSocket.OPEN) geminiWs.close();
      }

    } catch (err) {
      logger.error('[TWILIO-STREAM] Message error:', err.message);
    }
  });

  twilioWs.on('close', () => {
    logger.info('[TWILIO-STREAM] Twilio WS closed — callSid:', callSid);
    cleanup();
    if (geminiWs && geminiWs.readyState === WebSocket.OPEN) geminiWs.close();
    // Fallback billing: if user hung up without triggering end_call tool, deduct here
    if (!billingDeducted) {
      const durationSec = Math.round((Date.now() - callStartTime) / 1000);
      saveCallToDb('neutral', '', durationSec).catch(e =>
        logger.error('[TWILIO-STREAM] [BILLING] Hangup billing error:', e.message)
      );
    }
  });

  twilioWs.on('error', (err) => logger.error('[TWILIO-STREAM] Twilio WS error:', err.message));
});

// Graceful shutdown
async function gracefulShutdown(signal) {
  logger.info(`[SHUTDOWN] ${signal} received, closing server...`);
  if (server) {
    server.close(async () => {
      await mongoose.disconnect();
      logger.info('[SHUTDOWN] Server + MongoDB closed');
      process.exit(0);
    });
  } else {
    await mongoose.disconnect();
    process.exit(0);
  }
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

module.exports = app;
