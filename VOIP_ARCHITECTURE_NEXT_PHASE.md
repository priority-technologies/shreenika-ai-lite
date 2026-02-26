# VOIP Architecture - Phase 3 Planning

**Current Status:** ✅ State Machine v1.0 DEPLOYED & LIVE
**Next Focus:** VOIP Architecture Design
**Target Date:** 2026-02-24 onwards

---

## What's Complete (Phase 1 & 2)

✅ **State Machine (v1.0)** - Deployed to Cloud Run
✅ **Voice Customization** - 40-60 ratio system live
✅ **Test Agent** - Browser-based testing with state machine
✅ **Metrics Collection** - Call duration, sentiment, principles
✅ **HedgeEngine** - Filler playback (latency masking)
✅ **Cache System** - 90% cost reduction (context caching)

**Revision:** 00001-g87 (asia-south1)
**Status:** PRODUCTION READY

---

## Phase 3: VOIP Architecture

### Key Components to Design

#### 1. **Multi-Provider Call Routing**
Current State:
- ✅ Twilio integrated
- ✅ SansPBX integrated
- ✅ ProviderFactory pattern in place
- ⏳ Need: Intelligent routing logic based on agent config

Required:
- Route selection algorithm
- Fallback chain (primary → secondary → tertiary)
- Cost optimization per provider
- Provider-specific DID management

#### 2. **Campaign Management System**
Current State:
- ✅ Campaign model exists
- ✅ StatusCallback recursive trigger designed
- ⏳ Need: Full implementation & queue management

Required:
- 5-call concurrent queue per campaign
- Lead processing pipeline
- Status tracking (PENDING, DIALING, RINGING, ANSWERED, etc.)
- Outcome determination
- Recording storage & transcription
- Analytics collection

#### 3. **Call Transfer Support**
Current State:
- ⏳ Not yet designed

Required:
- Transfer request state in state machine
- Agent selection for transfer
- Call context preservation
- Cold/warm transfer support
- Transfer routing logic

#### 4. **Advanced VOIP Features**
Current State:
- ✅ AMD (Answering Machine Detection) designed
- ✅ Call recording framework
- ⏳ Need: Implementation

Required:
- Voicemail detection & handling
- Recording with transcription
- DTMF digit collection
- IVR menu support
- Call screening/screening rules

#### 5. **Call Control & Monitoring**
Current State:
- ✅ Basic call control framework

Required:
- Real-time call monitoring dashboard
- Call metrics in real-time
- Agent availability/status tracking
- Call queue visualization
- Historical analytics

---

## Architecture Decision Points

### Decision 1: Provider Routing Strategy

**Options:**
- A) **Cost-optimized** - Route by cheapest provider
- B) **Quality-optimized** - Route by success rate
- C) **Hybrid** - Cost + quality score weighted
- D) **Agent-assigned** - Agent chooses provider

**Impact:** Affects cost structure and call success rate

**Status:** NEEDS DECISION

---

### Decision 2: Queue Management

**Options:**
- A) **Database polling** (1-2 second intervals)
- B) **Event-driven** (StatusCallback recursive)
- C) **Worker queue** (Bull/RabbitMQ)
- D) **State machine transitions** (Built-in)

**Current Design:** Event-driven with StatusCallback

**Impact:** Cost, latency, scalability

**Status:** READY TO IMPLEMENT

---

### Decision 3: Recording & Compliance

**Options:**
- A) **Record all calls** (Cloud Storage)
- B) **Record on-demand** (Per-campaign flag)
- C) **Dual-channel** (Caller + agent separate)
- D) **Selective** (Only compliance-required calls)

**Impact:** Storage costs, compliance, legal requirements

**Status:** NEEDS DECISION

---

## Recommended Implementation Order

### **Week 1: Core VOIP Architecture**

1. **Provider Routing Engine** (6 hours)
   - Implement routing logic
   - Add provider selection algorithm
   - Test failover chain

2. **Campaign Queue System** (8 hours)
   - Implement 5-call concurrent queue
   - Add StatusCallback processing
   - Build lead queuing logic

3. **Testing & Validation** (4 hours)
   - Integration tests
   - Multi-provider failover tests
   - Queue stress testing

### **Week 2: Advanced Features**

1. **Recording & Transcription** (6 hours)
   - Recording integration
   - Transcription service (Google/AWS)
   - Storage management

2. **AMD & Voicemail** (6 hours)
   - Implement AMD detection
   - Voicemail greeting support
   - Outcome tracking

3. **Monitoring Dashboard** (8 hours)
   - Real-time metrics
   - Call visualization
   - Analytics collection

---

## Dependencies & Integrations

### Already Available
✅ State Machine (orchestration)
✅ Twilio SDK
✅ SansPBX SDK
✅ Gemini Live API
✅ MongoDB (call storage)
✅ Google Cloud Speech (transcription)

### Need to Add
⏳ Call recording service
⏳ Voicemail message library
⏳ Analytics database schema
⏳ Real-time monitoring frontend
⏳ Campaign dashboard UI

### External Services
🔗 Twilio (calls & recording)
🔗 SansPBX (calls)
🔗 Google Cloud (transcription)
🔗 MongoDB (storage)
🔗 Cloud Run (deployment)

---

## Success Criteria for Phase 3

### **Multi-Provider Routing**
- ✅ Call routes to correct provider
- ✅ Automatic fallback on failure
- ✅ Cost tracking per provider
- ✅ Success rate per provider

### **Campaign Management**
- ✅ 5 calls run concurrently
- ✅ Queue auto-advances on call end
- ✅ Campaign completes when all leads attempted
- ✅ Outcomes tracked correctly

### **Advanced Features**
- ✅ Voicemail detected & handled
- ✅ Calls recorded with transcriptions
- ✅ AMD detects machine vs human
- ✅ Real-time metrics visible

---

## Architecture Diagram (Proposed)

```
Incoming Call (Twilio/SansPBX)
    ↓
Call Controller
    ↓
Provider Router (decision engine)
    ├─ Primary Provider (Twilio)
    ├─ Secondary Provider (SansPBX)
    └─ Tertiary Provider (Other)
    ↓
State Machine (orchestration)
    ├─ INIT
    ├─ WELCOME
    ├─ LISTENING → HUMAN_SPEAKING
    ├─ PROCESSING_REQUEST (filler plays)
    ├─ RESPONDING (Gemini audio)
    ├─ TRANSFER (new state)
    └─ CALL_ENDING
    ↓
Recording Service (parallel)
    ├─ Save audio
    ├─ Transcribe
    └─ Store in MongoDB
    ↓
Metrics Collection
    ├─ Duration
    ├─ Sentiment
    ├─ Outcome
    ├─ Cost
    └─ Quality Score
    ↓
Campaign Manager
    ├─ Mark lead as attempted
    ├─ Trigger next lead in queue
    └─ Update campaign status
```

---

## Estimated Timeline

| Phase | Task | Effort | Timeline |
|-------|------|--------|----------|
| **3A** | Provider Routing | 6h | Mon-Tue |
| **3A** | Campaign Queue | 8h | Tue-Wed |
| **3A** | Testing | 4h | Wed |
| **3B** | Recording | 6h | Thu |
| **3B** | AMD/Voicemail | 6h | Thu-Fri |
| **3B** | Dashboard | 8h | Next week |

**Total:** ~3 weeks for full VOIP architecture

---

## Known Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Provider API rate limits | Campaign queue slowdown | Add backoff/retry logic |
| Recording service failure | No transcripts | Fallback to manual |
| State machine complexity | Hard to debug | Enhanced logging (ready) |
| Cost overruns | Budget impact | Provider cost tracking |
| Concurrent call limits | Scaling issues | Cloud Run auto-scaling |

---

## Questions to Decide Before Starting

1. **Provider Priority:** Cost vs Quality vs Reliability?
2. **Recording:** All calls or selective?
3. **Voicemail:** Auto-hangup or leave message?
4. **Transfer:** Support needed? (Warm/Cold?)
5. **Compliance:** Which regulations? (TCPA, GDPR, etc.)
6. **Dashboard:** Real-time or historical analytics only?

---

## Ready to Start?

✅ **State Machine foundation:** LIVE in production
✅ **Architecture designed:** Clear roadmap
✅ **Dependencies:** All available
✅ **Team:** Ready to implement

**Next Action:** Finalize design decisions above, then begin Phase 3 implementation.

---

**Status:** ✅ PHASE 2 COMPLETE, READY FOR PHASE 3
**Date:** 2026-02-24
**Deployed Version:** State Machine v1.0 (Revision 00001-g87)
