# STEP 8: Testing & Verification Checklist

## Pre-Deployment Testing

### Phase 1: Unit Tests ✅
All modules have basic syntax validation:
- ✅ google.live.client.js
- ✅ voice.service.js
- ✅ audio.router.js
- ✅ mediastream.handler.js
- ✅ state-machine.js
- ✅ call.control.service.js
- ✅ psychology.framework.js
- ✅ filler.selector.js

### Phase 2: Integration Tests (Post-Deploy)

#### STEP 1: Gemini Audio Output Test
**Command**: Make a test call via SansPBX or Twilio

**Expected Logs**:
```
🔧 GEMINI LIVE SETUP MESSAGE:
   ├─ Model: models/gemini-2.5-flash-native-audio-preview-12-2025
   ├─ Response Modalities: ["AUDIO"]
   ├─ Voice Name: Aoede
   ├─ Audio Output: ENABLED ✅
```

**Success Criteria**:
- [ ] Setup message logged
- [ ] "📥 ✅ AUDIO CHUNK RECEIVED" appears in logs
- [ ] Audio chunks count > 0
- [ ] Caller hears AI response

**Failure Signs**:
- ❌ "⚠️ MODEL TURN RECEIVED BUT NO AUDIO FOUND"
- ❌ Audio chunks = 0
- ❌ Complete silence on call

---

#### STEP 2: Audio Routing Test
**Command**: Same test call

**Success Criteria**:
- [ ] "📤 Twilio audio #N" or "📤 SansPBX audio #N" logged
- [ ] Audio routing summary at call end:
  ```
  📊 AudioRouter [twilio]: 30 chunks, 125.50 KB, success rate 100%
  ```
- [ ] No "❌ Error sending audio" messages

---

#### STEP 3: State Machine Test
**Command**: Same test call

**Expected Transitions**:
```
IDLE → LISTENING (user speaks)
LISTENING → THINKING (user stops)
THINKING → SPEAKING (response generated)
SPEAKING → LISTENING (ready for next turn)
```

**Success Criteria**:
- [ ] State transitions logged
- [ ] Call completes in LISTENING or IDLE state
- [ ] No stuck states (RECOVERY without recovery)

---

#### STEP 4: Call Control Enforcement Test
**Command**: Call with agent configured:
- maxCallDuration: 30 seconds
- silenceDetectionMs: 5000 (5 seconds)

**Expected**:
1. Call connects
2. Agent speaks
3. User says nothing (5+ seconds)
4. ❌ "SILENCE THRESHOLD EXCEEDED" logged
5. Call automatically ends

**Success Criteria**:
- [ ] Silence detection triggered
- [ ] Call ended automatically
- [ ] Metrics logged to database
- [ ] Enforcements = 1

**Failure Signs**:
- ❌ Call continues after silence
- ❌ No enforcement logging

---

#### STEP 5: Psychology Framework Test
**Command**: Create agent with objective="Close Sale"

**Expected**:
- [ ] RECIPROCITY principle selected
- [ ] Principle instruction injected into prompt
- [ ] Agent uses "give value first" approach

**Verification**:
- Check Cloud Run logs for psychology framework injection
- Verify response starts with value proposition

---

#### STEP 6: Language Filler Test
**Command**: Create agent with language=hinglish

**Expected**:
- [ ] Hinglish fillers used: "Acha", "Haan", "Matlab", etc.
- [ ] No English-only fillers
- [ ] Conversational feel

**Verification**:
- Record call and listen for appropriate fillers
- Check logs for filler selection

---

### Phase 3: End-to-End Tests

#### Test Scenario 1: Sales Call (Complete Flow)
1. Create agent:
   - Name: "Demo Sales Agent"
   - Title: "Sales Representative"
   - Objective: "Close Sale"
   - Language: "en-US"
   - Characteristics: ["Professional", "Helpful"]
   - Max Duration: 300 seconds
   - Silence Detection: 10 seconds

2. Make call via SansPBX or Twilio

3. Verify:
   - [ ] Agent greets caller
   - [ ] Listens to caller input
   - [ ] Responds appropriately
   - [ ] No errors in logs
   - [ ] Call completes successfully
   - [ ] Metrics saved to database

#### Test Scenario 2: Hinglish Sales Call
1. Create agent:
   - Language: "hinglish"
   - Characteristics: ["Warm", "Friendly"]

2. Make call

3. Verify:
   - [ ] Agent uses Hinglish naturally
   - [ ] Warm tone evident
   - [ ] Caller engaged
   - [ ] No audio issues

#### Test Scenario 3: Short Duration Enforcement
1. Create agent with maxCallDuration = 15 seconds

2. Make call and keep speaking

3. Verify:
   - [ ] Call automatically ends at 15 seconds
   - [ ] "DURATION EXCEEDED" logged
   - [ ] User not abruptly cut off (graceful)

---

### Phase 4: Performance Tests

#### Test: Concurrent Calls
**Command**: Start 5 calls simultaneously

**Metrics to Check**:
- [ ] All 5 calls connected within 30 seconds
- [ ] No timeouts
- [ ] Average response time < 2 seconds
- [ ] Cloud Run memory usage < 80%
- [ ] CPU usage < 70%

---

### Phase 5: Error Recovery Tests

#### Test: Network Interruption
**Simulate**: WebSocket disconnection mid-call

**Expected**:
- [ ] Graceful error handling
- [ ] Recovery attempt logged
- [ ] Call marked as FAILED or RECOVERY attempted
- [ ] Error saved to database

#### Test: Gemini API Timeout
**Simulate**: No response from Gemini for 20 seconds

**Expected**:
- [ ] THINKING timeout triggered
- [ ] Fallback response played
- [ ] Call recovered or ended gracefully
- [ ] Error logged with context

---

## Deployment Verification Checklist

### Pre-Deploy (Local Testing)
- [ ] All syntax checks pass (node -c)
- [ ] Git commits are clean
- [ ] No uncommitted changes
- [ ] Backend builds without errors
- [ ] Frontend builds without errors

### Deploy
- [ ] Cloud Build triggered
- [ ] New revision created
- [ ] Health checks passing
- [ ] Traffic routed to new revision

### Post-Deploy (Production Testing)
- [ ] Backend endpoint responding (curl -I https://api-url)
- [ ] Frontend loads (browser test)
- [ ] Test call connects
- [ ] Audio flows both directions
- [ ] Logs visible in Cloud Run logs
- [ ] Database saving call records

---

## Rollback Procedure

If critical issues found:

```bash
# Identify last stable revision
gcloud run revisions list --service=shreenika-ai-backend --region=asia-south1

# Route 100% traffic to stable revision
gcloud run services update-traffic shreenika-ai-backend \
  --region=asia-south1 \
  --to-revisions STABLE_REVISION_ID=100
```

---

## Success Criteria (Final)

### All 8 STEPS Verified ✅
- [ ] STEP 1: Gemini audio output working (chunks > 0)
- [ ] STEP 2: Audio routing to caller working
- [ ] STEP 3: State machine transitions working
- [ ] STEP 4: Call control enforcement working
- [ ] STEP 5: Psychology principles injected
- [ ] STEP 6: Language-strict fillers used
- [ ] STEP 7: Database schemas complete
- [ ] STEP 8: All tests passing

### System Status
- [ ] Zero critical errors in production logs
- [ ] Call success rate > 95%
- [ ] Audio latency < 500ms
- [ ] No memory leaks (sustained 24 hours)
- [ ] Database queries responsive

---

## Monitoring Commands

### Real-time Logs
```bash
gcloud run services logs read shreenika-ai-backend \
  --region=asia-south1 \
  --follow
```

### Errors Only
```bash
gcloud run services logs read shreenika-ai-backend \
  --region=asia-south1 \
  --follow | grep -E "ERROR|❌"
```

### Audio Flow
```bash
gcloud run services logs read shreenika-ai-backend \
  --region=asia-south1 \
  --follow | grep -E "AUDIO|📥|📤"
```

---

Created: 2026-02-22
Ready for Deployment
