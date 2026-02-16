# VOICE QUALITY MASTER PLAN - CORE PRODUCT ARCHITECTURE

**Status:** PERMANENT IMPLEMENTATION (Non-removable)
**Priority:** 🔴 CRITICAL - This IS the product, not a feature
**Objective:** Achieve indistinguishable AI ↔ Human voice quality with zero-latency response

---

## PROBLEM STATEMENT

1. **Latency Issue (BIGGEST TELL-TALE SIGN OF AI):**
   - User speaks → [DELAY] → AI responds
   - Humans respond in 200-500ms (natural conversation)
   - Current system has 2000-5000ms+ delay
   - **FIX REQUIRED:** Stream responses immediately, no waiting

2. **Voice Customization Not Applied:**
   - TTS service exists but is dead code
   - Gemini Live doesn't use voice settings
   - No emotion control, no characteristic application
   - No voiceSpeed, responsiveness, backgroundNoise effects
   - **FIX REQUIRED:** Integrate TTS service with Gemini Live properly

3. **Missing Voice Features:**
   - 40-60 ratio not enforced
   - Characteristics not applied to audio
   - Emotions not mapped to pitch/speed
   - Background noise not simulated
   - **FIX REQUIRED:** Complete voice customization stack

---

## SOLUTION ARCHITECTURE

### Phase 1: Latency Optimization (IMMEDIATE)

**Objective:** Stream responses as soon as Gemini starts generating (not wait for full response)

#### 1.1 Modify google.live.client.js
- **Current:** Waits for full audio chunk, THEN emits
- **New:** Emit audio immediately as it arrives (streaming)
- **Implementation:**
  - Change from buffering to real-time streaming
  - Emit partial audio chunks as they arrive from Gemini
  - Keep WebSocket reading open for continuous stream
  - Implement audio buffer queue for smooth playback

**Key Changes:**
```javascript
// OLD: Wait for full audio chunk
if (part.inlineData && part.inlineData.mimeType?.includes('audio')) {
  const audioData = Buffer.from(part.inlineData.data, 'base64');
  this.emit('audio', audioData); // One big chunk
}

// NEW: Stream audio in smaller chunks
if (part.inlineData && part.inlineData.mimeType?.includes('audio')) {
  const audioData = Buffer.from(part.inlineData.data, 'base64');
  // Emit in 100ms chunks for smooth streaming
  this.streamAudioInChunks(audioData, 100);
}
```

#### 1.2 Optimize Gemini Live Setup
- Remove unnecessary processing steps before response
- Enable streaming mode in Gemini API
- Reduce system prompt injection overhead
- Implement audio buffering on frontend

---

### Phase 2: Voice Customization Integration

**Objective:** Apply TTS voice effects to Gemini Live audio output

#### 2.1 Create VoiceCustomizationService
- Wraps TTS service for real-time processing
- Takes Gemini audio → applies voice customization → outputs modified audio
- Lightweight (no full TTS call, just audio effects)

**Components:**
- `voice-customization.service.js`: Audio effect processor
  - Pitch adjustment (emotion mapping)
  - Speed adjustment (voiceSpeed multiplier)
  - Characteristic blending (emotional resonance)
  - Background noise injection (optional)

#### 2.2 Integrate with VoiceService Pipeline
```
Gemini Live (Raw Audio 24kHz)
        ↓
VoiceCustomizationService (Apply voice effects)
        ├─ Pitch adjustment (emotion level)
        ├─ Speed adjustment (voiceSpeed)
        ├─ Characteristic blending
        └─ BackgroundNoise simulation
        ↓
Output Audio (Customized 24kHz)
        ↓
Frontend / Twilio (playback)
```

#### 2.3 Apply 40-60 Ratio
```
40% CHARACTERISTICS (Traits + Emotions):
├─ Personality characteristics (Friendly, Empathetic, etc.)
└─ Emotion level (0.5 = neutral, 0.7 = enthusiastic, 0.3 = calm)

60% SPEECH SETTINGS (Audio effects):
├─ Voice speed (0.75 - 1.25x multiplier)
├─ Responsiveness (reaction speed to user input)
├─ Interruption sensitivity (how quickly to stop speaking)
└─ Background noise (office, quiet, cafe, street, call-center)
```

---

### Phase 3: Complete Voice Settings Application

#### 3.1 Characteristics Application
- Map characteristics to system prompt enhancement
- Apply emotional resonance to audio effects
- Inject personality into responses

#### 3.2 40-60 Ratio Enforcement
- 40% weight to characteristics/emotions
- 60% weight to speech settings/audio effects
- Blended calculation in voice-customization.service.js

#### 3.3 Voice Detection Features
- Silence detection (silence_detection_ms from callSettings)
- Voicemail detection (heuristic-based)
- Interruption handling (respects interruptionSensitivity)

---

## IMPLEMENTATION STEPS

### Step 1: Create Voice Customization Service
**File:** `shreenika-ai-backend/src/modules/voice/voice-customization.service.js`

**Responsibilities:**
- Audio effect application (pitch, speed, effects)
- TTS integration for voice customization
- 40-60 ratio blending
- Real-time audio processing

### Step 2: Update google.live.client.js
**Changes:**
- Implement streaming audio emission (not buffered)
- Reduce latency in audio chunk handling
- Optimize setup message for speed

### Step 3: Integrate with VoiceService
**File:** `shreenika-ai-backend/src/modules/call/voice.service.js`

**Changes:**
- Add voice-customization.service initialization
- Apply voice customization to all audio output
- Ensure 40-60 ratio is applied
- Log voice customization parameters

### Step 4: Test Agent Integration
**File:** `shreenika-ai-backend/src/modules/call/test-agent.handler.js`

**Changes:**
- Pass voiceConfig to VoiceService
- Ensure voice customization is applied
- Test with all voice settings enabled

### Step 5: Frontend Verification
**File:** `Lite_new/components/TestAgentModal.tsx`

**Verification:**
- Confirm voice quality improvement
- Measure latency (should be <500ms)
- Verify no delays in audio playback

---

## MEASURABLE OUTCOMES

### Latency Targets
- **User speaks** → AI starts responding: <200ms
- **Continuous speech:** <100ms chunk latency
- **Natural conversation feel:** Indistinguishable from human

### Voice Quality Targets
- **Characteristics:** Perceivable personality (Friendly = warmer, Professional = neutral)
- **Emotion:** Detectable emotional tone (0.3 = calm, 0.7 = enthusiastic)
- **Voice Speed:** 0.75x = slower/thoughtful, 1.25x = faster/energetic
- **Background Noise:** Subtle office ambiance without being distracting

### User Perception Target
- User cannot tell the difference between AI and human agent
- Zero latency gaps in conversation flow
- Natural voice characteristics matching agent personality

---

## FILES TO MODIFY

### Backend
1. ✅ `google.live.client.js` - Streaming optimization
2. ✅ `voice.service.js` - Integration point
3. ✅ `test-agent.handler.js` - Test agent voice customization
4. ✅ NEW: `voice-customization.service.js` - Audio effects processor
5. ✅ `test-agent.controller.js` - Voice config passing

### Frontend
1. ✅ `TestAgentModal.tsx` - Verification & latency monitoring

---

## CRITICAL REQUIREMENTS

1. **No Feature Removal:** Once implemented, voice customization is permanent
2. **Both Real Calls & Test Agent:** Must work identically
3. **Latency Reduction:** Must achieve <500ms user-to-response time
4. **Zero Compromise:** Voice quality is the USP, not a feature

---

## SUCCESS CRITERIA

✅ Latency: User speaks → AI responds in <500ms
✅ Voice Quality: Perceivable personality & emotion in voice
✅ Characteristics: Agent's traits audible in tone
✅ 40-60 Ratio: Both components balanced and applied
✅ Real Calls: Indistinguishable from human
✅ Test Agent: Same quality as real calls
✅ No Removal: Features stay permanent in codebase

---

## Timeline

- **Phase 1 (Latency):** 1-2 hours
- **Phase 2 (Voice Customization):** 2-3 hours
- **Phase 3 (Complete Settings):** 1-2 hours
- **Testing & Deployment:** 1 hour
- **Total:** 5-8 hours

---

**COMMITTED:** This plan will NOT be compromised or removed.
**OBJECTIVE:** Make Shreenika AI voice indistinguishable from human.
