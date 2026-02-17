# Phase 6: Comprehensive Testing Plan
## Multimodal Live + Prosody System Validation

**Timeline:** Real-world testing before production deployment
**Environment:** Cloud Run (asia-south1) - Live backend
**Testers:** You + Native Hinglish/Hindi speakers (optional)

---

## 🎯 Testing Objectives

| Phase | Success Criteria | Test Method |
|-------|-----------------|-------------|
| **Phase 1** | Calls stay connected >30 seconds | Real call test |
| **Phase 2** | Language-specific prompts apply | Log inspection |
| **Phase 3** | Prosody variations audible | Listening test |
| **Phase 4** | Hinglish authenticity (8.5+/10) | Native speaker rating |
| **Phase 5** | Response latency <400ms with fillers | Latency metrics |

---

## 📋 TEST SUITE 1: 1-Second Disconnect Fix (Phase 1)

### Test 1.1: Basic Call Connection
**Objective:** Verify calls don't disconnect after 1 second

**Setup:**
1. Create agent with:
   - Language: `en-US` (English)
   - Title: "Test Assistant"
   - Prompt: "You are a helpful voice assistant."

2. Connect VOIP Provider (Twilio or SansPBX)

3. Make outbound call to yourself

**Expected Behavior:**
- Call connects
- Agent responds (should hear voice within 3-5 seconds)
- **CRITICAL:** Call stays connected beyond 1 second ✅

**Success Metrics:**
```
❌ FAIL: Call disconnects after 1-2 seconds (original bug)
⚠️  PARTIAL: Call stays 5-30 seconds, then drops
✅ PASS: Call stays connected >30 seconds, natural hangup
```

**Cloud Log Inspection:**
Look for in Cloud Logging (Cloud Run → Logs):
```
✅ "🔌 GEMINI LIVE CONNECTION STARTING"
✅ "✅ WebSocket OPEN (XXXms)"
✅ "✅ SETUP COMPLETE received (XXXms from start)"
✅ "✅ Gemini Live connection established in XXXms"

❌ If you see "❌ WebSocket ERROR" or "timeout" → phase 1 failed
```

---

## 🎤 TEST SUITE 2: Prosody Quality (Phases 3-4)

### Test 2.1: Emotion Level Testing (Calm vs Enthusiastic)

**Setup:**
Create TWO agents with identical settings EXCEPT emotions:
```
Agent A (Calm):
- Emotion Level: 0.2 (Calm slider all the way left)
- Voice Speed: 0.9 (Slow)
- Responsiveness: 0.3 (Thoughtful)

Agent B (Enthusiastic):
- Emotion Level: 0.8 (Enthusiastic slider all the way right)
- Voice Speed: 1.2 (Fast)
- Responsiveness: 0.8 (Quick)
```

**Test Call:**
1. Call Agent A, ask: "Tell me about your product"
   - Expected: Slow, measured, calm tone
   - Listen for: Lower pitch, longer pauses, deliberate speech

2. Call Agent B, ask: "Tell me about your product"
   - Expected: Fast, energetic, enthusiastic tone
   - Listen for: Higher pitch, quick responses, energetic delivery

**Success Metrics:**
```
✅ PASS: Clear difference between calm and enthusiastic (should be obvious)
⚠️  PARTIAL: Slight difference but could be more pronounced
❌ FAIL: Both sound identical (prosody not working)
```

### Test 2.2: Hinglish Prosody (Rising Intonation Test)

**Setup:**
Create agent with:
- Language: `hinglish`
- Characteristics: ["Friendly", "Helpful"]
- Prompt: "You speak natural Hinglish. Respond conversationally."

**Test Call:**
1. Call and ask: "Aap kaise ho?" (How are you? - in Hinglish)
2. Listen for:
   - Rising intonation on statements (pitch goes UP at end, not down)
   - Natural Hindi/English mixing ("Haan, bilkul!")
   - First-syllable stress on words
   - Prosodic fillers ("So...", "Matlab...")

**Success Metrics:**
```
✅ PASS: Native Hinglish speaker says "sounds authentic" (8.5+/10)
⚠️  PARTIAL: Sounds like Hinglish but slightly American accent still
❌ FAIL: Sounds like American English, no Hinglish patterns
```

**Rating Scale (Ask native speaker):**
```
1-3 = Sounds very American/robotic
4-6 = Sounds like English with Indian accent
7-8 = Sounds like authentic Hinglish
9-10 = Indistinguishable from human Hinglish speaker
```

---

## ⏱️ TEST SUITE 3: Latency Optimization (Phase 5)

### Test 3.1: Response Latency Measurement

**Objective:** Verify <400ms response latency with filler masking

**Setup:**
1. Make call to agent
2. Wait for welcome message
3. Ask a multi-word question: "What are your top features?"

**Expected Output (in Cloud Logs):**
```
Look for this section at end of call:

╔═══════════════════════════════════════════════════════════════╗
║           LATENCY DIAGNOSTICS - Call XXX                      ║
╚═══════════════════════════════════════════════════════════════╝

📊 CONNECTION TIMINGS:
  • WebSocket Connection: 45ms ✅
  • Gemini Connection:    1200ms ✅
  • First Audio Chunk:    300ms ✅

📞 CONVERSATION METRICS:
  • Response Latency:     250ms ✅
  • Avg Response (3 turns):    320ms
  • Max Response Latency: 450ms

🔍 ANALYSIS:
  • Bottleneck Stage:     Gemini Connection
  • Round Trips:          3

🎯 GOALS:
  • Target Latency:       <400ms
  • Current Status:       🟢 GOOD
```

**Success Metrics:**
```
✅ PASS: Response latency <400ms (shows 🟢 GOOD)
⚠️  PARTIAL: Response latency 400-600ms (shows 🟡)
❌ FAIL: Response latency >600ms (shows 🔴)
```

### Test 3.2: Filler Injection Verification

**Listen For:**
When response takes >300ms, you should hear:
- Natural filler at start: "Haan, " or "So, " or "Matlab, "
- Pause markers in response (natural breathing points)
- No awkward silence (latency is masked)

**Example:**
```
Normal (no latency): "Your top features are pricing and support."
With latency: "Haan, so your top features are... pricing and support."
                    ↑ Filler (masked 300-400ms latency)
```

**Success Metrics:**
```
✅ PASS: Hear natural fillers that mask latency
⚠️  PARTIAL: Fillers present but sound forced
❌ FAIL: No fillers, long awkward silence (>500ms)
```

---

## 🧪 TEST SUITE 4: Language Profile Integration (Phase 2)

### Test 4.1: Language Fallback Test

**Objective:** Verify language profile fallback works

**Setup:**
1. Create agent with Language: `en-US`
2. Check Cloud Logs during call

**Expected Logs:**
```
✅ No error messages about language
✅ Logs show: "Language matched by name: "English (USA)" → "en-US""
   OR: "Language profile not found, defaulting to en-US"
```

**If you see:**
```
❌ "Language profile not found: English (US)" → FAIL (Phase 1 didn't work)
```

---

## 📊 TEST SUITE 5: End-to-End Integration Test

### Test 5.1: Full Call Scenario (All Phases)

**Scenario:**
- Language: Hinglish
- Emotion: 0.7 (Enthusiastic)
- Voice Speed: 1.1 (Fast)
- Agent Characteristics: ["Friendly", "Professional"]

**Call Script:**
1. Agent plays welcome: "Namaste! Aap kaise ho?"
   - ✅ Should sound warm, enthusiastic, Hinglish

2. You ask: "Aapki sewa ke bare mein bataye" (Tell about your service)
   - ✅ Should respond in Hinglish
   - ✅ Should sound energetic (emotion 0.7)
   - ✅ Should speak quickly (1.1x speed)
   - ✅ Should use fillers if latency >300ms

3. You ask: "Pricing kya hai?" (What's the pricing?)
   - ✅ Should respond with confidence
   - ✅ Should apply prosodic emphasis on price numbers
   - ✅ Latency should be tracked

4. Hang up naturally
   - ✅ Full latency diagnostics should appear in logs

**Success Criteria:**
```
✅ All 5 phases working together
✅ Call duration >30 seconds
✅ Voice sounds natural and authentic
✅ Latency metrics all green
✅ Hinglish authenticity 8.5+/10
```

---

## 🔍 How to Check Cloud Logs

### Method 1: Cloud Console
1. Go to: https://console.cloud.google.com/
2. Project: `gen-lang-client-0348687456`
3. Navigation → Cloud Run → shreenika-ai-backend → Logs
4. Filter by timestamp of your call
5. Search for: `LATENCY DIAGNOSTICS` or `Gemini Live`

### Method 2: Command Line
```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=shreenika-ai-backend" \
  --format=json --limit=50 --sort-by="~timestamp"
```

### What to Look For:
```
✅ [GOOD] 🔌 GEMINI LIVE CONNECTION STARTING
✅ [GOOD] ✅ WebSocket OPEN (45ms)
✅ [GOOD] ✅ SETUP COMPLETE received (1200ms)
✅ [GOOD] 🎤 User speech detected
✅ [GOOD] ✅ Response enhanced: Added fillers/pauses
✅ [GOOD] LATENCY DIAGNOSTICS (at end)

❌ [BAD] ❌ WebSocket ERROR
❌ [BAD] ❌ Gemini connection failed
❌ [BAD] Language profile not found (unless handled by fallback)
❌ [BAD] "timeout" or "TIMEOUT"
```

---

## 📝 Test Execution Checklist

### Pre-Testing
- [ ] Backend deployed to Cloud Run
- [ ] Frontend deployed to Cloud Run
- [ ] Both have 100% traffic
- [ ] VOIP provider connected (Twilio or SansPBX)
- [ ] Test agent created in Agent Management
- [ ] Cloud Logging accessible

### Test Execution
- [ ] Test 1.1: Basic call connection (>30 seconds)
- [ ] Test 2.1: Emotion differences (calm vs enthusiastic)
- [ ] Test 2.2: Hinglish authenticity (8.5+/10 rating)
- [ ] Test 3.1: Response latency <400ms
- [ ] Test 3.2: Filler injection working
- [ ] Test 4.1: Language fallback
- [ ] Test 5.1: Full integration test

### Post-Testing
- [ ] Collect Cloud Logs for each test
- [ ] Record latency metrics
- [ ] Get native speaker feedback (if available)
- [ ] Document any failures with error messages
- [ ] Document any unexpected behaviors

---

## 🎯 Success Criteria Summary

### MUST PASS (Blocking)
```
✅ Phase 1: Calls stay connected >30 seconds (no 1-second disconnect)
✅ Phase 5: Response latency <400ms with filler masking
```

### SHOULD PASS (High Priority)
```
✅ Phase 2: Language profiles don't throw errors
✅ Phase 3: Prosody variations audible (calm vs enthusiastic)
✅ Phase 4: Hinglish sounds authentic (7+/10 minimum)
```

### NICE TO HAVE (Polish)
```
✅ Phase 4: Native speaker rates 8.5+/10
✅ Phase 5: Latency consistently <350ms average
```

---

## 🐛 If Tests Fail

### Failure: Calls still disconnect after 1-2 seconds
```
Check Cloud Logs for:
1. "❌ WebSocket ERROR" → Network issue or API key invalid
2. "timeout" → Gemini API not responding in time
3. "Language profile not found: English (US)" → Phase 1 fallback not working

Fix: Review Phase 1 diagnostic logs, check GOOGLE_API_KEY
```

### Failure: No prosody differences heard (calm = enthusiastic)
```
Check:
1. Voice customization is being read by buildSystemInstruction()
2. Agent emotions field is properly saved
3. Gemini is respecting emotion level instructions in system prompt

Test: Create agent with emotion=0.1 vs emotion=0.9, make calls
```

### Failure: Latency still >600ms
```
Check Cloud Logs for bottleneck:
- If Gemini Connection >3000ms → Google API slow
- If Response Latency >600ms → Model processing slow

Optimization: May need to reduce knowledge base size or increase Gemini timeout
```

### Failure: Hinglish sounds like American English
```
Check:
1. Language is saved as "hinglish" (exact code)
2. Hinglish prosody prompt is being injected into system instruction
3. Gemini model receiving full hinglish-prosody.service.js output

Test: Create simple Hinglish agent with no knowledge base, test single response
```

---

## 📞 Test Call Scenarios

### Scenario A: Simple Q&A (Test Phases 1, 2, 5)
```
Agent: "Hello! How can I help?"
You: "What do you do?"
Agent: "I'm a helpful assistant..."
You: "Goodbye"

Expected: Call stays connected, latency metrics logged
Duration: 1-2 minutes
```

### Scenario B: Hinglish Conversation (Test Phases 1, 2, 3, 4)
```
Agent: "Namaste! Aap kaise ho?"
You: "Main theek hoon. Aap kya karte ho?"
Agent: "Main ek voice assistant hoon..."
You: "Shukriya!"

Expected: Hinglish authenticity, prosody quality, no disconnect
Duration: 1-2 minutes
```

### Scenario C: Long Conversation (Test Phase 5 latency averaging)
```
Agent: "Welcome!"
You: Ask 5-10 questions in sequence
Agent: Responds to each

Expected: Multiple latency measurements, average <400ms
Duration: 3-5 minutes
Check: Latency improves as conversation progresses
```

---

## 📊 Reporting Template

After each test, record:

```markdown
## Test: [NAME]
**Date:** [DATE]
**Duration:** [SECONDS]
**Language:** [hinglish/en-US/etc]
**Emotion:** [0.1-0.9]

### Results:
- Call stayed connected: YES/NO
- Response latency: XXXms
- Prosody quality: [1-10]
- Hinglish authenticity: [1-10] (if applicable)
- Fillers heard: YES/NO/N/A

### Logs:
[Paste relevant Cloud Logs section]

### Issues:
- [Any unexpected behavior]

### Pass/Fail: ✅ PASS / ⚠️ PARTIAL / ❌ FAIL
```

---

## ✅ Ready to Test?

All systems deployed and live. You can start Testing Suite 1 immediately:

1. Create test agent in Agent Management
2. Make call via Call Management
3. Check Cloud Logs for diagnostics
4. Record results

**Questions before testing?** Let me know!
