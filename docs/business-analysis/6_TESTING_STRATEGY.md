# 6. TESTING STRATEGY

**Date**: 2026-03-18
**Status**: Testing Framework & Protocols
**Objective**: Define comprehensive testing plan from local development through production monitoring

---

## 🎯 TESTING LAYERS

**4-Layer Testing Approach**:
1. **Unit Tests** — Individual services (STT, LLM, TTS, cache)
2. **Integration Tests** — Services working together (pipeline flow)
3. **Local End-to-End Tests** — Full call via Test Agent button
4. **Production Monitoring** — Real calls with metrics tracking

---

## 🧪 LAYER 1: UNIT TESTS (Services in Isolation)

### Test 1.1: Speech-to-Text Service
**What to test**: Google Cloud STT API wrapper

**Setup**:
```javascript
// Load pre-recorded audio samples
const testAudioFiles = [
  'tests/audio/en-us-hello.wav',
  'tests/audio/en-in-namaste.wav',
  'tests/audio/hi-in-namaskar.wav'
];
```

**Test Cases**:
| Test | Input | Expected Output | Pass/Fail |
|------|-------|-----------------|-----------|
| 1.1.1 | 16kHz PCM "Hello world" | Transcript: "hello world", confidence > 0.95 | ? |
| 1.1.2 | 16kHz PCM with accent (en-IN) | Transcript: "namaste", confidence > 0.90 | ? |
| 1.1.3 | Hindi audio "नमस्कार" | Transcript with Devanagari, confidence > 0.85 | ? |
| 1.1.4 | Silent audio (no speech) | Empty transcript or low confidence | ? |
| 1.1.5 | Corrupted audio buffer | Error handling, no crash | ? |
| 1.1.6 | Max 10MB audio file | Processes successfully | ? |
| 1.1.7 | Invalid API key | Returns 403 Unauthorized | ? |

**Success Criteria**:
- ✅ 6/7 tests pass (accent variations allow 90%+)
- ✅ No crashes on invalid input
- ✅ Error messages clear and loggable

---

### Test 1.2: Text-to-Speech Service
**What to test**: Google Cloud TTS API wrapper

**Test Cases**:
| Test | Input | Expected Output | Pass/Fail |
|------|-------|-----------------|-----------|
| 1.2.1 | "Hello, how are you?" (en-US) | 24kHz PCM audio, <2.5s latency | ? |
| 1.2.2 | "Namaste aap kaise ho?" (hi-IN) | 24kHz PCM Hindi audio | ? |
| 1.2.3 | 5000 chars (max allowed) | Audio generated, <2.5s latency | ? |
| 1.2.4 | 5001 chars (over limit) | Truncate to 5000 or error clearly | ? |
| 1.2.5 | Empty string | Silent audio or error | ? |
| 1.2.6 | Special characters: @#$% | Processes without error | ? |
| 1.2.7 | Different voice names | Correct voice applied | ? |
| 1.2.8 | Invalid API key | Returns 403 Unauthorized | ? |

**Success Criteria**:
- ✅ All 8 tests pass
- ✅ Audio quality: No distortion or artifacts
- ✅ Latency: <2.5s for typical 200-char response

---

### Test 1.3: Cache Coordinator Service
**What to test**: Cache hit/miss logic

**Setup**:
```javascript
// Populate cache with test data
const testCache = {
  personal: new Map(),
  global: new Map()
};
```

**Test Cases**:
| Test | Scenario | Expected | Pass/Fail |
|------|----------|----------|-----------|
| 1.3.1 | New caller, new phrase → MISS | Calls Gemini | ? |
| 1.3.2 | Same caller, same phrase (turn 2) → HIT | Returns personal cache | ? |
| 1.3.3 | Different caller, phrase frequency=45 → MISS | Calls Gemini (not locked yet) | ? |
| 1.3.4 | Different caller, phrase frequency=50+ → HIT | Returns global cache (locked) | ? |
| 1.3.5 | Cache key collision | Returns correct agent's response | ? |
| 1.3.6 | Cache expiration (30 days old) | Cleans up unused | ? |

**Success Criteria**:
- ✅ All 6 tests pass
- ✅ Cache hit rate accuratefor tracked metrics
- ✅ No cross-agent cache collisions

---

### Test 1.4: Audio Converter
**What to test**: 8kHz ↔ 16kHz ↔ 24kHz conversion quality

**Test Cases**:
| Test | Conversion | Input | Output | Quality Check | Pass/Fail |
|------|-----------|-------|--------|---------------|-----------|
| 1.4.1 | 8kHz → 16kHz | 1 sec audio | 2 sec audio | RMS ≥ 90% | ? |
| 1.4.2 | 16kHz → 8kHz | 1 sec audio | 0.5 sec audio | RMS ≥ 90% | ? |
| 1.4.3 | 24kHz → 8kHz | 1 sec audio | 0.33 sec audio | RMS ≥ 85% | ? |
| 1.4.4 | Round trip 8→16→8 | 1 sec audio | 1 sec audio | RMS ≥ 80% | ? |
| 1.4.5 | No clipping | Input RMS=0.8 | Output RMS=0.8 (not clipped) | No clipping | ? |

**Success Criteria**:
- ✅ All conversions lossless (RMS preserved)
- ✅ No clipping or distortion
- ✅ Round-trip conversion acceptable

---

## 🧩 LAYER 2: INTEGRATION TESTS (Services Together)

### Test 2.1: End-to-End Pipeline (No Real Audio)
**What to test**: All services working together, synchronous flow

**Setup**:
```javascript
const pipeline = new TraditionalVoiceService({
  agentId: 'test-agent-001',
  languageCode: 'en-IN'
});
```

**Flow Test**:
```
1. Start session
2. Simulate audio input: "What is the price?"
3. STT converts → "what is the price"
4. Cache check → MISS (new phrase)
5. Gemini call → "The product costs $99"
6. TTS synthesizes → 24kHz audio
7. Audio converter → 8kHz audio
8. Output to caller
```

**Test Cases**:
| Step | Expected Result | Pass/Fail |
|------|-----------------|-----------|
| 1 | Session created, sessionId assigned | ? |
| 2 | Audio buffer populated | ? |
| 3 | Transcript: "what is the price" (confidence > 0.90) | ? |
| 4 | Cache coordinator calls Gemini | ? |
| 5 | Gemini responds with text | ? |
| 6 | TTS generates 24kHz PCM audio | ? |
| 7 | Audio converter produces 8kHz output | ? |
| 8 | Output buffer contains valid audio | ? |

**Success Criteria**:
- ✅ All 8 steps succeed
- ✅ Total latency < 5 seconds
- ✅ No data loss at transitions

---

### Test 2.2: Multi-Turn Conversation
**What to test**: Conversation state across multiple turns

**Flow**:
```
Turn 1:
  Caller: "I'm interested in Product X"
  → Agent: "Great! What are your requirements?"

Turn 2:
  Caller: "I need it by next week"
  → Agent: "We can deliver by Thursday"

Turn 3:
  Caller: "How much does it cost?"
  → Agent: "It's $99 per unit"
```

**Test Cases**:
| Turn | Test | Expected | Pass/Fail |
|-----|------|----------|-----------|
| 1 | Cache miss, Gemini call | Agent responds within 3s | ? |
| 2 | Session remembers turn 1 context | Agent acknowledges requirements | ? |
| 3 | Cache hit for similar phrase (if frequency ≥ 50) | Returns cached response | ? |

**Success Criteria**:
- ✅ Context preserved across all 3 turns
- ✅ Agent responses relevant to conversation
- ✅ Cache working in later turns

---

## 🎬 LAYER 3: LOCAL END-TO-END TESTS (Via Test Agent Button)

### Test 3.1: Basic Voice Flow (Local)
**What to test**: Real browser microphone → Full pipeline → Speaker output

**Pre-requisites**:
- ✅ Local backend running on `localhost:5000`
- ✅ Frontend running on `localhost:5173`
- ✅ Chrome/Firefox with microphone access
- ✅ Agent created in system: "Test Agent (Traditional)"

**Setup**:
1. Open `http://localhost:5173` in browser
2. Login with test account
3. Go to Agent Management
4. Click "Test Agent" on "Test Agent (Traditional)"
5. Allow microphone permission

**Test Protocol — Test 3.1.1: Basic Turn**
| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 1 | System ready | Green status indicator, WebSocket connected | ? |
| 2 | Speak: "Hello" (2 sec) | Audio transmitted to backend | ? |
| 3 | Wait for response (up to 3s) | Agent says something (audio in speaker) | ? |
| 4 | Hear agent voice | Audio quality good, no distortion | ? |
| 5 | Backend logs | [OK] STT processed, Gemini called, TTS synthesized | ? |

**Success Criteria**:
- ✅ Test passes
- ✅ Audio quality acceptable (no major distortion)
- ✅ Latency < 3 seconds
- ✅ All logs show successful API calls

---

### Test 3.2: Multi-Turn Conversation (Local)
**What to test**: Conversation with multiple turns via Test Agent

**Protocol**:
```
Turn 1:
  You: "I want to buy a laptop"
  Expected: Agent responds with interest/qualification

Turn 2:
  You: "I have a budget of $1000"
  Expected: Agent suggests options within budget

Turn 3:
  You: "How quickly can you deliver?"
  Expected: Agent provides delivery timeline

Turn 4:
  You: "Sounds good, let's go with it"
  Expected: Agent confirms and closes conversation
```

**Test Cases**:
| Turn | Test | Expected | Pass/Fail |
|-----|------|----------|-----------|
| 1 | Agent responds | Greeting and qualification | ? |
| 2 | Context preserved | Agent remembers budget | ? |
| 3 | Natural flow | Delivery info provided | ? |
| 4 | Closing | Agent asks for confirmation | ? |

**Success Criteria**:
- ✅ All 4 turns complete successfully
- ✅ Agent understands context across turns
- ✅ Voice quality remains consistent
- ✅ Total conversation time < 30 seconds per turn

---

### Test 3.3: Cache Validation (Local)
**What to test**: Cache system with repeated phrases

**Protocol**:
```
Call 1:
  You: "What is your cheapest product?"
  → Agent responds, response stored in cache

Call 2 (new session, same agent):
  You: "What is your cheapest product?" (identical)
  → Should use cache (faster, no Gemini call)

Expected: Call 2 response time < 500ms (vs. 2.5s in Call 1)
```

**Validation**:
- ✅ Backend logs show cache hit on Call 2
- ✅ Response time significantly faster
- ✅ TTS not called (audio served from cache)

**Success Criteria**:
- ✅ Cache detected identical phrase
- ✅ Response delivered from cache
- ✅ Time savings > 80%

---

### Test 3.4: Different Languages (Local)
**What to test**: Hindi and English voice pipelines

**Setup**:
- Create Agent 1: language = "en-IN"
- Create Agent 2: language = "hi-IN"

**Protocol**:
```
Agent 1 (English):
  You: "Hello, what are your services?"
  Expected: Agent responds in English

Agent 2 (Hindi):
  You: "नमस्ते, आप क्या करते हैं?" (or "Namaste, aap kya karte hain?")
  Expected: Agent responds in Hindi
```

**Success Criteria**:
- ✅ STT correctly recognizes language
- ✅ Gemini responds in correct language
- ✅ TTS uses correct voice
- ✅ No language mixing

---

### Test 3.5: Error Handling (Local)
**What to test**: Graceful failure modes

**Protocol**:
| Scenario | Expected Behavior | Pass/Fail |
|----------|-------------------|-----------|
| Disable GOOGLE_API_KEY | Error logged, fallback message | ? |
| STT returns low confidence (<0.70) | Log warning, use transcription | ? |
| TTS latency >3s | Trigger filler audio, still deliver | ? |
| Interrupt agent during response | Stop TTS, accept new audio | ? |

**Success Criteria**:
- ✅ No crashes on any error condition
- ✅ Meaningful error messages in logs
- ✅ Graceful degradation where possible

---

## 📊 LAYER 4: PRODUCTION MONITORING

### Monitoring 4.1: Real-Time Metrics
**What to track in production**:

```
Dashboard Metrics:
├── Call Health
│   ├── Total calls (live count)
│   ├── Success rate (%)
│   ├── Average call duration (seconds)
│   └── Errors per minute
│
├── Performance
│   ├── STT latency (ms, P50/P95)
│   ├── Gemini response latency (ms)
│   ├── TTS latency (ms)
│   ├── End-to-end latency (ms)
│   └── Cache hit rate (%)
│
├── Quality
│   ├── STT confidence (avg)
│   ├── Audio distortion (none = healthy)
│   ├── Call completion rate (%)
│   └── User satisfaction (if surveyed)
│
└── Cost
    ├── Gemini API cost ($)
    ├── TTS API cost ($)
    ├── STT API cost ($)
    └── Cost per minute vs. billing model
```

### Monitoring 4.2: Alert Thresholds
**Automatic alerts if**:

| Metric | Threshold | Action |
|--------|-----------|--------|
| Error rate | > 5% | Page on-call engineer |
| Cache hit rate | < 30% | Investigate call patterns |
| STT confidence | avg < 0.80 | Review audio quality |
| TTS latency P95 | > 3.0s | Check Google API quotas |
| Cost/min | > $0.02 | Review call patterns for anomalies |
| Gemini timeout | any occurrence | Investigate context window |

### Monitoring 4.3: Daily Report
**Every morning, review**:
- Yesterday's success rate
- Any error patterns
- Cost vs. budget
- Cache effectiveness
- Top performance issues

---

## 📋 TEST EXECUTION CHECKLIST

### Before Local Testing
- [ ] Backend environment variables set correctly
- [ ] MongoDB connection working
- [ ] Google API key valid and permissions confirmed
- [ ] Frontend VITE_API_BASE_URL points to localhost:5000
- [ ] Backend and frontend running

### Local Testing (10 test calls)
- [ ] Test 3.1: Basic voice flow (5 calls, different agents)
- [ ] Test 3.2: Multi-turn conversation (2 calls)
- [ ] Test 3.3: Cache validation (2 calls, repeated phrases)
- [ ] Test 3.4: Different languages (en-IN, hi-IN)
- [ ] Test 3.5: Error handling (1 call with intentional error)

### Before Production Deployment
- [ ] All local tests pass
- [ ] No console errors in browser
- [ ] No error logs in backend
- [ ] Cost projection validated (< $0.02/min)
- [ ] Cache metrics show expected pattern
- [ ] Audio quality subjectively good

### Production Monitoring (Week 1)
- [ ] Daily dashboard review
- [ ] No alerts fired
- [ ] First 100 calls successful
- [ ] Cost tracking accurate
- [ ] Cache hit rate 40-70%
- [ ] User feedback positive

---

## ✅ SUCCESS CRITERIA FOR LAUNCH

**All of these must be true**:
1. ✅ Unit tests: 90%+ pass rate
2. ✅ Integration tests: 100% pass rate
3. ✅ Local E2E tests: 10/10 calls successful
4. ✅ Audio quality: No distortion or drops
5. ✅ Latency: < 3 seconds per turn
6. ✅ Cost: Actual cost ≤ projection ± 20%
7. ✅ Cache: Working at 40%+ hit rate
8. ✅ Logs: No errors, all success metrics recorded
9. ✅ Monitoring: Dashboards active and trending correctly
10. ✅ Team confidence: "This is ready for production"

---

*A comprehensive testing strategy ensures Traditional pipeline launches with confidence and early detection of issues.*
