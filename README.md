# Shreenika AI — Traditional Voice Pipeline Backend

**Version**: 0.1.0
**Status**: Week 1 Development (March 24-28, 2026)
**Launch Date**: April 25, 2026

---

## 📋 Project Overview

Traditional Voice Pipeline (STT → LLM → TTS) for Shreenika AI platform.

**Architecture**: STT (Speech-to-Text) → Gemini LLM → TTS (Text-to-Speech) → SansPBX
**Tech Stack**: Node.js, Express, Google Cloud APIs, MongoDB
**Deployment**: Google Cloud Run

---

## 📁 Project Structure

```
shreenika-ai-backend-traditional/
├── docs/
│   └── business-analysis/          [All Business Analysis documents]
│       ├── 1_REQUIREMENTS_VALIDATION.docx
│       ├── 2_TECHNICAL_FEASIBILITY.md
│       ├── 3_COST_BENEFIT_ANALYSIS.xlsx
│       ├── 4_RISK_ANALYSIS.md
│       ├── 5_ARCHITECTURE_DESIGN.md
│       ├── 6_TESTING_STRATEGY.md
│       ├── 7_TIMELINE_EXECUTION.md
│       └── 8_MASTER_SUMMARY.md
│
├── src/
│   ├── config/
│   │   ├── google.js               [Google Cloud clients init]
│   │   ├── env.js                  [Environment variable loader]
│   │   └── database.js             [MongoDB connection - TBD Week 2]
│   │
│   ├── modules/
│   │   ├── auth/                   [Authentication - TBD]
│   │   ├── voice/
│   │   │   ├── services/           [Voice service implementations]
│   │   │   │   ├── traditional-voice.service.js       [TBD Week 1]
│   │   │   │   ├── speech-to-text.service.js          [TBD Week 1]
│   │   │   │   ├── text-to-speech.service.js          [TBD Week 1]
│   │   │   │   ├── cache-coordinator.service.js       [TBD Week 2]
│   │   │   │   ├── personal-cache.service.js          [TBD Week 2]
│   │   │   │   ├── global-cache.service.js            [TBD Week 2]
│   │   │   │   └── filler-playback.service.js         [TBD Week 2]
│   │   │   └── models/             [Voice session models - TBD Week 2]
│   │   │
│   │   ├── call/                   [Call management - TBD Week 2]
│   │   ├── agent/                  [Agent management - TBD]
│   │   ├── campaign/               [Campaign management - TBD]
│   │   └── cache/                  [Cache data models - TBD Week 2]
│   │
│   ├── middleware/                 [Express middleware - TBD]
│   ├── utils/
│   │   ├── logger.js               [Winston logging ✓]
│   │   └── audio-converter.js      [Audio format conversion - TBD Week 1]
│   │
│   └── server.js                   [Main Express server ✓]
│
├── tests/                          [Test suites - TBD Week 3]
├── .env.example                    [Environment template ✓]
├── .gitignore                      [Git ignore rules ✓]
├── package.json                    [Dependencies ✓]
└── README.md                       [This file]
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js >= 16.0.0
- MongoDB connection
- Google Cloud API Key (all 3 APIs enabled: STT, Gemini, TTS)

### Setup

1. **Clone and install**:
   ```bash
   cd shreenika-ai-backend-traditional
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your credentials:
   # - GOOGLE_API_KEY
   # - MONGODB_URI
   # - JWT_SECRET
   ```

3. **Start development server**:
   ```bash
   npm run dev
   ```

   Server runs on `http://localhost:5000`

4. **Health check**:
   ```bash
   curl http://localhost:5000/health
   ```

---

## 📅 Development Timeline

### Week 1: Google Cloud Integration (Mar 24-28)
- [ ] **Monday**: Setup + Google Cloud authentication
- [ ] **Tuesday**: Speech-to-Text service implementation & testing
- [ ] **Wednesday**: Text-to-Speech service implementation & testing
- [ ] **Thursday**: Audio converter + Gemini integration
- [ ] **Friday**: Core voice service architecture

**Deliverables**:
- ✅ google.js (Google Cloud clients initialized)
- ✅ env.js (environment variable loading)
- ✅ package.json (dependencies)
- ✅ server.js (Express server skeleton)
- ⏳ speech-to-text.service.js (STT wrapper)
- ⏳ text-to-speech.service.js (TTS wrapper)
- ⏳ audio-converter.js (8kHz ↔ 16kHz ↔ 24kHz)
- ⏳ traditional-voice.service.js (main pipeline)

### Week 2: Cache System & mediastream Handler (Mar 31-Apr 4)
- [ ] Cache coordinator, personal cache, global cache
- [ ] mediastream.handler.js (WebSocket for SansPBX)
- [ ] Multi-turn conversation support
- [ ] Session tracking (MongoDB)

### Week 3: Local Testing (Apr 7-11)
- [ ] 10 end-to-end test calls via Test Agent
- [ ] Cache validation
- [ ] Language testing (en-IN, hi-IN)
- [ ] Error handling validation

### Week 4: Bug Fixes & Tuning (Apr 14-18)
- [ ] Performance optimization
- [ ] Cost validation
- [ ] Final local testing

### Week 5: Cloud Run Deployment (Apr 21-25)
- [ ] Docker build & push
- [ ] Cloud Run deployment
- [ ] Production monitoring setup
- [ ] 🚀 **LAUNCH** (April 25, Friday)

---

## 🔑 Key Environment Variables

**Required**:
```bash
GOOGLE_API_KEY=your-api-key
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your-secret
```

**Optional** (with defaults):
```bash
NODE_ENV=development
PORT=5000
LOG_LEVEL=info
ENABLE_CACHE=true
CACHE_HIT_THRESHOLD=50
```

---

## 📊 Architecture Overview

```
SansPBX (8kHz PCM)
    ↓
mediastream.handler.js (WebSocket)
    ↓
[Audio upsampling: 8kHz → 16kHz]
    ↓
traditional-voice.service.js
    ├─→ speech-to-text.service.js (Google Cloud STT)
    ├─→ cache-coordinator.service.js (Check cache first)
    ├─→ Gemini LLM (if cache miss)
    ├─→ text-to-speech.service.js (Google Cloud TTS)
    └─→ [Audio downsampling: 24kHz → 8kHz]
    ↓
SansPBX (8kHz PCM)
```

---

## 🧪 Testing

### Unit Tests (Week 1-2)
```bash
npm test
```

### Local E2E Tests (Week 3)
- Via Test Agent button in frontend
- 10 test calls minimum
- Cache validation
- Language testing

### Production Monitoring (Week 5+)
- Cloud Run metrics dashboard
- Custom metrics (cache hits, costs, latency)
- Alert thresholds

---

## 📚 Documentation

All Business Analysis documents located in `docs/business-analysis/`:

1. **1_REQUIREMENTS_VALIDATION.docx** — Scope and user stories
2. **2_TECHNICAL_FEASIBILITY.md** — API verification and cost analysis
3. **3_COST_BENEFIT_ANALYSIS.xlsx** — Financial projections
4. **4_RISK_ANALYSIS.md** — Risk mitigation strategies
5. **5_ARCHITECTURE_DESIGN.md** — Technical architecture details
6. **6_TESTING_STRATEGY.md** — Testing framework and protocols
7. **7_TIMELINE_EXECUTION.md** — Week-by-week development plan
8. **8_MASTER_SUMMARY.md** — Executive summary and go/no-go decision

---

## 🚀 Deployment

### Local Development
```bash
npm install
npm run dev
```

### Docker Build
```bash
docker build -t gcr.io/shreenika-ai/backend-traditional:latest .
```

### Cloud Run Deployment
```bash
gcloud run deploy shreenika-ai-backend-traditional \
  --image gcr.io/shreenika-ai/backend-traditional:latest \
  --region us-central1 \
  --set-env-vars GOOGLE_API_KEY=$GOOGLE_API_KEY
```

---

## 📋 Checklist for Launch

**Week 1 Completion**:
- [ ] All STT/LLM/TTS clients initialized
- [ ] Unit tests 1.1, 1.2, 1.4 passing
- [ ] Integration test 2.1 passing

**Week 3 Completion**:
- [ ] 10 local test calls successful
- [ ] Cache validation passing
- [ ] Both languages (en-IN, hi-IN) working

**Week 5 Completion**:
- [ ] Deployed to Cloud Run
- [ ] First 100 production calls successful
- [ ] Monitoring dashboards active
- [ ] 🚀 **LAUNCHED**

---

## 📞 Support

**Issues or questions?**
- Check `docs/business-analysis/4_RISK_ANALYSIS.md` for troubleshooting
- Review logs in Cloud Run console
- Reference `docs/business-analysis/6_TESTING_STRATEGY.md` for testing protocols

---

**Started**: 2026-03-19
**Ready for Development**: Week 1 (March 24-28)
**Target Launch**: April 25, 2026

---

*This project follows zero-risk implementation principles. All architecture documented, risks mitigated, and timeline realistic.*
