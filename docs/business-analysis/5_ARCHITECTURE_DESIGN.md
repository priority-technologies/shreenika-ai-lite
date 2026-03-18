# 5. ARCHITECTURE DESIGN

**Date**: 2026-03-18
**Status**: New Project Structure Design (Zero Production Risk)
**Objective**: Define isolated Traditional pipeline architecture with no changes to existing production code

---

## 🎯 ARCHITECTURAL PRINCIPLES

**Zero Production Risk**:
- ✅ New isolated project (completely separate from current production)
- ✅ No modifications to existing `shreenika-ai-backend` (only addition of new files to `Shreenika-AI-Business-Analysis` folder for documentation and planning)
- ✅ Can deploy separately and switch gradually
- ✅ Fallback: Keep running current Gemini Live if issues arise

**Separation Strategy**:
- **New Project Path**: `shreenika-ai-backend-traditional/` (separate GitHub repository or branch)
- **Production Project Path**: `shreenika-ai-backend/` (unchanged, Gemini Live continues)
- **Frontend**: Shared (no changes — routes to either backend based on plan)

---

## 📁 NEW PROJECT STRUCTURE

```
shreenika-ai-backend-traditional/
├── src/
│   ├── config/
│   │   ├── google.js                    [NEW] Google Cloud STT+LLM+TTS config
│   │   ├── env.js                       [NEW] Environment variable loading
│   │   └── database.js                  [COPY] MongoDB connection (from original)
│   │
│   ├── modules/
│   │   ├── auth/                        [COPY] Authentication (unchanged)
│   │   │   ├── auth.controller.js
│   │   │   ├── auth.service.js
│   │   │   └── auth.routes.js
│   │   │
│   │   ├── voice/
│   │   │   ├── services/
│   │   │   │   ├── traditional-voice.service.js         [NEW] Main voice pipeline
│   │   │   │   ├── speech-to-text.service.js            [NEW] Google Cloud STT
│   │   │   │   ├── text-to-speech.service.js            [NEW] Google Cloud TTS
│   │   │   │   ├── cache-coordinator.service.js         [NEW] Cache orchestration
│   │   │   │   ├── personal-cache.service.js            [NEW] Per-caller learning
│   │   │   │   ├── global-cache.service.js              [NEW] Universal responses
│   │   │   │   └── filler-playback.service.js           [NEW] Filler audio (while Gemini processes)
│   │   │   │
│   │   │   └── models/
│   │   │       └── voice-session.model.js               [NEW] Session tracking
│   │   │
│   │   ├── call/
│   │   │   ├── traditional.controller.js                [NEW] Call API endpoints (simplified)
│   │   │   ├── mediastream.handler.js                   [NEW] WebSocket handler (SansPBX)
│   │   │   └── test-agent.handler.js                    [COPY] Test Agent (reused)
│   │   │
│   │   ├── agent/
│   │   │   ├── agent.controller.js                      [COPY] Agent management (unchanged)
│   │   │   ├── agent.service.js                         [COPY] Agent business logic
│   │   │   └── agent.model.js                           [COPY] Agent schema
│   │   │
│   │   ├── campaign/
│   │   │   ├── campaign.service.js                      [COPY] Campaign scheduling
│   │   │   └── campaign.controller.js                   [COPY] Campaign management
│   │   │
│   │   └── cache/
│   │       ├── personal-cache.model.js                  [NEW] Personal cache DB schema
│   │       └── global-cache.model.js                    [NEW] Global cache DB schema
│   │
│   ├── middleware/
│   │   ├── auth.middleware.js                           [COPY] JWT validation
│   │   └── error.middleware.js                          [NEW] Error handling for voice pipeline
│   │
│   ├── utils/
│   │   ├── audio-converter.js                           [NEW] 8kHz ↔ 16kHz ↔ 24kHz conversion
│   │   ├── logger.js                                    [COPY] Logging utility
│   │   └── env-loader.js                                [NEW] Safe environment loading
│   │
│   └── server.js                                         [NEW] Express server (simplified)
│
├── package.json                                           [NEW] Dependencies (similar to original)
├── Dockerfile                                             [NEW] Docker image (similar to original)
├── .env.example                                           [NEW] Environment variables template
├── .gitignore                                             [COPY] Git ignore rules
└── README.md                                              [NEW] Project documentation

---

## 📊 FILE CATEGORIZATION

### [NEW] Files (Create from scratch — Traditional specific)
1. **traditional-voice.service.js** (500+ lines)
   - Main voice pipeline orchestration
   - Coordinates STT → LLM → TTS flow
   - Handles turn management (VAD, turn complete signal)
   - Integrates with cache system

2. **speech-to-text.service.js** (150 lines)
   - Google Cloud Speech-to-Text API wrapper
   - Audio format handling (PCM 16kHz)
   - Confidence scoring
   - Error handling & retry logic

3. **text-to-speech.service.js** (150 lines)
   - Google Cloud Text-to-Speech API wrapper
   - Audio format output (PCM 24kHz)
   - Voice selection (language, gender, pitch)
   - Character count optimization

4. **cache-coordinator.service.js** (200 lines)
   - Orchestrates Personal → Global → Gemini priority
   - Checks cache before calling Gemini
   - Updates cache after Gemini response
   - Frequency threshold logic (lock at 50 hits)

5. **personal-cache.service.js** (150 lines)
   - Per-caller, per-agent conversation storage
   - Stores user preferences, objection patterns
   - Emotional context tracking
   - Automatic cleanup on call end

6. **global-cache.service.js** (150 lines)
   - Universal response storage (cross-agent)
   - Frequency counting (hits toward 50-hit threshold)
   - Lock mechanism for production-ready responses
   - Memory management & cleanup

7. **filler-playback.service.js** (100 lines)
   - Plays background sound while Gemini processes
   - Pre-recorded phrases: "hmm", "let me check", "achhcha"
   - Language-based voice selection
   - Automatic stop on Gemini response arrival

8. **audio-converter.js** (100 lines)
   - 8kHz (SansPBX) → 16kHz (Gemini STT) upsampling
   - 24kHz (Gemini TTS) → 8kHz (SansPBX) downsampling
   - Linear interpolation for quality
   - RMS normalization to prevent clipping

9. **voice-session.model.js** (100 lines)
   - MongoDB schema for session tracking
   - Fields: sessionId, callerId, agentId, startTime, endTime, durationMs
   - Status: ACTIVE, COMPLETED, FAILED
   - Metrics: cacheHits, geminiBilledMinutes, totalCharactersSynthesized

10. **google.js** (config, 100 lines)
    - Initialize Google Cloud client libraries
    - Load GOOGLE_API_KEY from environment
    - Configure STT, LLM, TTS clients
    - Health check on startup

11. **env.js** (50 lines)
    - Load and validate environment variables
    - Fail fast if critical vars missing
    - Log warnings for optional vars

12. **server.js** (50 lines)
    - Express server setup (simplified)
    - Routes: /api/voice/call, /api/voice/test-agent
    - Middleware stack
    - Error handling

13. **error.middleware.js** (50 lines)
    - Catch all errors from voice pipeline
    - Return structured error responses
    - Log errors to monitoring system
    - Graceful degradation (don't crash on single error)

14. **voice-session.model.js** (DB schema, 50 lines)
    - Track each call session
    - Store metrics for analytics

### [COPY] Files (Reuse from original project)
1. **auth.controller.js** — JWT token validation, login
2. **auth.service.js** — Auth business logic
3. **auth.routes.js** — Auth API endpoints
4. **agent.controller.js** — Agent CRUD operations
5. **agent.service.js** — Agent logic (unchanged)
6. **agent.model.js** — Agent MongoDB schema
7. **campaign.service.js** — Campaign scheduling (unchanged)
8. **campaign.controller.js** — Campaign API (unchanged)
9. **logger.js** — Logging utility
10. **test-agent.handler.js** — Test Agent WebSocket (reuse, minimal changes)
11. **.gitignore** — Git ignore rules
12. **package.json** — Dependencies (add google-cloud packages)

### [MODIFIED] Files (Minor changes from original)
1. **mediastream.handler.js** (Traditional version)
   - Remove Advanced-specific logic (state machine, interrupt handler, etc.)
   - Simplify to Traditional flow only:
     * Receive audio from SansPBX
     * Send to STT
     * Send transcript to Gemini
     * Send Gemini response to TTS
     * Send audio back to SansPBX
   - Remove Advanced features (filler injection during barge-in, dynamic psychology, etc.)

2. **test-agent.handler.js** (Minimal changes)
   - Route to traditional-voice.service instead of voice.service
   - Everything else similar

3. **package.json**
   - Add Google Cloud packages:
     * `@google-cloud/speech` (STT)
     * `@google-cloud/text-to-speech` (TTS)
     * `@google-ai/generativelanguage` (Gemini)
     * `google-auth-library` (authentication)

### [UNCHANGED] Infrastructure
- Database: MongoDB (same)
- Frontend: (no changes, shared)
- Environment: Docker, Cloud Run deployment (same strategy)

---

## 🔄 DATA FLOW DIAGRAM

```
[SansPBX Call] (8kHz PCM audio)
    │
    ├─→ mediastream.handler.js
    │    │
    │    ├─→ AudioConverter (8kHz → 16kHz)
    │    │
    │    └─→ traditional-voice.service.js
    │         │
    │         ├─→ VoiceSessionModel (create session, track metrics)
    │         │
    │         ├─→ [HUMAN SPEAKING]
    │         │    │
    │         │    └─→ speech-to-text.service.js
    │         │         │
    │         │         └─→ Google Cloud Speech-to-Text API
    │         │              │
    │         │              └─→ Transcript (confidence score)
    │         │
    │         ├─→ cache-coordinator.service.js
    │         │    │
    │         │    ├─→ personal-cache.service.js (check caller history)
    │         │    │    └─→ CACHE HIT? Return personalized response
    │         │    │
    │         │    ├─→ global-cache.service.js (check universal responses)
    │         │    │    └─→ Frequency >= 50? Return cached audio (24kHz PCM)
    │         │    │
    │         │    └─→ Frequency < 50? Continue...
    │         │
    │         ├─→ [CALL GEMINI LLM]
    │         │    │
    │         │    └─→ Gemini 1.5 Flash API
    │         │         Input: transcript + agent context + psychology prompt
    │         │         Output: Agent response (text)
    │         │
    │         ├─→ text-to-speech.service.js
    │         │    │
    │         │    └─→ Google Cloud Text-to-Speech API
    │         │         Output: Audio (24kHz PCM)
    │         │
    │         ├─→ cache-coordinator.service.js (store response)
    │         │    │
    │         │    ├─→ personal-cache.service.js (remember for caller)
    │         │    │
    │         │    └─→ global-cache.service.js (increment frequency)
    │         │         Frequency now >= 50? Lock for production use
    │         │
    │         └─→ AudioConverter (24kHz → 8kHz)
    │              │
    │              └─→ SansPBX (send 8kHz PCM to caller)
    │
    └─→ [LOOP: Repeat for next turn]

```

---

## 💾 DATABASE SCHEMA ADDITIONS

### Schema 1: VoiceSession (Tracking)
```javascript
{
  _id: ObjectId,
  callId: String,                    // SansPBX call ID
  agentId: String,                   // Agent being used
  callerId: String,                  // Caller phone number
  startTime: Date,
  endTime: Date,
  durationSeconds: Number,
  status: String,                    // ACTIVE, COMPLETED, FAILED
  metrics: {
    personalCacheHits: Number,       // Times personal cache used
    globalCacheHits: Number,         // Times global cache used
    geminiBilledMinutes: Number,     // Actual Gemini billable minutes
    totalCharactersSynthesized: Number, // TTS billing metric
    averageTTSLatencyMs: Number,
    averageSTTConfidence: Number
  },
  errorMessage: String               // If FAILED, store error
}
```

### Schema 2: PersonalCache (Per-Caller Learning)
```javascript
{
  _id: ObjectId,
  callerId: String,
  agentId: String,
  conversationHistory: [{
    userPhrase: String,
    geminiResponse: String,
    timestamp: Date,
    engagement: String,              // positive, neutral, negative
    emotionalContext: String         // excited, frustrated, curious
  }],
  callerProfile: {
    language: String,
    objectionPatterns: [String],     // Keywords user objected on
    closingKeywords: [String],       // Words that indicate readiness
    preferredTone: String
  },
  createdAt: Date,
  lastUpdated: Date
}
```

### Schema 3: GlobalCache (Universal Responses)
```javascript
{
  _id: ObjectId,
  normalizedPhrase: String,          // Standardized version of user phrase
  geminiAudioResponse: Buffer,       // 24kHz PCM audio (base64 in DB)
  responseText: String,
  voiceMetadata: {
    pitch: Number,
    speed: Number,
    energy: Number,
    tone: String,
    language: String
  },
  frequency: Number,                 // How many times this phrase used (target: 50)
  isProduction: Boolean,             // true when frequency >= 50, locked for use
  agentIds: [String],                // Which agents can use this response
  firstSeenAt: Date,
  lastUsedAt: Date,
  nextCleanupAt: Date                // If not used by this date and frequency < 50: DELETE
}
```

---

## 🚀 DEPLOYMENT ARCHITECTURE

### Local Development
```
Developer Laptop
├── shreenika-ai-backend-traditional/ (this repo)
├── Lite_new/ (shared frontend)
├── Local MongoDB
├── Docker Desktop
└── GOOGLE_API_KEY (environment variable)
```

### Cloud Deployment
```
Google Cloud (shreenika-ai-traditional)
├── Cloud Run Service: shreenika-ai-backend-traditional
│   ├── Image: gcr.io/shreenika-ai/backend-traditional:latest
│   ├── Memory: 1GB (STT + Gemini processing)
│   ├── Concurrency: 50 simultaneous calls
│   ├── Timeout: 60 seconds per request
│   └── Environment: GOOGLE_API_KEY, MONGODB_URI, JWT_SECRET
│
├── Cloud SQL: MongoDB (shared with main project)
│   └── Collections: agents, campaigns, voice_sessions, personal_caches, global_caches
│
└── Google Cloud APIs
    ├── Speech-to-Text API (enabled, quota: 5000 QPS)
    ├── Generative Language API (Gemini) (enabled, quota: 5000 QPS)
    └── Text-to-Speech API (enabled, quota: 5000 QPS)
```

### Routing Strategy
```
Frontend Request
    │
    ├─ /api/voice/call/traditional
    │  └─→ Cloud Run: shreenika-ai-backend-traditional
    │
    └─ /api/voice/call/advanced
       └─→ Cloud Run: shreenika-ai-backend (Gemini Live)
```

---

## 🔐 ENVIRONMENT VARIABLES

### Required for Traditional Pipeline
```env
# Google Cloud
GOOGLE_API_KEY=<user-provided-API-key>

# Database
MONGODB_URI=<mongo-connection-string>

# Authentication
JWT_SECRET=<jwt-signing-secret>

# Server
PORT=5000
NODE_ENV=production

# Optional: Monitoring
SENTRY_DSN=<error-tracking>
LOG_LEVEL=info
```

### No new environment variables needed
- GOOGLE_API_KEY is shared (single API key for all 3 Google services)
- All configuration in code or database

---

## ✅ ZERO PRODUCTION IMPACT CHECKLIST

- ✅ New project completely isolated (separate repo/directory)
- ✅ No changes to existing `shreenika-ai-backend` code
- ✅ Shared database (no data loss, read-only for existing agents)
- ✅ Shared frontend (single UI, routes to either backend)
- ✅ Can deploy in parallel (both running simultaneously for A/B testing)
- ✅ Easy rollback (disable Traditional routes, revert to Advanced)
- ✅ No shared state between backends (can run independently)

---

## 📋 IMPLEMENTATION PHASES

### Phase 1: Google Cloud Integration (1-2 days)
- Set up `google.js` with STT, LLM, TTS clients
- Implement `speech-to-text.service.js`
- Implement `text-to-speech.service.js`
- Test individually: "Hello" → TTS → Speaker

### Phase 2: Core Voice Pipeline (3-4 days)
- Implement `traditional-voice.service.js`
- Create audio converters (8kHz ↔ 16kHz ↔ 24kHz)
- Integrate with mediastream.handler.js
- Test: Audio in → STT → Gemini → TTS → Audio out

### Phase 3: Cache System (2-3 days)
- Implement `cache-coordinator.service.js`
- Implement `personal-cache.service.js`
- Implement `global-cache.service.js`
- Create MongoDB schemas

### Phase 4: Integration & Testing (2-3 days)
- Wire all services together
- Local testing: 10 end-to-end calls
- Cloud Run deployment
- Production monitoring setup

---

## 🎯 SUCCESS CRITERIA

- ✅ Traditional pipeline code complete and tested locally
- ✅ All 3 Google Cloud APIs responding correctly
- ✅ Audio quality maintained through conversion pipeline
- ✅ Cache system working (hit rates tracked)
- ✅ Production deployment successful
- ✅ Zero impact on existing Gemini Live system
- ✅ First 100 calls successful without errors

---

*This architecture ensures Traditional pipeline is completely isolated, deployable independently, and poses zero risk to existing production systems.*
