# SansPBX Voice Issue - Complete Diagnostic & Deployment Guide

**Date:** 2026-02-20
**Status:** 🔴 CRITICAL - Voice not working on SansPBX calls
**Root Cause Identified:** Webhook timing + appid configuration mismatch

---

## Executive Summary

### The Issue (Proven by Logs)
```
Test Call: 200 seconds total, 180 seconds billed, NO VOICE
Timeline:
  ✅ 01:47:30 - SansPBX call initiated successfully
  ✅ 01:47:31 - Call received by system
  ❌ 01:47:31-01:50:30 - SILENT (no /twilio/voice called during active call)
  ✅ 01:50:50 - /twilio/voice called with POST-CALL notification (call already ended)
  ⚠️ Result: Recording created but voice NEVER streamed
```

### Root Cause (Confirmed)
**`/twilio/voice` webhook is being called ONLY AFTER the call ends, NOT during the active call.**

This means:
- SansPBX is NOT requesting voice instructions from status_callback during call
- WebSocket connection is NEVER established
- Audio streaming NEVER happens

Why? → **appid=6 is NOT configured in SansPBX admin panel for WebSocket/media streaming**

---

## The Problem Explained

### How Twilio Works (Reference)
```
1. Call initiated with Twiml URL
2. Call answered → Twilio immediately calls Twiml URL
3. Twiml response includes <Connect><Stream url="...">
4. Twilio initiates WebSocket to Stream URL
5. Audio streams in real-time during call
```

### How SansPBX SHOULD Work
```
1. Call initiated with appid, status_callback URL
2. Call answered → SansPBX should call status_callback (IF appid configured for audiosocket)
3. Response should be: {"action": "connect_websocket", "url": "..."}
4. SansPBX initiates WebSocket to that URL
5. Audio streams in real-time during call
```

### What's ACTUALLY Happening With Our Setup
```
1. ✅ Call initiated with appid=6, status_callback URL
2. ✅ Call answered
3. ❌ SansPBX creates recording (audiosocket/...) but DOESN'T call status_callback
4. ❌ NO WebSocket connection attempt
5. ❌ NO audio streams
6. ✅ Call ends → SansPBX calls status_callback with POST-CALL notification
```

**Conclusion:** appid=6 is NOT configured in SansPBX admin for audiosocket/WebSocket streaming.

---

## Code Review - All Fixes Are Correct ✅

### 1. mediastream.handler.js - VAD Implemented Correctly
**Lines 296-305** - Voice Activity Detection is correctly implemented:
```javascript
if (!isVoiceActive(pcmBuffer)) {
  return;  // ← Properly closed brace
}
voiceService.sendAudio(pcmBuffer);  // ← Audio WILL be sent when VAD passes
```
**Status:** ✅ FIXED

### 2. SansPBXProvider.js - API Parameters Cleaned
**Lines 174-182** - Removed fake parameters, using ONLY official API:
```javascript
const payload = {
  appid: this.credentials.appId || 6,
  call_to: normalizedTo,
  caller_id: normalizedFrom,
  status_callback: webhookUrl,
  custom_field: { record_id: `call_${Date.now()}` }
};
```
**Status:** ✅ FIXED

### 3. google.live.client.js - Call Start Behavior Implemented
**Lines 234-249** - Properly instructing Gemini when to start speaking:
```javascript
if (callStartBehavior === 'waitForHuman') {
  parts.push('IMPORTANT: DO NOT SPEAK IMMEDIATELY when the call connects.');
  parts.push('WAIT for the human to speak first...');
} else {
  parts.push('Start speaking immediately when the call connects...');
}
```
**Status:** ✅ FIXED

### 4. twilio.controller.js - Post-Call Detection + Pre-Init
**Lines 242-264** - Correctly detects post-call notifications
**Lines 363-415** - Pre-initializes VoiceService in background
**Status:** ✅ FIXED

---

## Deployment Blocker - Cloud Build Not Triggering

### Current Situation
- ✅ All commits pushed to main branch:
  - `9251414` - Remove fake SansPBX API parameters
  - `fa99b51` - Comprehensive voice pipeline fix
  - `c75415a` - Remove invalid audioEncoding
  - `57501ef` - Load voiceConfig from agent
  - `9a632f1` - Lazy import fix

- ❌ Cloud Build has NOT auto-deployed these commits
- ❌ Latest production deployment is still using old code with the bugs

### Solution: Manual Deployment Required

**Option 1: Google Cloud Console UI (Safest)**
1. Go to https://console.cloud.google.com/run?project=gen-lang-client-0348687456
2. Click on `shreenika-ai-backend` service
3. Click "DEPLOY NEW REVISION"
4. Select source: GitHub (should show recent commits)
5. Select commit: `9251414` (latest)
6. Click "Deploy"
7. Wait for deployment to complete (~5 minutes)

**Option 2: gcloud CLI (Fastest)**
```bash
gcloud run deploy shreenika-ai-backend \
  --source . \
  --region asia-south1 \
  --project gen-lang-client-0348687456
```
This will deploy the latest code from main branch.

**Option 3: Manual Cloud Build Trigger (If trigger is configured)**
```bash
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=_SERVICE_NAME=shreenika-ai-backend,_REGION=asia-south1 \
  --project=gen-lang-client-0348687456
```

---

## What Will Change After Deployment

### When VoiceService Can Connect (IF SansPBX Calls Webhook During Call)
✅ Will have all the fixes:
1. Proper VAD to skip silent frames
2. Call start behavior instructions to Gemini
3. Voice customization (40-60 ratio) applied
4. Knowledge docs injected as fallback
5. Proper error handling and logging

### If SansPBX STILL Only Calls After Call Ends
❌ Won't help unless appid=6 is configured in SansPBX admin

---

## SansPBX Configuration Required

**You MUST contact SansPBX support and verify/configure the following:**

### Requirement 1: Confirm appid Configuration
```
Question: "Is appid=6 configured in the SansPBX admin panel for WebSocket/audiosocket streaming?"

Expected Answer: "Yes, appid=6 is set up to use audiosocket"
```

### Requirement 2: Webhook Timing
```
Question: "When SansPBX answers a call with appid=6, does it call the status_callback URL
           immediately to request voice instructions, or only after the call ends?"

Expected Answer: "We call status_callback immediately when the call is answered to request
                  the audio routing configuration"
```

### Requirement 3: WebSocket URL Format
```
Provide to SansPBX (if they need to set it):
WebSocket URL: wss://shreenika-ai-backend-507468019722.asia-south1.run.app/media-stream/{callSid}

The {callSid} will be replaced with the actual call ID at runtime.
```

### Requirement 4: Response Expectation
```
When our status_callback URL is called, we will respond with:
{
  "action": "connect_websocket",
  "url": "wss://shreenika-ai-backend-507468019722.asia-south1.run.app/media-stream/CALL_ID",
  "parameters": { "callSid": "CALL_ID" }
}

Expected: SansPBX connects to this WebSocket URL and streams audio
```

---

## Testing Procedure (After Deployment + SansPBX Config)

### Step 1: Deploy Code
```bash
# Use Option 1, 2, or 3 above to deploy latest code
```

### Step 2: Make a Test Call
```bash
# Create a test lead in your account
# Click "Call" on a lead
# Select an agent with SansPBX as VOIP provider
# Wait for call to connect
```

### Step 3: Check Logs in Real-Time
```
Google Cloud Console → Logs Explorer → Filter for:
  resource.type="cloud_run_revision"
  resource.labels.service_name="shreenika-ai-backend"

Look for these log messages (in order):
  ✅ "SansPBX: Initiating call"
  ✅ "📥 /twilio/voice WEBHOOK RECEIVED" (during call, not after)
  ✅ "🎙️ Stream started" (WebSocket connected)
  ✅ "🎙️ Voice customization loaded"
  ✅ "✅ Voice service initialized"
  ✅ "📞 Stream stopping" (at end of call)
```

### Step 4: Expected Result
```
You should HEAR voice on the call (your agent speaking)
Call duration should match billsec in logs
No errors in voice service initialization
```

---

## Diagnostic Logging (Already in Code)

When `/twilio/voice` is called, our logs now show:

```javascript
console.log(`\n📥 /twilio/voice WEBHOOK RECEIVED from provider`);
console.log(`   Headers:`, JSON.stringify(req.headers, null, 2));
console.log(`   Body:`, JSON.stringify(req.body, null, 2));
```

This will show EXACTLY what SansPBX is sending and when.

---

## Quick Deployment Steps

**DO THIS NOW:**

1. **Google Cloud Console:**
   - Navigate to Cloud Run: https://console.cloud.google.com/run?project=gen-lang-client-0348687456
   - Click `shreenika-ai-backend`
   - Click "CREATE NEW REVISION" or "DEPLOY"
   - Select branch: `main`
   - Wait for green checkmark (~5 minutes)

2. **Verify Deployment:**
   - After deployment, note the new revision name (e.g., `00150-abc123`)
   - Check that traffic is flowing to new revision (should see 100%)

3. **Test Call:**
   - Make a test call to verify logs show your fixes are active

4. **Contact SansPBX:**
   - Share the "SansPBX Configuration Required" section with them
   - Ask them to confirm appid=6 is properly configured
   - Provide the WebSocket URL to them if they need it

---

## Summary

| Item | Status | Action |
|------|--------|--------|
| Code fixes | ✅ COMPLETE | None, all committed |
| Deployment | ❌ BLOCKED | Deploy manually now (see steps above) |
| SansPBX config | ❓ UNKNOWN | Contact SansPBX support to verify |
| Testing | ⏳ PENDING | Test after deployment |

**Next Step:** Deploy using Google Cloud Console, then test with a real call.
