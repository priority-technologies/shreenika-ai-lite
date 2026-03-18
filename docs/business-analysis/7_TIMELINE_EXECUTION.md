# 7. TIMELINE & EXECUTION PLAN

**Date**: 2026-03-18
**Status**: Development Roadmap
**Objective**: Week-by-week execution plan from start to production launch (4-5 weeks total)

---

## 📅 HIGH-LEVEL TIMELINE

```
Week 1 (Mar 24-28):  Google Cloud Integration + Core Voice Service
Week 2 (Mar 31-Apr 4): Cache System Implementation + Audio Pipeline
Week 3 (Apr 7-11):    Integration + Local Testing
Week 4 (Apr 14-18):   Bug Fixes + Performance Tuning
Week 5 (Apr 21-25):   Cloud Run Deployment + Production Monitoring

LAUNCH: April 25, 2026 (Friday) ✅
```

---

## 🚀 WEEK 1: GOOGLE CLOUD INTEGRATION & CORE SERVICES (Mar 24-28)

### Goals
- ✅ Google Cloud APIs responding correctly
- ✅ Core voice service architecture built
- ✅ Audio pipeline end-to-end (8kHz → 16kHz → 24kHz → 8kHz)
- ✅ Basic unit tests passing

### Daily Breakdown

**Monday (Mar 24) — Setup & Authentication**
- [ ] 9:00am: Initialize new project structure (`shreenika-ai-backend-traditional/`)
- [ ] 9:30am: Create `google.js` config file
  - Load GOOGLE_API_KEY from environment
  - Initialize STT, LLM, TTS clients
  - Health check on startup
- [ ] 11:00am: Test Google API key permissions
  - Verify all 3 APIs enabled in GCP Console
  - Test credentials work: one small STT call
- [ ] 2:00pm: Create `env.js` (environment variable loader)
  - Fail fast if critical vars missing
- [ ] 4:00pm: Create `package.json` with Google Cloud dependencies
  - `@google-cloud/speech`
  - `@google-cloud/text-to-speech`
  - `@google-ai/generativelanguage` (Gemini)
  - Run `npm install`

**Success Check**: Can require google.js without errors, APIs initialized ✅

---

**Tuesday (Mar 25) — Speech-to-Text Service**
- [ ] 9:00am: Create `speech-to-text.service.js` (150 lines)
  - Wrap Google Cloud Speech API
  - Handle 16kHz PCM input
  - Return transcript + confidence
  - Error handling & retry logic
- [ ] 11:00am: Unit tests for STT
  - Test cases 1.1.1 - 1.1.7 (from Testing Strategy)
  - Record test audio samples (en-US, en-IN, hi-IN)
  - Verify accuracy > 90% for clear speech
- [ ] 2:00pm: Debug STT issues
  - If accuracy low: Review Google docs, tweak parameters
  - If API errors: Check permissions
- [ ] 4:00pm: Optimize STT
  - Reduce latency (use streaming if available)
  - Implement confidence threshold logging

**Success Check**: Test 1.1: 6/7 tests pass ✅

---

**Wednesday (Mar 26) — Text-to-Speech Service**
- [ ] 9:00am: Create `text-to-speech.service.js` (150 lines)
  - Wrap Google Cloud Text-to-Speech API
  - Input: Text + language + voice
  - Output: 24kHz PCM audio
  - Handle character count limits (max 5000)
- [ ] 11:00am: Unit tests for TTS
  - Test cases 1.2.1 - 1.2.8
  - Test different languages (en-IN, hi-IN, en-US)
  - Measure latency
- [ ] 2:00pm: Voice quality validation
  - Listen to generated audio
  - No distortion, clarity acceptable
  - Latency < 2.5s for typical responses
- [ ] 4:00pm: Optimize TTS
  - Cache voice clients (don't recreate per call)
  - Pre-warm connections

**Success Check**: Test 1.2: 8/8 tests pass ✅

---

**Thursday (Mar 27) — Audio Converter & Gemini Integration**
- [ ] 9:00am: Create `audio-converter.js` (100 lines)
  - 8kHz ↔ 16kHz upsampling (linear interpolation)
  - 24kHz → 8kHz downsampling (decimation)
  - RMS normalization (prevent clipping)
- [ ] 11:00am: Unit tests for audio converter
  - Test cases 1.4.1 - 1.4.5
  - Verify RMS preserved (>90%)
  - No clipping or distortion
- [ ] 1:00pm: Lunch break
- [ ] 2:00pm: Gemini LLM integration (simple text model first)
  - Use Gemini 1.5 Flash text model
  - Input: transcript + agent prompt
  - Output: text response
  - Basic integration (no psychology yet)
- [ ] 4:00pm: Test Gemini integration
  - "Hello" → Gemini → "Hi, how can I help?" (text response)
  - Measure latency

**Success Check**: Gemini returns text responses consistently ✅

---

**Friday (Mar 28) — Core Voice Service Architecture**
- [ ] 9:00am: Create `traditional-voice.service.js` (200 lines, basic version)
  - Orchestrate STT → Gemini → TTS flow
  - Session management
  - Turn handling (VAD signal: `sendTurnComplete`)
  - Basic error handling
- [ ] 11:00am: Integration test (Test 2.1)
  - Simulate audio input
  - Verify pipeline end-to-end
  - All services work together
- [ ] 2:00pm: Latency optimization
  - Profile each service
  - Identify bottlenecks
  - Parallelize where possible
- [ ] 4:00pm: Weekly review
  - Prepare weekly report
  - Document any blockers for next week

**Success Check**: Integration test 2.1 passes ✅

---

### Week 1 Deliverables
- ✅ `google.js`, `env.js`, `package.json`
- ✅ `speech-to-text.service.js` (tested, unit test 1.1 passing)
- ✅ `text-to-speech.service.js` (tested, unit test 1.2 passing)
- ✅ `audio-converter.js` (tested, unit test 1.4 passing)
- ✅ `traditional-voice.service.js` (basic version, integration test 2.1 passing)
- ✅ Unit tests 1.1, 1.2, 1.4 all passing
- ✅ Integration test 2.1 passing

---

## 🚀 WEEK 2: CACHE SYSTEM & MEDIASTREAM HANDLER (Mar 31-Apr 4)

### Goals
- ✅ Cache coordinator, personal cache, global cache all working
- ✅ mediastream.handler.js (WebSocket handler for SansPBX)
- ✅ Integration test 2.2 (multi-turn conversation)
- ✅ Cache unit tests passing

### Daily Breakdown

**Monday (Mar 31) — Cache Coordinator Service**
- [ ] 9:00am: Create `cache-coordinator.service.js` (200 lines)
  - Orchestrate Personal → Global → Gemini priority
  - Check personal cache first
  - Check global cache if frequency ≥ 50
  - Fall back to Gemini if both miss
  - Increment frequency counter
- [ ] 11:00am: Create `personal-cache.service.js` (150 lines)
  - MongoDB schema
  - Store conversation history per caller
  - Track objection patterns, emotional context
  - Cleanup on call end
- [ ] 2:00pm: Create `global-cache.service.js` (150 lines)
  - Universal response storage
  - Frequency counter (target: 50 hits)
  - Lock mechanism (isProduction flag)
  - Expiration & cleanup (30 days if < 50 hits)
- [ ] 4:00pm: Unit tests for cache (Test 1.3)
  - Test cache hits/misses
  - Test frequency counter
  - Test cache expiration

**Success Check**: Unit tests 1.3 passing ✅

---

**Tuesday (Apr 1) — mediastream.handler.js for Traditional**
- [ ] 9:00am: Create Traditional version of `mediastream.handler.js`
  - Receive WebSocket connections from SansPBX
  - Receive 8kHz PCM audio
  - Convert to 16kHz for STT
  - Pass to TraditionalVoiceService
  - Receive 24kHz audio from TTS
  - Convert to 8kHz for SansPBX
  - Send back to caller
- [ ] 11:00am: Implement WebSocket event handlers
  - `connection`: Create voice session
  - `audio`: Process incoming audio chunk
  - `close`: Clean up session
  - `error`: Log and handle gracefully
- [ ] 2:00pm: Audio buffer management
  - Playback buffer (500ms for jitter absorption)
  - Sender buffer (queue audio from Gemini)
- [ ] 4:00pm: Error handling
  - Graceful shutdown on errors
  - Reconnection logic

**Success Check**: mediastream.handler.js compiles and runs ✅

---

**Wednesday (Apr 2) — Multi-Turn Conversation Integration**
- [ ] 9:00am: Update `traditional-voice.service.js`
  - Add conversation state tracking
  - Preserve context across turns
  - Integrate cache coordinator
  - Track metrics (cache hits, Gemini calls)
- [ ] 11:00am: Integration test 2.2 (multi-turn)
  - Turn 1: "I want to buy X" → Gemini responds
  - Turn 2: "What's the price?" → Gemini remembers context
  - Turn 3: "Can you deliver by Friday?" → Continues conversation
  - Verify cache working in later turns
- [ ] 2:00pm: Debug conversation state issues
  - Ensure Gemini context window includes full conversation
  - Verify turn numbering correct
- [ ] 4:00pm: Optimize context window
  - Limit to last 5 turns (not entire call)
  - Balance memory vs. latency

**Success Check**: Integration test 2.2 passes ✅

---

**Thursday (Apr 3) — Voice Session Model & MongoDB Integration**
- [ ] 9:00am: Create `voice-session.model.js` (MongoDB schema)
  - Track each call: sessionId, callerId, agentId, duration
  - Store metrics: cacheHits, geminiBilledMinutes, TTS characters
  - Status: ACTIVE, COMPLETED, FAILED
- [ ] 11:00am: Implement session creation/completion
  - Create on call start, save metrics on call end
  - Update with each cache hit
  - Final summary on completion
- [ ] 1:00pm: Lunch
- [ ] 2:00pm: Database queries
  - Get session metrics for dashboard
  - Aggregate across multiple calls
  - Cache hit rate calculation
- [ ] 4:00pm: Verify database integration
  - Test create, read, update operations
  - Check MongoDB collections created

**Success Check**: Sessions created and metrics saved ✅

---

**Friday (Apr 4) — Filler Audio Service & Week 2 Review**
- [ ] 9:00am: Create `filler-playback.service.js` (100 lines)
  - Pre-recorded filler phrases: "hmm", "let me check", "achhcha"
  - Language-based selection (en-IN, hi-IN, etc.)
  - Triggered when Gemini processing > 2 seconds
  - Automatic stop on Gemini response
- [ ] 11:00am: Filler audio files
  - Pre-record or source filler phrases for each language
  - Test playback in traditional-voice.service.js
- [ ] 2:00pm: Week 2 review
  - Unit tests 1.3 passing
  - Integration tests 2.1, 2.2 passing
  - Prepare weekly report

**Success Check**: Filler audio working ✅

---

### Week 2 Deliverables
- ✅ `cache-coordinator.service.js`, `personal-cache.service.js`, `global-cache.service.js`
- ✅ Traditional `mediastream.handler.js` (WebSocket handler)
- ✅ `voice-session.model.js` (MongoDB integration)
- ✅ `filler-playback.service.js`
- ✅ Unit tests 1.3 passing
- ✅ Integration tests 2.1, 2.2 passing

---

## 🚀 WEEK 3: LOCAL TESTING & INTEGRATION (Apr 7-11)

### Goals
- ✅ Full end-to-end testing via Test Agent button
- ✅ All 10 local test calls successful
- ✅ Cache validation working
- ✅ Different languages tested (en-IN, hi-IN)
- ✅ Error handling validated

### Daily Breakdown

**Monday (Apr 7) — Local Setup & Basic Voice Flow Test**
- [ ] 9:00am: Start backend: `npm run dev`
- [ ] 9:15am: Start frontend: `npm run dev`
- [ ] 9:30am: Verify environment
  - GOOGLE_API_KEY set and working
  - MongoDB connected
  - Backend on localhost:5000
  - Frontend on localhost:5173
- [ ] 10:00am: Test 3.1.1 — Basic voice flow
  - 5 test calls via Test Agent button
  - Log output from backend
  - Verify: STT → Gemini → TTS → Audio output
  - Success target: 5/5 calls successful

**Success Check**: Test 3.1 passes, 5/5 calls successful ✅

---

**Tuesday (Apr 8) — Multi-Turn & Context Testing**
- [ ] 9:00am: Test 3.2 — Multi-turn conversation
  - 2 test calls with 4 turns each
  - Verify context preserved
  - Agent remembers information from turn 1 in turn 3
- [ ] 11:00am: Debug context issues
  - Check Gemini context window (should include all turns)
  - Verify conversation state tracking
- [ ] 2:00pm: Latency measurement
  - Measure turn 1 latency (first Gemini call)
  - Measure turn 2+ latency (if cache hit, should be faster)
  - Target: < 3 seconds per turn

**Success Check**: Test 3.2 passes, context working ✅

---

**Wednesday (Apr 9) — Cache Validation & Performance**
- [ ] 9:00am: Test 3.3 — Cache hit verification
  - Call 1: "What's the cheapest product?" (new phrase, ~2.5s response)
  - Call 2: Repeat phrase (should use cache, <500ms)
  - Check backend logs: "[CACHE] HIT" on Call 2
  - Measure time savings
- [ ] 11:00am: Repeat phrase multiple times
  - Build frequency counter toward 50
  - Verify responses consistent
  - Check global cache building
- [ ] 2:00pm: Cache accuracy validation
  - Different agents using same phrase
  - Verify no cache collision
  - Each gets appropriate response for their context
- [ ] 4:00pm: Cache metrics
  - Check personal cache size
  - Check global cache size
  - Verify cleanup working (old entries removed)

**Success Check**: Test 3.3 passes, cache hit rate > 40% ✅

---

**Thursday (Apr 10) — Language Testing**
- [ ] 9:00am: Create test agents
  - Agent 1: language = "en-IN" (English)
  - Agent 2: language = "hi-IN" (Hindi)
- [ ] 10:00am: Test 3.4 — English pipeline
  - Speak: "Hello, what are your services?"
  - Expected: Agent responds in English
  - STT confidence > 0.90
  - TTS uses English voice
- [ ] 11:30am: Test 3.4 — Hindi pipeline
  - Speak: "नमस्ते, आप क्या करते हैं?" (or phonetic: "Namaste, aap kya karte hain?")
  - Expected: Agent responds in Hindi
  - STT confidence > 0.85 (Hindi slightly harder)
  - TTS uses Hindi voice
- [ ] 2:00pm: Language mixing test
  - Agent 1: Respond only in English (no code-mixing)
  - Agent 2: Respond only in Hindi (no code-mixing)
  - Verify voices are truly different

**Success Check**: Test 3.4 passes, both languages working ✅

---

**Friday (Apr 11) — Error Handling & Week 3 Review**
- [ ] 9:00am: Test 3.5 — Error scenarios
  - Scenario 1: Temporarily disable GOOGLE_API_KEY
    - Expected: Clear error message in logs
    - Agent returns fallback response
  - Scenario 2: Interrupt agent during speaking
    - Expected: Audio stops, system accepts new input
  - Scenario 3: Simulate network delay
    - Expected: Filler audio plays, response still delivered
- [ ] 11:00am: Stress test
  - 3 concurrent test calls
  - Verify no crosstalk
  - Check for race conditions
- [ ] 2:00pm: Performance review
  - Average latency
  - Cache hit rate
  - Error rates
- [ ] 4:00pm: Week 3 summary
  - Prepare report: All tests passing
  - Identify any remaining issues

**Success Check**: All error scenarios handled gracefully ✅

---

### Week 3 Deliverables
- ✅ Test 3.1: 5/5 basic calls successful
- ✅ Test 3.2: Multi-turn conversation working
- ✅ Test 3.3: Cache validation passing
- ✅ Test 3.4: Both languages (en-IN, hi-IN) working
- ✅ Test 3.5: Error handling validated
- ✅ Stress test: 3 concurrent calls
- ✅ All local tests complete

---

## 🚀 WEEK 4: BUG FIXES & TUNING (Apr 14-18)

### Goals
- ✅ Address any bugs found during Week 3
- ✅ Performance optimization
- ✅ Cost validation (actual cost matches projection)
- ✅ Final local testing passes

### Daily Breakdown

**Monday-Friday (Apr 14-18)**:
- [ ] 9:00am daily: Review bugs from previous day's testing
- [ ] 10:00am: Fix highest-priority bugs
- [ ] 12:00pm: Test fixes locally
- [ ] 2:00pm: Performance profiling
  - Latency breakdown (STT, Gemini, TTS)
  - Memory usage
  - Database query efficiency
- [ ] 4:00pm: Document fixes in changelog
- [ ] 5:00pm: Prepare for next day

**Focus Areas**:
1. **Audio Quality** — No distortion, good clarity after conversions
2. **Latency** — Keep < 3 seconds per turn
3. **Error Recovery** — Graceful handling of API failures
4. **Cost Accuracy** — Verify actual cost matches $0.0133/min projection

**Success Check**: All known bugs fixed, no regressions ✅

---

### Week 4 Deliverables
- ✅ Bug fixes and patches
- ✅ Performance optimization complete
- ✅ Cost validation (actual vs. projected)
- ✅ Ready for production deployment

---

## 🚀 WEEK 5: CLOUD RUN DEPLOYMENT & MONITORING (Apr 21-25)

### Goals
- ✅ Deploy to Google Cloud Run
- ✅ Production monitoring configured
- ✅ First 100 production calls successful
- ✅ Launch day (April 25)

### Daily Breakdown

**Monday (Apr 21) — Pre-Deployment Checklist**
- [ ] 9:00am: Final code review
  - All tests passing locally
  - No console errors
  - Documentation complete
- [ ] 10:00am: Production environment setup
  - GCP project confirmed
  - Cloud SQL MongoDB connection string
  - GOOGLE_API_KEY set as secret
  - JWT_SECRET configured
- [ ] 12:00pm: Docker image build
  - `docker build -t gcr.io/shreenika-ai/backend-traditional:latest .`
- [ ] 2:00pm: Push image to Google Container Registry
  - `docker push gcr.io/shreenika-ai/backend-traditional:latest`
- [ ] 4:00pm: Prepare deployment script
  - gcloud command ready
  - Environment variables configured

**Success Check**: Docker image pushed successfully ✅

---

**Tuesday (Apr 22) — Cloud Run Deployment**
- [ ] 9:00am: Deploy to Cloud Run
  ```bash
  gcloud run deploy shreenika-ai-backend-traditional \
    --image gcr.io/shreenika-ai/backend-traditional:latest \
    --region us-central1 \
    --platform managed \
    --allow-unauthenticated \
    --set-env-vars GOOGLE_API_KEY=$GOOGLE_API_KEY,MONGODB_URI=$MONGODB_URI
  ```
- [ ] 10:00am: Verify deployment
  - Check Cloud Run console
  - Confirm service URL
  - Check logs for startup errors
- [ ] 12:00pm: Test from production URL
  - Make test call via browser to production
  - Verify audio works end-to-end
- [ ] 2:00pm: Set up monitoring
  - Cloud Run metrics (CPU, memory, requests)
  - Custom metrics (cache hits, Gemini calls, TTS characters)
  - Error tracking (Sentry or Cloud Logging)
- [ ] 4:00pm: Configure alerts
  - Error rate > 5% → Alert
  - Latency P95 > 3s → Alert
  - Cost/min > $0.02 → Alert

**Success Check**: Production service online and responding ✅

---

**Wednesday (Apr 23) — Production Testing & Monitoring**
- [ ] 9:00am: First production calls
  - Make 10 test calls from production
  - Monitor Cloud Run logs in real-time
  - Verify metrics collection working
- [ ] 11:00am: Dashboard setup
  - Create monitoring dashboard
  - Charts: Success rate, latency, cache hit rate, cost
  - Refresh rate: 1 minute
- [ ] 2:00pm: Performance baseline
  - Record p50, p95, p99 latencies
  - Cache hit rate actual vs. projected
  - Cost per minute vs. projection
  - Any alerts fired?
- [ ] 4:00pm: Documentation update
  - Production deployment guide
  - Monitoring dashboard walkthrough
  - Runbook for common issues

**Success Check**: 10 production calls successful ✅

---

**Thursday (Apr 24) — Final Validation & Launch Prep**
- [ ] 9:00am: Week of monitoring review
  - Overall health check
  - Any issues to fix before launch?
  - All systems stable?
- [ ] 11:00am: Stakeholder communication
  - Prepare launch announcement
  - Brief sales team on new pipeline
  - Confirm customer groups for testing
- [ ] 2:00pm: Launch readiness review
  - All risks addressed
  - Monitoring in place
  - Team trained
  - Rollback plan ready
- [ ] 4:00pm: Final checks
  - Database backups tested
  - Failover procedures verified
  - Contact info for on-call support

**Success Check**: All systems green for launch ✅

---

**Friday (Apr 25) — LAUNCH DAY! 🎉**
- [ ] 9:00am: Marketing announcement
  - Launch Traditional pipeline to early customers
  - Start migration process
- [ ] 10:00am: Real customer calls start
  - Monitor cloud logs continuously
  - Watch dashboard for anomalies
  - Response team on standby
- [ ] 12:00pm: First 50 calls review
  - Success rate check
  - Audio quality feedback
  - Cost tracking
  - Any critical issues?
- [ ] 4:00pm: End-of-day review
  - Successful launch!
  - Document learnings
  - Plan for next improvements

**Success Check**: LAUNCHED! 🚀✅

---

### Week 5 Deliverables
- ✅ Deployed to Google Cloud Run
- ✅ Production monitoring configured
- ✅ First 100 production calls successful
- ✅ Launch day successful

---

## 📊 RESOURCE ALLOCATION

**Team Required**:
- 1 Backend Engineer (full-time, 5 weeks)
- 1 DevOps/Infrastructure (part-time, Week 1 + Week 5)
- 1 QA/Testing (full-time, Week 3 + part-time others)
- 1 PM/Manager (oversight + stakeholder management)

**Critical Path Items** (cannot be delayed):
- Week 1: Google Cloud integration (unblocks everything)
- Week 2: Cache system (core business logic)
- Week 3: Local testing (must find all bugs before deployment)
- Week 5: Cloud Run deployment (must launch by date)

---

## 🚨 RISK MITIGATION TIMELINE

| Risk | Mitigation | When |
|------|-----------|------|
| API permissions missing | Verify in GCP | Week 1, Day 1 |
| STT accuracy low | Test with samples | Week 1, Day 2 |
| Cache collision | Unit tests | Week 2, Day 1 |
| Audio quality issues | Local testing | Week 3 |
| Cost overrun | Daily monitoring | Week 4 + ongoing |

---

*This timeline provides confidence that Traditional pipeline will launch successfully on April 25, 2026.*
