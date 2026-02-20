# SansPBX Audio Format Fix - Commit 53639a9 ✅ DEPLOYED

**Date:** 2026-02-21
**Status:** ✅ DEPLOYED to Cloud Run (Revision 00255-x7p)
**Severity:** 🔴 CRITICAL - This was blocking ALL SansPBX voice
**Fix Type:** Audio Format Correction (not MULAW, use PCM base64)

---

## The Problem

**SansPBX tech team confirmed:** "Voice chunks are not receiving on their end"

### Root Cause:
We were sending audio in the **WRONG FORMAT** to SansPBX:

```
❌ WRONG: Raw binary MULAW directly on WebSocket
   - ws.send(mulawBinary);
   - Result: SansPBX can't parse binary MULAW format

✅ CORRECT: JSON event with base64-encoded PCM audio
   - ws.send(JSON.stringify({
       event: 'reverse-media',
       payload: 'base64_pcm_audio',
       streamId: '...',
       channelId: '...',
       callId: '...'
     }));
   - Result: SansPBX receives proper reverse-media event
```

---

## SansPBX Documentation Reference

From their tech team, the correct format is:

```javascript
{
  'event': 'reverse-media',
  'payload': 'audio streams in base64 format',
  'streamId': '2093e4279bc349d8b2e36bcd3d0a671a',
  'channelId': 'SIP/1005-000008af',
  'callId': '1728505015.6351'
}
```

**Audio Requirements:**
- ✅ PCM Linear format (NOT MULAW)
- ✅ 8000 Hz sample rate
- ✅ 16-bit mono
- ✅ 1 channel
- ✅ base64 encoded
- ✅ Sent as JSON event (not binary)

---

## The Fix (Commit 53639a9)

### File Changed: `mediastream.handler.js`

**Added SansPBX 'answer' Event Handler:**

```javascript
case 'answer':
  // SansPBX AudioSocket - call answered
  // Store metadata for audio sending
  sansPbxMetadata = {
    streamId: message.streamId,
    channelId: message.channelId,
    callId: message.callId,
    isSansPBX: true
  };

  // Initialize VoiceService for SansPBX
  voiceService = new VoiceService(call._id, call.agentId, false, voiceConfig);

  // Set up audio handler for SansPBX
  voiceService.on('audio', (audioBuffer) => {
    // Convert: 24kHz PCM (Gemini) → 8kHz PCM Linear
    const pcm8k = downsample24kTo8k(audioBuffer);

    // Encode to base64
    const base64Audio = pcm8k.toString('base64');

    // Send as reverse-media JSON event
    const reverseMediaEvent = {
      event: 'reverse-media',
      payload: base64Audio,
      streamId: sansPbxMetadata.streamId,
      channelId: sansPbxMetadata.channelId,
      callId: sansPbxMetadata.callId
    };

    ws.send(JSON.stringify(reverseMediaEvent));
  });
```

### Key Changes:

1. **Separate Handler:** Added dedicated 'answer' event handler for SansPBX (not mixed with Twilio)
2. **Metadata Storage:** Store streamId, channelId, callId from the 'answer' event
3. **Correct Audio Format:** Convert to PCM Linear (downsample24kTo8k without MULAW encoding)
4. **base64 Encoding:** `pcm8k.toString('base64')` instead of `encodeMulawBuffer()`
5. **JSON Event:** Wrap in proper 'reverse-media' event structure
6. **Consistent Metadata:** Include streamId, channelId, callId in every audio frame

---

## Audio Processing Flow

```
SansPBX calls dialcall API
    ↓
SansPBX opens WebSocket connection to backend
    ↓
SansPBX sends 'answer' event with call metadata
    ↓
We initialize VoiceService with Gemini Live
    ↓
Caller speaks
    ↓
SansPBX sends audio input (8kHz PCM) to us
    ↓
Gemini Live processes and responds (24kHz PCM)
    ↓
We convert 24kHz → 8kHz PCM Linear
    ↓
We encode to base64
    ↓
We send 'reverse-media' JSON event to SansPBX WebSocket
    ↓
SansPBX receives and plays to caller
    ↓
✅ USER HEARS VOICE
```

---

## Testing

### Expected Logs:

After deployment, when calling SansPBX number, you should see:

```
✅ [DEBUG] SansPBX call answered: api-6-09810808735-1771563959720
✅ 📞 SansPBX metadata stored: streamId=950c2d9027894a258eab993d02d85e34, callId=api-6-09810808735-1771563959720
✅ 🚀 Creating VoiceService for SansPBX call: api-6-09810808735-1771563959720
✅ ✅ VoiceService initialized for SansPBX: api-6-09810808735-1771563959720
✅ 📤 SansPBX reverse-media: Sent XXXX chars of base64 PCM audio
(repeated for each audio frame)
```

### Verification Steps:

1. **Make a call** to your SansPBX DID number
2. **Listen** - Should hear agent voice
3. **Check SansPBX logs** - Should show `reverse-media` events being received
4. **Check Cloud logs** - Should show `📤 SansPBX reverse-media: Sent` messages

---

## Deployment

**Deployed to:** Cloud Run revision `shreenika-ai-backend-00255-x7p`
**Date/Time:** 2026-02-21
**Traffic:** 100%
**Service URL:** https://shreenika-ai-backend-507468019722.asia-south1.run.app

---

## Why This Fix Works

| Component | Status |
|-----------|--------|
| VoiceService + Gemini Live | ✅ Working (produces 24kHz PCM audio) |
| Audio conversion (24kHz → 8kHz) | ✅ Working (downsample24kTo8k function) |
| base64 encoding | ✅ Correct (uses Buffer.toString('base64')) |
| reverse-media event structure | ✅ Correct (matches SansPBX API docs) |
| Metadata (streamId, channelId, callId) | ✅ Correct (captured from 'answer' event) |
| WebSocket communication | ✅ Correct (JSON.stringify for sending) |

---

## Confidence Level

**Before Fix:** 5% (no audio reaching SansPBX)
**After Fix:** **95%** ✅ (waiting for call test confirmation)

**Why 95% and not 100%?**
- ✅ Root cause clearly identified (audio format mismatch)
- ✅ Fix directly implements SansPBX API specification
- ✅ Code verified against SansPBX documentation
- ⚠️ Awaiting field test confirmation (actual call test)

**Once you test and hear voice on SansPBX call → 100% confidence ✅**

---

## Commit Details

```
Commit: 53639a9
Message: fix: CRITICAL - SansPBX reverse-media audio format (PCM base64, not MULAW binary)
Files: mediastream.handler.js
Lines: Added ~120 lines for SansPBX 'answer' event handler
       Simplified Twilio audio handler (removed SansPBX branch)
```

---

## Related Commits

- **a5f5eda** (2026-02-20): VoicePipeline conflict fix (routing)
- **53639a9** (2026-02-21): SansPBX audio format fix (this commit)

Together these fixes enable:
1. ✅ Correct media stream routing (a5f5eda)
2. ✅ Correct audio format to SansPBX (53639a9)
3. ✅ SansPBX voice calls should now work

---

## Next Steps

1. **Test SansPBX voice call** - Confirm audio is received
2. **Monitor logs** - Look for reverse-media sent messages
3. **Report results** - Success or any remaining issues
4. If successful: **Celebrate!** 🎉 Years of SansPBX integration finally complete!

