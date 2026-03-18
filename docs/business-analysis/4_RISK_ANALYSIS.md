# 4. RISK ANALYSIS

**Date**: 2026-03-18
**Status**: Risk Assessment & Mitigation Planning
**Objective**: Identify all failure points in Traditional pipeline, develop mitigation strategies, and define contingency plans

---

## 🎯 RISK ASSESSMENT METHODOLOGY

**Approach**: 5-step risk identification for Traditional pipeline
1. Identify all technical failure points (API, audio, processing)
2. Assess probability and impact (CRITICAL / HIGH / MEDIUM / LOW)
3. Define mitigation strategy (prevent, reduce, detect, recover)
4. Plan contingency actions (escalation path)
5. Define success metrics (how to measure risk is under control)

---

## 🔴 CRITICAL RISKS (Must Resolve Before Launch)

### RISK #1: Google Cloud API Key Permissions Missing
**Category**: Technical / API Access
**Probability**: MEDIUM (permission not verified yet)
**Impact**: CRITICAL (entire system non-functional)
**Detection**: During local testing — API calls return 403 Forbidden

**Root Cause**:
- GOOGLE_API_KEY exists but may not have permissions for all 3 APIs
- Google Cloud project may have Speech-to-Text, LLM, and TTS APIs disabled

**Mitigation Strategy**:
1. **Prevention**: Verify in GCP Console before local testing
   - Go to APIs & Services → Enabled APIs
   - Confirm these are enabled:
     * Google Cloud Speech-to-Text API
     * Google Generative Language API (for Gemini)
     * Google Cloud Text-to-Speech API
   - Verify service account has Editor role (or specific API permissions)

2. **Detection**: Log API responses during initialization
   ```javascript
   // In google-config.js
   console.log(`[API CHECK] STT enabled: ${speechToTextApi.isAvailable}`);
   console.log(`[API CHECK] LLM enabled: ${geminiApi.isAvailable}`);
   console.log(`[API CHECK] TTS enabled: ${textToSpeechApi.isAvailable}`);
   ```

3. **Recovery**:
   - If STT fails: Escalate to enable Google Cloud Speech-to-Text
   - If LLM fails: Escalate to enable Generative Language API
   - If TTS fails: Escalate to enable Text-to-Speech API
   - Do NOT proceed without all 3

**Success Metric**:
- ✅ All 3 API permission checks pass during service initialization
- ✅ Log shows: "[API CHECK] STT enabled: true, LLM enabled: true, TTS enabled: true"

---

### RISK #2: STT Accuracy Below 90% (Especially Indian English/Hindi)
**Category**: Speech Recognition Quality
**Probability**: MEDIUM (Google claims 95%+ for clear audio, but accents vary)
**Impact**: HIGH (system unusable if accuracy < 85%)
**Detection**: During local testing and production calls — misrecognized intents

**Root Cause**:
- Google Cloud STT trained primarily on American English accent
- Indian English, Hindi, and mixed language may have lower accuracy
- Background noise, network audio quality affects accuracy

**Mitigation Strategy**:
1. **Prevention**: Test STT locally with diverse samples before launch
   - Record 50 test phrases in target languages: en-IN, hi-IN
   - Run through Google Cloud STT API
   - Measure accuracy against expected transcriptions
   - Target: ≥90% accuracy for key customer-interaction phrases

2. **Detection**: Track transcription confidence scores in production
   ```javascript
   // In voice.service.js sendAudio()
   const confidence = sttResponse.results[0].alternatives[0].confidence;
   if (confidence < 0.80) {
     console.warn(`[STT] Low confidence (${confidence.toFixed(2)}) for audio chunk`);
   }
   ```

3. **Recovery**:
   - If confidence < 0.80: Log as potential error, ask user to repeat
   - If repeated misrecognitions in same call: Fallback to text input (future phase)
   - If language-wide issue: Consider Sarvam AI STT (Indian-optimized) — migration path

**Success Metric**:
- ✅ Local test: 50 phrase set has ≥90% recognition accuracy
- ✅ Production monitoring: <5% of calls have confidence < 0.80
- ✅ User feedback: No complaints about "not understanding me" in first 100 calls

---

### RISK #3: Google Cloud TTS Latency Exceeds 2 Seconds
**Category**: Voice Response Latency
**Probability**: LOW (Google docs claim 1-2s, but depends on response length)
**Impact**: HIGH (calls feel slow/unnatural if latency > 3s per turn)
**Detection**: During local and production testing — measure API response time

**Root Cause**:
- TTS API processes up to 5,000 characters per request
- Response length directly impacts latency (longer text = slower synthesis)
- Network latency adds 200-500ms

**Mitigation Strategy**:
1. **Prevention**: Design responses to stay <300 characters (typical agent response)
   - Longer responses split into multiple shorter TTS calls
   - Batch sending not supported, so each response = one TTS API call

2. **Detection**: Log TTS latency for every response
   ```javascript
   // In voice.service.js gemini response handler
   const ttsStartTime = Date.now();
   const audioBuffer = await textToSpeech.synthesize(responseText);
   const ttsLatency = Date.now() - ttsStartTime;
   console.log(`[TTS] Latency: ${ttsLatency}ms for ${responseText.length} chars`);
   if (ttsLatency > 3000) {
     console.warn(`[TTS] SLOW response (${ttsLatency}ms)`);
   }
   ```

3. **Recovery**:
   - If TTS latency > 3s: Automatically add filler audio (Gemini waiting sound)
   - If consistent latency > 3s: Investigate response length, split if needed
   - If API timeout: Retry once, then return fallback message

**Success Metric**:
- ✅ Local testing: All TTS responses < 2.5s latency
- ✅ Production monitoring: P95 latency < 2.5s
- ✅ User experience: No complaints about "slow voice"

---

### RISK #4: Audio Buffer Underrun (Caller Hears Silence)
**Category**: Audio Playback Quality
**Probability**: MEDIUM (depends on network stability)
**Impact**: CRITICAL (calls seem broken if audio cuts out)
**Detection**: During call — silence interrupts agent voice

**Root Cause**:
- Audio streaming from Gemini to SansPBX requires consistent delivery
- Network jitter can cause audio chunks to arrive out-of-order or delayed
- No buffer means immediate playback — if chunk delayed, caller hears gap

**Mitigation Strategy**:
1. **Prevention**: Implement 500ms playback buffer
   - Queue incoming audio chunks before playback
   - Only start playback when buffer has 500ms of audio (7-8 chunks at 24kHz)
   - Prevents single late chunk from causing dropout

2. **Detection**: Monitor buffer state in mediastream.handler.js
   ```javascript
   // Track buffer health
   let audioPlaybackBuffer = [];
   let isPlayback = false;

   function addToBuffer(chunk) {
     audioPlaybackBuffer.push(chunk);
     if (!isPlayback && audioPlaybackBuffer.length >= 8) {
       startPlayback(); // 500ms threshold reached
     }
   }
   ```

3. **Recovery**:
   - If buffer empties during playback: Pause and wait for refill (max 2s)
   - If refill timeout: Reconnect Gemini session, restart turn

**Success Metric**:
- ✅ Local testing: 10 consecutive turns with zero silence gaps
- ✅ Production monitoring: Zero "audio dropout" reports in first 100 calls
- ✅ Network test: Simulated 50ms jitter — audio still continuous

---

### RISK #5: Gemini Response Timeout (>5 seconds of silence)
**Category**: LLM Processing / API Response
**Probability**: LOW (Gemini is fast, but context-heavy requests slow)
**Impact**: CRITICAL (call appears frozen)
**Detection**: During call — filler audio plays for >5 seconds without response

**Root Cause**:
- Gemini processes user input, context, psychology prompt
- Large context windows (system instruction + conversation history) slow processing
- API rate limiting could delay response

**Mitigation Strategy**:
1. **Prevention**: Optimize prompt and context size
   - System instruction: Keep <2000 tokens
   - Conversation history: Keep last 5 turns only (not entire call)
   - Psychology principles: Brief instruction (1-2 sentences, not verbose)

2. **Detection**: Measure Gemini response time with timeout
   ```javascript
   // In voice.service.js
   const geminiTimeout = 5000; // 5 seconds
   const responsePromise = geminiSession.send(userMessage);
   const timeoutPromise = new Promise((_, reject) =>
     setTimeout(() => reject(new Error('Gemini timeout')), geminiTimeout)
   );

   try {
     const response = await Promise.race([responsePromise, timeoutPromise]);
   } catch (err) {
     if (err.message === 'Gemini timeout') {
       console.error('[GEMINI] Response timeout after 5s');
       // Fallback response
     }
   }
   ```

3. **Recovery**:
   - If timeout: Send fallback message ("I'm thinking, give me a moment")
   - Retry Gemini call once
   - If retry fails: Escalate to human agent (future implementation)

**Success Metric**:
- ✅ Local testing: 50 test calls average response time < 2.5s
- ✅ Production monitoring: No "Gemini timeout" errors in logs
- ✅ User experience: No calls feel stuck/frozen

---

## 🟠 HIGH RISKS (Monitor Closely, Have Mitigation Ready)

### RISK #6: Cache Hit Rate Below 40% (Higher Cost Than Projected)
**Category**: Cost / Business Model
**Probability**: HIGH (90% assumption was too optimistic; real-world = 40-60%)
**Impact**: HIGH (margins reduced from 87% to 60%)
**Detection**: During first 100 production calls — track cache metrics

**Root Cause**:
- Real callers ask more varied questions than expected
- Each region/industry has unique question patterns
- Initial assumption of 90% repetition was unrealistic

**Mitigation Strategy**:
1. **Prevention**: Set realistic expectations at 60% cache hit
   - Pricing already modeled at 60% (see Cost Analysis)
   - If actual > 60%: Bonus profit margin
   - If actual < 60%: Reassess pricing or reduce scope

2. **Detection**: Track cache metrics in production
   ```javascript
   // In cache-coordinator.service.js
   const metrics = {
     totalCalls: 0,
     personalHits: 0,      // Caller-specific cache
     globalHits: 0,        // Universal responses
     geminiFallbacks: 0,   // Needed Gemini API
   };

   const hitRate = (personalHits + globalHits) / totalCalls;
   console.log(`[CACHE] Hit rate: ${(hitRate * 100).toFixed(1)}%`);
   ```

3. **Recovery**:
   - If hit rate < 40%: Increase cache threshold or adjust pricing
   - If hit rate > 70%: Benefit from cost savings, improve margins

**Success Metric**:
- ✅ After 100 calls: Hit rate 40-70% (acceptable range)
- ✅ After 1000 calls: Hit rate stabilizes at 50-65%
- ✅ Margin impact: Still profitable at 60% hit rate (per cost analysis)

---

### RISK #7: Billing Surprises (Unexpected API Costs)
**Category**: Financial / Operations
**Probability**: MEDIUM (cost assumptions are accurate but could have hidden charges)
**Impact**: HIGH (margins eroded if costs 2x projection)
**Detection**: Monthly Google Cloud bill review

**Root Cause**:
- Cost projections based on "typical call"
- Real calls may be longer (callers talk more)
- Premium features (faster response, higher quality TTS) cost more

**Mitigation Strategy**:
1. **Prevention**: Set hard usage limits in Google Cloud
   - Per-agent budget cap: 10,000 minutes/month max
   - Alert if usage exceeds 80% of monthly budget
   - Automatic rate limiting if 100% of budget exceeded

2. **Detection**: Review Google Cloud billing weekly
   - Dashboard: APIs & Services → Billing → Cost Management
   - Alert if cost/minute > $0.02 (vs. projected $0.0133)
   - Identify which API (STT/LLM/TTS) is over-budget

3. **Recovery**:
   - If TTS costs high: Reduce response length (shorter agent responses)
   - If STT costs high: Investigate long background noise (speech VAD issue)
   - If LLM costs high: Reduce context window or conversation history

**Success Metric**:
- ✅ First month: Actual cost within ±10% of projection
- ✅ Billing dashboard: No unexpected charges
- ✅ Cost/minute: Consistent at $0.013 ± 0.002

---

### RISK #8: SansPBX Integration Issues (Audio Conversion Problems)
**Category**: Technical / Integration
**Probability**: MEDIUM (SansPBX SDK is stable, but audio formats can be tricky)
**Impact**: HIGH (calls disconnect or have audio artifacts)
**Detection**: During local testing with WebSocket mock, then production calls

**Root Cause**:
- SansPBX expects 8kHz PCM audio
- Gemini outputs 24kHz PCM
- Conversion between formats can introduce artifacts

**Mitigation Strategy**:
1. **Prevention**: Test audio conversion with sample files
   - Create test audio: Gemini 24kHz → downsample → check quality
   - Verify no clipping, distortion, or phase shifts
   - Load test: 5 simultaneous calls with audio streaming

2. **Detection**: Log audio metrics during conversion
   ```javascript
   // In mediastream.handler.js downsample24kTo8k()
   const beforeRMS = calculateRMS(audioData24k);
   const afterRMS = calculateRMS(downsampled8k);
   if (afterRMS < beforeRMS * 0.8) {
     console.warn(`[AUDIO] Significant volume loss after downsampling`);
   }
   ```

3. **Recovery**:
   - If audio quality bad: Increase conversion buffer size
   - If conversion latency high: Pre-convert in chunks (not entire buffer at once)
   - If integration fails: Fallback to text-only responses (future)

**Success Metric**:
- ✅ Local testing: Audio quality remains high after conversion
- ✅ Production calls: Zero "audio distortion" complaints in first 50 calls
- ✅ RMS check: Post-conversion RMS ≥ 80% of pre-conversion

---

## 🟡 MEDIUM RISKS (Plan Mitigations, Low Urgency)

### RISK #9: Google Cloud API Rate Limiting
**Category**: API Reliability / Scale
**Probability**: LOW (quotas are generous)
**Impact**: MEDIUM (some calls fail during traffic spike)
**Detection**: 429 Too Many Requests error from Google API

**Root Cause**:
- Google Cloud has default quotas (e.g., 1000 QPS per API)
- Traditional pipeline with 50 concurrent calls could approach limits
- No rate limiting strategy in place

**Mitigation Strategy**:
1. **Prevention**: Request quota increase before launch
   - GCP Console → Quotas → Select API → Edit Quota
   - Request 5,000 QPS for each API (5x current expected peak)
   - Lead time: Usually approved in 1-2 days

2. **Detection**: Monitor quota usage in production
   ```javascript
   // Log quota warnings
   if (apiResponse.statusCode === 429) {
     console.error('[QUOTA] Rate limit exceeded for API');
   }
   ```

3. **Recovery**:
   - Implement exponential backoff (retry with 1s, 2s, 4s delays)
   - Queue excess requests (max 100 queued, then reject)
   - Graceful degradation: Reject new calls if API rate-limited

**Success Metric**:
- ✅ Quota increase approved before production deployment
- ✅ Load test: 50 concurrent calls succeed without 429 errors
- ✅ Production monitoring: Zero rate-limit events in first month

---

### RISK #10: Psychology Prompts Ignored (Agent Doesn't Follow Psychology)
**Category**: Business Logic / Prompt Engineering
**Probability**: MEDIUM (LLM may ignore instructions if vague)
**Impact**: MEDIUM (agents don't apply psychology, but still functional)
**Detection**: Manual call review — agent doesn't use psychology principles

**Root Cause**:
- User-written psychology prompts may be unclear
- Gemini may prioritize politeness over aggressive psychology
- Conflict between psychology instruction and system instruction

**Mitigation Strategy**:
1. **Prevention**: Provide prompt templates for each psychology principle
   - RECIPROCITY template: "Offer value first by..."
   - AUTHORITY template: "Establish credibility by mentioning..."
   - User fills in blanks — ensures clarity
   - Validate prompt length (min 50 chars, max 500 chars)

2. **Detection**: Analyze agent responses for psychology markers
   - Look for keywords (e.g., "reciprocity prompt" should have offer)
   - Compare to control agent without psychology
   - A/B test: psychology vs. non-psychology calls

3. **Recovery**:
   - If psychology ignored: Refine prompt wording
   - If conflict with system instruction: Rewrite to avoid contradiction
   - If Gemini refuses: Acknowledge limit and document for Advanced phase

**Success Metric**:
- ✅ 10 test calls with psychology prompt: Agent applies principle in 8/10 (80%+)
- ✅ A/B test: Psychology calls have higher engagement rate
- ✅ User feedback: "Agent successfully used psychology technique"

---

### RISK #11: Cache Collision (Different Agents Use Same Cache)
**Category**: Data Integrity / Multi-Tenancy
**Probability**: MEDIUM (cache key generation could be flawed)
**Impact**: MEDIUM (customers get wrong/irrelevant responses)
**Detection**: During load testing — cache mismatch between agents

**Root Cause**:
- Global cache stores universal responses (should be agent-independent)
- But if cache key doesn't include language/tone, responses may cross over
- Personal cache isolation relies on correct caller ID handling

**Mitigation Strategy**:
1. **Prevention**: Cache key design with collision check
   ```javascript
   // Personal cache key: <callerId>_<agentId>_<normalizedPhrase>
   // Global cache key: <language>_<normalizedPhrase>_<tone>
   // Avoid generic keys
   ```
   - Validate each cache entry before returning
   - Check that response matches caller language/agent config

2. **Detection**: During cache retrieval, verify metadata
   ```javascript
   // Cache-coordinator.service.js get()
   const cached = globalCache.get(key);
   if (cached.language !== callContext.language) {
     console.warn(`[CACHE] Language mismatch — skipping hit`);
     return null; // Force Gemini call instead
   }
   ```

3. **Recovery**:
   - If collision detected: Flush affected cache entries
   - Implement cache versioning (version 1, version 2) to rollback
   - Audit all cache entries after incident

**Success Metric**:
- ✅ Cache key validation: 100% accuracy (no collision in 1000 test calls)
- ✅ Load test with 3+ agents: No language/tone crossover
- ✅ Cache audit: All entries match their metadata correctly

---

### RISK #12: Network Interruption During Call
**Category**: Reliability / Infrastructure
**Probability**: MEDIUM (network is fragile, especially in India)
**Impact**: MEDIUM (call drops, but recoverable)
**Detection**: WebSocket disconnect event

**Root Cause**:
- Caller network drops (WiFi/4G unstable)
- Backend network interruption (rare but possible)
- Gemini session timeout (>15 minutes without activity)

**Mitigation Strategy**:
1. **Prevention**: Implement automatic reconnection
   - WebSocket: Detect disconnect, attempt 3 reconnections with backoff
   - Gemini session: Keep-alive ping every 10 minutes
   - State persistence: Save conversation state to DB (recovery point)

2. **Detection**: Log all disconnections and reconnection attempts
   ```javascript
   // mediastream.handler.js
   ws.on('close', () => {
     console.log(`[DISCONNECT] Call ${callId} closed`);
     // Attempt reconnection or graceful shutdown
   });
   ```

3. **Recovery**:
   - If caller network drops: Retry 3x (exponential backoff)
   - If backend drops: Reestablish Gemini session, resume from last state
   - If unrecoverable: Log error, close call gracefully

**Success Metric**:
- ✅ Local network interruption test: Automatic reconnection succeeds in 90%+ of cases
- ✅ Production monitoring: Reconnection success rate > 85%
- ✅ Call recovery: No lost conversation context on reconnection

---

## 🟢 LOW RISKS (Monitor, Low Priority)

### RISK #13: Agent Configuration Invalid
**Category**: User Input / Validation
**Probability**: LOW (form validation on frontend prevents most errors)
**Impact**: LOW (agent doesn't work, but easy to fix)
**Detection**: Agent doesn't respond to test calls

**Mitigation Strategy**:
1. **Prevention**: Frontend validation of all agent fields
   - Voice name: Must be valid Gemini voice
   - Language: Must be en-US, en-IN, or hi-IN
   - Prompt: Min 20 chars, max 5000 chars
   - Psychology: Optional but max 500 chars

2. **Detection**: Backend validation on agent create/update
   - Return 400 with specific error message
   - Log invalid configurations for debugging

3. **Recovery**:
   - User sees form error, corrects and resubmits
   - No data loss — form preserves input

**Success Metric**:
- ✅ 10 invalid agent config attempts: All rejected with clear error
- ✅ Valid configs: All accepted and functional

---

### RISK #14: Gemini Live Session Expiration (>15 min call)
**Category**: API Limitation
**Probability**: LOW (typical call 2-5 min)
**Impact**: LOW (enterprise calls > 15 min rare)
**Detection**: "Session expired" error from Gemini API

**Root Cause**:
- Gemini Live sessions have 15-minute hard limit
- Long consultative calls exceed this

**Mitigation Strategy**:
1. **Prevention**: Proactively close at 14 minutes
   - At 14-min mark: Agent says "Let me transfer you to my colleague"
   - Create new Gemini session, transfer conversation context

2. **Detection**: Track session age in voice.service.js
   ```javascript
   const sessionAge = Date.now() - geminiSession.createdAt;
   if (sessionAge > 14 * 60 * 1000) {
     // Start new session
   }
   ```

3. **Recovery**:
   - If session expires mid-call: Reconnect, resume from last checkpoint
   - If context lost: Return apology, start fresh

**Success Metric**:
- ✅ Calls < 15 minutes: 100% success
- ✅ Calls ≥ 15 minutes: Session transfer succeeds, conversation continues

---

## 📋 RISK SUMMARY TABLE

| # | Risk | Probability | Impact | Severity | Status | Mitigation |
|---|------|-------------|--------|----------|--------|-----------|
| 1 | API Key Permissions | MEDIUM | CRITICAL | 🔴 CRITICAL | Must verify | Pre-launch API check in GCP Console |
| 2 | STT Accuracy < 90% | MEDIUM | HIGH | 🟠 HIGH | Monitor & test | Local accuracy testing + confidence logging |
| 3 | TTS Latency > 2s | LOW | HIGH | 🟠 HIGH | Prevent & monitor | Filler audio during processing |
| 4 | Audio Underrun (silence) | MEDIUM | CRITICAL | 🔴 CRITICAL | Monitor & detect | 500ms playback buffer |
| 5 | Gemini Timeout | LOW | CRITICAL | 🔴 CRITICAL | Detect & recover | 5s timeout, fallback message |
| 6 | Cache Hit < 40% | HIGH | HIGH | 🟠 HIGH | Monitor | Already modeled at 60% |
| 7 | Billing Surprises | MEDIUM | HIGH | 🟠 HIGH | Monitor | Budget caps + weekly review |
| 8 | SansPBX Audio Issues | MEDIUM | HIGH | 🟠 HIGH | Test & monitor | Audio quality validation |
| 9 | API Rate Limit | LOW | MEDIUM | 🟡 MEDIUM | Prevent | Quota increase request |
| 10 | Psychology Ignored | MEDIUM | MEDIUM | 🟡 MEDIUM | Monitor | Prompt templates + validation |
| 11 | Cache Collision | MEDIUM | MEDIUM | 🟡 MEDIUM | Detect | Cache key validation |
| 12 | Network Interrupt | MEDIUM | MEDIUM | 🟡 MEDIUM | Recover | Auto-reconnect with backoff |
| 13 | Invalid Config | LOW | LOW | 🟢 LOW | Prevent | Form validation |
| 14 | Session Expiration | LOW | LOW | 🟢 LOW | Manage | Auto-transfer at 14 min |

---

## ✅ GO/NO-GO CRITERIA FOR LAUNCH

**All CRITICAL risks must have mitigation deployed**:
- ✅ API Key permissions verified (must pass)
- ✅ Audio buffer implemented (must prevent dropouts)
- ✅ Gemini timeout handling (must have fallback)

**All HIGH risks must have monitoring in place**:
- ✅ STT accuracy logged (must track confidence)
- ✅ TTS latency measured (must have metrics)
- ✅ Billing reviewed (must have alerts)

**All MEDIUM risks must have detection**:
- ✅ Cache metrics collected
- ✅ Network disconnects logged
- ✅ Configuration errors tracked

**Success Criteria**:
- ✅ 10 local test calls succeed end-to-end
- ✅ All logs show zero CRITICAL risk events
- ✅ Audio quality verified (no distortion, no silence gaps)
- ✅ Cost/minute matches projection ($0.013 ± 20%)

---

## 📌 NEXT STEPS

1. **Before Local Testing**: Verify API permissions in GCP Console
2. **During Local Testing**: Implement all CRITICAL risk mitigations
3. **After Local Testing**: Run 10 end-to-end test calls, check risk metrics
4. **Before Cloud Run Deployment**: Ensure all detections are logged and monitored
5. **Production Monitoring**: Daily review of risk metrics for first 2 weeks

---

*This risk analysis ensures Traditional pipeline launches safely with confidence in quality and reliability.*
