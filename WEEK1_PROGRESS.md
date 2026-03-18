# Week 1 Progress Tracking
## Google Cloud Integration & Core Voice Service

**Week**: March 24-28, 2026
**Goal**: Initialize Google Cloud APIs and build core voice pipeline foundation
**Status**: Ready to start 🟡

---

## Daily Breakdown

### Monday, March 24 — Setup & Authentication

**Tasks**:
- [ ] Initialize new project structure (✓ COMPLETED)
- [ ] Create `google.js` config file (✓ COMPLETED)
- [ ] Create `env.js` environment loader (✓ COMPLETED)
- [ ] Test Google API key permissions in GCP Console
  - [ ] Verify Speech-to-Text API enabled
  - [ ] Verify Generative Language API enabled
  - [ ] Verify Text-to-Speech API enabled
- [ ] Test credentials work: one small STT call
- [ ] Create `package.json` with dependencies (✓ COMPLETED)
- [ ] Run `npm install`

**Expected Completion Time**: 8 hours

**Notes**:
```
To do:
1. Ensure GOOGLE_API_KEY environment variable set
2. Run: npm install
3. Test GCP permissions manually in console
4. Implement actual API client initialization in google.js (currently stubbed)
```

**Success Criteria**:
- ✅ Can require google.js without errors
- ✅ Environment variables loaded
- ✅ npm dependencies installed

---

### Tuesday, March 25 — Speech-to-Text Service

**Tasks**:
- [ ] Create `src/modules/voice/services/speech-to-text.service.js` (150 lines)
  - [ ] Wrap Google Cloud Speech API
  - [ ] Handle 16kHz PCM input format
  - [ ] Return transcript + confidence score
  - [ ] Error handling & retry logic
  - [ ] Logging for debugging
- [ ] Unit tests for STT (Test 1.1 from Testing Strategy)
  - [ ] Test 1.1.1: Clear English audio
  - [ ] Test 1.1.2: English with accent (en-IN)
  - [ ] Test 1.1.3: Hindi audio (hi-IN)
  - [ ] Test 1.1.4: Silent audio (no speech)
  - [ ] Test 1.1.5: Corrupted audio buffer
  - [ ] Test 1.1.6: Max 10MB file
  - [ ] Test 1.1.7: Invalid API key (403 error)
- [ ] Record test audio samples
- [ ] Debug any STT issues (accuracy, API errors, permissions)

**Expected Completion Time**: 8 hours

**Code Location**: `src/modules/voice/services/speech-to-text.service.js`

**Template**:
```javascript
class SpeechToTextService {
  async transcribe(audioBuffer, languageCode = 'en-US') {
    // TODO: Call Google Cloud STT API
    // Input: audioBuffer (16kHz PCM)
    // Output: { transcript, confidence }
  }
}
```

**Success Criteria**:
- ✅ Test 1.1: 6/7 tests passing
- ✅ Accuracy > 90% for clear English speech
- ✅ No crashes on invalid input

---

### Wednesday, March 26 — Text-to-Speech Service

**Tasks**:
- [ ] Create `src/modules/voice/services/text-to-speech.service.js` (150 lines)
  - [ ] Wrap Google Cloud Text-to-Speech API
  - [ ] Input: text + language + voice parameters
  - [ ] Output: 24kHz PCM audio buffer
  - [ ] Handle character limit (max 5000)
  - [ ] Voice selection (language, gender, pitch)
- [ ] Unit tests for TTS (Test 1.2)
  - [ ] Test 1.2.1: English text to speech
  - [ ] Test 1.2.2: Hindi text to speech
  - [ ] Test 1.2.3: Max 5000 characters
  - [ ] Test 1.2.4: Over limit (truncate/error)
  - [ ] Test 1.2.5: Empty string
  - [ ] Test 1.2.6: Special characters
  - [ ] Test 1.2.7: Different voice names
  - [ ] Test 1.2.8: Invalid API key
- [ ] Validate audio quality (no distortion)
- [ ] Measure latency (target: <2.5s)

**Expected Completion Time**: 8 hours

**Code Location**: `src/modules/voice/services/text-to-speech.service.js`

**Template**:
```javascript
class TextToSpeechService {
  async synthesize(text, languageCode = 'en-US', voiceParams = {}) {
    // TODO: Call Google Cloud TTS API
    // Input: text (max 5000 chars), language, voice params
    // Output: audioBuffer (24kHz PCM)
  }
}
```

**Success Criteria**:
- ✅ Test 1.2: 8/8 tests passing
- ✅ Audio quality acceptable (no distortion)
- ✅ Latency < 2.5s for typical responses

---

### Thursday, March 27 — Audio Converter & Gemini Integration

**Tasks**:
- [ ] Create `src/utils/audio-converter.js` (100 lines)
  - [ ] 8kHz → 16kHz upsampling (linear interpolation)
  - [ ] 16kHz → 8kHz downsampling (decimation)
  - [ ] 24kHz → 8kHz downsampling
  - [ ] RMS normalization (prevent clipping)
- [ ] Unit tests for audio converter (Test 1.4)
  - [ ] Test 1.4.1: 8kHz → 16kHz conversion quality
  - [ ] Test 1.4.2: 16kHz → 8kHz conversion quality
  - [ ] Test 1.4.3: 24kHz → 8kHz conversion quality
  - [ ] Test 1.4.4: Round-trip conversion
  - [ ] Test 1.4.5: No clipping on high amplitude
- [ ] Implement Gemini LLM integration (simple text model)
  - [ ] Accept text input + agent prompt
  - [ ] Return text response
  - [ ] Measure latency
- [ ] Test Gemini integration with sample input

**Expected Completion Time**: 8 hours

**Code Location**:
- `src/utils/audio-converter.js`
- `src/modules/voice/services/gemini-lm.service.js` (TBD)

**Template**:
```javascript
class AudioConverter {
  upsample8kTo16k(audioBuffer) {
    // TODO: Linear interpolation
  }

  downsample24kTo8k(audioBuffer) {
    // TODO: Decimation
  }

  normalize(audioBuffer) {
    // TODO: RMS normalization
  }
}
```

**Success Criteria**:
- ✅ Test 1.4: 5/5 tests passing
- ✅ RMS preserved (>90%)
- ✅ No clipping or distortion
- ✅ Gemini returns text responses

---

### Friday, March 28 — Core Voice Service Architecture

**Tasks**:
- [ ] Create `src/modules/voice/services/traditional-voice.service.js` (200 lines, basic version)
  - [ ] Orchestrate STT → Gemini → TTS flow
  - [ ] Session management
  - [ ] Turn handling (VAD signal)
  - [ ] Error handling
  - [ ] Logging
- [ ] Integration test (Test 2.1)
  - [ ] Simulate audio input
  - [ ] Verify pipeline end-to-end
  - [ ] All services work together
- [ ] Latency optimization
  - [ ] Profile each service
  - [ ] Identify bottlenecks
  - [ ] Parallelize if possible
- [ ] Code review & cleanup
- [ ] Weekly summary & blockers

**Expected Completion Time**: 8 hours

**Code Location**: `src/modules/voice/services/traditional-voice.service.js`

**Template**:
```javascript
class TraditionalVoiceService {
  constructor(config) {
    this.config = config;
    this.sttService = new SpeechToTextService();
    this.lmService = new GeminiLMService();
    this.ttsService = new TextToSpeechService();
  }

  async processAudioTurn(audioBuffer) {
    // 1. STT: audioBuffer → transcript
    // 2. LLM: transcript → response
    // 3. TTS: response → audioBuffer
    // 4. Return audio
  }
}
```

**Success Criteria**:
- ✅ Integration test 2.1 passing
- ✅ End-to-end latency < 5 seconds
- ✅ No data loss at transitions

---

## Weekly Summary Template

**Completed**:
- [ ] google.js (Google Cloud clients initialization)
- [ ] env.js (environment variable loading)
- [ ] package.json (dependencies)
- [ ] server.js (Express skeleton)
- [ ] logger.js (Winston logging)
- [ ] speech-to-text.service.js
- [ ] text-to-speech.service.js
- [ ] audio-converter.js
- [ ] traditional-voice.service.js

**Unit Tests Passing**:
- [ ] Test 1.1 (STT): 6/7 tests ✅
- [ ] Test 1.2 (TTS): 8/8 tests ✅
- [ ] Test 1.4 (Audio Converter): 5/5 tests ✅

**Integration Tests Passing**:
- [ ] Test 2.1 (End-to-end pipeline): ✅

**Blockers/Issues**:
- List any blockers encountered
- Document solutions/workarounds
- Plan for next week

**Performance Metrics**:
- STT latency: ___ ms
- Gemini latency: ___ ms
- TTS latency: ___ ms
- Total e2e latency: ___ ms

**Next Week Preview**:
- Cache system implementation
- mediastream.handler.js (WebSocket)
- Multi-turn conversation support

---

## Files Modified This Week

```
✓ CREATED: .env.example
✓ CREATED: .gitignore
✓ CREATED: package.json
✓ CREATED: README.md
✓ CREATED: src/server.js
✓ CREATED: src/config/google.js
✓ CREATED: src/config/env.js
✓ CREATED: src/utils/logger.js

TBD:
- src/modules/voice/services/speech-to-text.service.js
- src/modules/voice/services/text-to-speech.service.js
- src/utils/audio-converter.js
- src/modules/voice/services/traditional-voice.service.js
- Tests for above services
```

---

## Quick Commands

**Daily standup**:
```bash
# Check status of all services
curl http://localhost:5000/health
curl http://localhost:5000/api/status
```

**Run tests**:
```bash
npm test
```

**Development**:
```bash
npm run dev
```

**Lint code**:
```bash
npm run lint
```

---

**Status**: 🟡 Ready to start Monday, March 24
**Last Updated**: 2026-03-19
