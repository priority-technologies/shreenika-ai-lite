# STEP 1: Gemini Audio Output - Diagnostic Guide

## What Was Changed
Added comprehensive diagnostic logging to identify why Gemini Live is producing 0 audio chunks despite `responseModalities: ['AUDIO']` being configured.

## Files Modified
1. **google.live.client.js** - Setup logging + message handler diagnostics
2. **voice.service.js** - Audio chunk tracking + logging
3. All changes committed: `git show dd5ccca`

---

## Expected Log Output Flow

### 1. Connection Phase
```
🔌 GEMINI LIVE CONNECTION STARTING
   ├─ Model: gemini-2.5-flash-native-audio-preview-12-2025
   ├─ Voice: Aoede
   ├─ API Key present: true
   └─ Timestamp: 2026-02-22T...

✅ WebSocket OPEN (245ms)
```

### 2. Setup Message Phase
```
🔧 GEMINI LIVE SETUP MESSAGE:
   ├─ Model: models/gemini-2.5-flash-native-audio-preview-12-2025
   ├─ Response Modalities: ["AUDIO"]
   ├─ Voice Name: Aoede
   ├─ Audio Output: ENABLED ✅
   ├─ System Instruction: 2847 chars
   └─ Cache ID: NONE

✅ SETUP COMPLETE received (450ms from start)
✅ Gemini Live session setup complete
   ├─ Session ID: abc123...
   ├─ Audio output: Ready to receive
   └─ Timestamp: 2026-02-22T...
```

### 3. Audio Input Phase (User Speaking)
```
🎤 Audio chunk #1 sent to Gemini: 1024 bytes (1.00 KB), energy=45
🎤 Audio chunk #10 sent to Gemini: 1024 bytes (1.00 KB), energy=52
```

### 4. Gemini Response Phase - CRITICAL

#### Expected (Audio Working) ✅
```
📊 [Gemini] modelTurn received:
   ├─ Parts count: 2
   ├─ Part[0] type: INLINEDATA
   │  ├─ InlineData:
   │  │  ├─ MIME Type: audio/pcm
   │  │  ├─ Is audio?: YES ✅
   │  │  └─ Data length (base64): 2048 chars
   ├─ Part[1] type: TEXT
   │  └─ Text (78 chars): "Hello, how can I assist you today?"

📥 ✅ AUDIO CHUNK RECEIVED from Gemini: 1536 bytes (base64 input: 2048 chars)
📥 ✅ Audio chunk #1 received from Gemini: 1536 bytes (1.50 KB)
🎯 First audio chunk from Gemini - marking audio received time for latency

💬 [Gemini] Text: "Hello, how can I assist you today?"
✅ Model turn complete - waiting for next user input
```

#### Problematic Case #1: No Audio (Audio Only Text) ❌
```
📊 [Gemini] modelTurn received:
   ├─ Parts count: 1
   ├─ Part[0] type: TEXT
   │  └─ Text (78 chars): "Hello, how can I assist you today?"

⚠️ MODEL TURN RECEIVED BUT NO AUDIO FOUND - Gemini may not be outputting audio
```
**Diagnosis**: responseModalities not working OR Gemini rejecting the setup

#### Problematic Case #2: Empty Response ❌
```
📊 [Gemini] modelTurn received:
   ├─ Parts count: 0

⚠️ MODEL TURN RECEIVED BUT NO AUDIO FOUND - Gemini may not be outputting audio
```
**Diagnosis**: Gemini not processing input OR system instruction causing silent responses

#### Problematic Case #3: Wrong MIME Type ❌
```
📊 [Gemini] modelTurn received:
   ├─ Parts count: 1
   ├─ Part[0] type: INLINEDATA
   │  ├─ InlineData:
   │  │  ├─ MIME Type: application/octet-stream
   │  │  ├─ Is audio?: NO ❌
   │  │  └─ Data length (base64): 2048 chars
```
**Diagnosis**: Gemini outputting audio but in wrong format - parsing issue

---

## How to Test

### Step 1: Deploy
```bash
cd shreenika-ai-backend
gcloud run deploy shreenika-ai-backend \
  --region asia-south1 \
  --allow-unauthenticated
```

### Step 2: Trigger a Test Call
Use the SansPBX test feature or Twilio to make a call

### Step 3: View Real-Time Logs
```bash
# Terminal 1: Watch all Gemini-related logs
gcloud run services logs read shreenika-ai-backend \
  --region asia-south1 \
  --follow | grep -E "GEMINI|AUDIO|Setup"

# Terminal 2: Watch for errors
gcloud run services logs read shreenika-ai-backend \
  --region asia-south1 \
  --follow | grep -E "ERROR|❌"
```

### Step 4: Look For
- ✅ "SETUP MESSAGE" log → confirms setup is correct
- ✅ "Audio chunk #N sent" → confirms user audio reaching Gemini
- ✅ "AUDIO CHUNK RECEIVED" → confirms Gemini outputting audio
- ❌ "MODEL TURN RECEIVED BUT NO AUDIO FOUND" → identifies the issue

---

## Root Cause Matrix

| Symptom | Likely Cause | Next Step |
|---------|-------------|-----------|
| No audio chunks sent to Gemini | Voice system not working OR call never started | Check VoiceService initialization |
| Audio sent but no response | Gemini API issue OR model doesn't support native audio | Check Gemini API quota + API keys |
| modelTurn with text but no audio | responseModalities not configured | STEP 1B: Fix setup message |
| modelTurn with wrong MIME type | API changed response format | Contact Google + update parser |
| modelTurn empty (0 parts) | System instruction breaking Gemini | Simplify system instruction test |

---

## What's Next

Once we see the diagnostic output:
1. **If audio IS being received**: Deploy STEP 2 (Audio Routing)
2. **If audio is NOT being received**: Fix Gemini configuration in STEP 1B
3. **If we see errors**: Diagnose specific error codes

---

## Key Files to Monitor

**Production Logs**:
- `/Cloud Run Logs` - Real-time from cloud platform
- Search for: `GEMINI`, `AUDIO`, `ERROR`

**Code Locations**:
- Audio receive: `src/config/google.live.client.js` line 554
- Audio send: `src/config/google.live.client.js` line 555
- Event handlers: `src/modules/call/voice.service.js` line 221

---

## Emergency Rollback
If deployment causes issues:
```bash
# Revert to previous working revision
gcloud run services update-traffic shreenika-ai-backend \
  --region asia-south1 \
  --to-revisions PREVIOUS_REVISION_ID=100
```

---

**Created**: 2026-02-22
**Author**: Claude
**Status**: Ready for deployment + testing
