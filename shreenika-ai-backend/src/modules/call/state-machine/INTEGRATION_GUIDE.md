# State Machine Integration Guide

This guide shows how to integrate the xState Voice Call Machine into the existing VoiceService and mediastream handler.

---

## Overview

The state machine is integrated via three layers:

```
mediastream.handler.js (audio events)
    ↓
VoiceServiceAdapter (event conversion)
    ↓
StateMachineController (state management)
    ↓
xState Machine (state definitions)
```

---

## Step 1: Update voice.service.js

Add state machine initialization to VoiceService:

```javascript
// At top of voice.service.js
import VoiceServiceAdapter from './state-machine/voice-service-adapter.js';
import MediaStreamStateMachineIntegration from './state-machine/mediastream-integration.js';

export class VoiceService extends EventEmitter {
  constructor(callId, agentId, isTestMode = false, voiceConfig = null) {
    super();

    // ... existing code ...

    this.stateMachineAdapter = null;  // ADD THIS
    this.smIntegration = null;         // ADD THIS
  }

  async initialize() {
    // ... existing initialization code ...

    // ADD THIS at end of initialize() before "console.log('✅ Voice service ready...')"
    try {
      // Initialize state machine adapter
      this.stateMachineAdapter = new VoiceServiceAdapter(this, {
        interruptionSensitivity: this.agent.speechSettings?.interruptionSensitivity || 0.5,
        maxCallDuration: this.agent.maxCallDuration || 600,
        voiceConfig: this.voiceConfig
      });

      // Initialize state machine for this call
      this.stateMachineAdapter.initializeStateMachine(this.callId, this.agentId);

      // Setup state machine action listeners
      this.smIntegration = new MediaStreamStateMachineIntegration(
        this,
        this.stateMachineAdapter
      );
      this.smIntegration.setupStateActionListeners();

      console.log(`✅ State machine initialized for call: ${this.callId}`);
    } catch (error) {
      console.warn(`⚠️ State machine initialization failed (non-critical):`, error.message);
      // Continue without state machine if it fails
    }
  }

  // ADD THIS METHOD to emit audio chunks to state machine
  _emitAudioChunkToStateMachine(audioChunk) {
    if (this.stateMachineAdapter) {
      this.stateMachineAdapter.onAudioChunk(audioChunk);
    }
  }

  // ADD THIS METHOD to handle Gemini finished
  _notifyStateMachineGeminiFinished() {
    if (this.stateMachineAdapter) {
      this.stateMachineAdapter.onGeminiFinished();
    }
  }

  // Modify existing sendAudio() to emit to state machine
  sendAudio(pcmBuffer, energyLevel = 0) {
    // ... existing code ...

    // ADD THIS before this.geminiSession.sendAudio(pcmBuffer);
    this._emitAudioChunkToStateMachine(pcmBuffer);

    // existing code continues...
    this.geminiSession.sendAudio(pcmBuffer);
  }
}
```

---

## Step 2: Update mediastream.handler.js

Modify the WebSocket connection handler to use state machine integration:

```javascript
// At top of mediastream.handler.js
import MediaStreamStateMachineIntegration from './state-machine/mediastream-integration.js';

export const createMediaStreamServer = (httpServer) => {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', async (ws, request, callSid) => {
    // ... existing code ...

    let voiceService = null;
    // ... other declarations ...

    ws.on('message', async (data) => {
      try {
        // Handle Twilio messages
        if (typeof data === 'string') {
          const message = JSON.parse(data);

          // Stream start
          if (message.event === 'start') {
            streamSid = message.streamSid;
            // ... existing code ...

            // CREATE VOICE SERVICE
            voiceService = new VoiceService(
              streamSid,
              agentId,
              false,
              voiceConfig
            );
            await voiceService.initialize();
            console.log(`✅ Voice service initialized`);
          }

          // Media (audio) event
          if (message.event === 'media') {
            const audioChunk = Buffer.from(message.media.payload, 'base64');

            // Process audio through Twilio conversion
            const pcm16k = upsample8kTo16k(audioChunk);

            // IMPORTANT: Send to voice service which will emit to state machine
            voiceService.sendAudio(pcm16k);

            // Also handle Gemini response
            if (voiceService.audioChunksReceived > 0) {
              const response = await voiceService.geminiSession.getAudioBuffer();
              if (response) {
                MediaStreamStateMachineIntegration.handleGeminiResponse(
                  response,
                  voiceService.stateMachineAdapter
                );
              }
            }
          }

          // Stream stop
          if (message.event === 'stop') {
            if (voiceService && voiceService.stateMachineAdapter) {
              voiceService.stateMachineAdapter.onManualHangup();
            }
            // ... existing cleanup code ...
          }
        }

        // Handle SansPBX binary audio
        else if (Buffer.isBuffer(data)) {
          if (voiceService) {
            // Downsample 44100 to 16k
            const pcm16k = downsample44100to16k(data);

            // Send through state machine
            voiceService.sendAudio(pcm16k);
          }
        }
      } catch (error) {
        console.error(`❌ Message handler error:`, error);
      }
    });

    // Handle WebSocket close
    ws.on('close', () => {
      if (voiceService) {
        voiceService.close();
      }
    });
  });

  return wss;
};
```

---

## Step 3: Emit Events from VoiceService

Update the Gemini event handlers in VoiceService to notify state machine:

```javascript
// In _setupGeminiHandlers() method of voice.service.js

_setupGeminiHandlers() {
  // ... existing code ...

  this.geminiSession.on('turnComplete', () => {
    if (this.currentTurnText) {
      // ... existing code ...

      // NOTIFY STATE MACHINE
      this._notifyStateMachineGeminiFinished();
    }
  });

  this.geminiSession.on('error', (error) => {
    console.error(`❌ Gemini session error:`, error.message);

    // NOTIFY STATE MACHINE
    if (this.stateMachineAdapter) {
      this.stateMachineAdapter.onGeminiError(error);
    }

    this.emit('error', error);
  });

  // ... rest of existing code ...
}
```

---

## Step 4: Test Integration

Test the integration with console logs:

```javascript
// In voice.service.js initialize()
console.log(`📊 State Machine Status:`);
console.log(`   ├─ Adapter initialized: ${this.stateMachineAdapter !== null}`);
console.log(`   ├─ Current state: ${this.stateMachineAdapter?.getCurrentState().value}`);
console.log(`   └─ Interruption sensitivity: ${this.agent.speechSettings?.interruptionSensitivity || 0.5}`);
```

---

## State Machine Event Flow

### Audio Input Path
```
Twilio/SansPBX WebSocket
    ↓
mediastream.handler.js (binary audio)
    ↓
voiceService.sendAudio(pcmBuffer)
    ↓
_emitAudioChunkToStateMachine(pcmBuffer)
    ↓
adapter.onAudioChunk(pcmBuffer)
    ↓
State Machine processes:
  - LISTENING → detects audio → HUMAN_SPEAKING
  - HUMAN_SPEAKING → detects silence → PROCESSING_REQUEST
  - RESPONDING → detects interruption → LISTENING
```

### State Machine Action Path
```
State Machine (in action)
    ↓
adapter (handler)
    ↓
voiceService.emit('adapterXXX')
    ↓
integration.setupStateActionListeners()
    ↓
Actual operation (play filler, stop Gemini, etc.)
```

---

## Debugging

Enable state machine logging:

```javascript
// In voice.service.js
if (this.stateMachineAdapter) {
  // Log current state periodically
  setInterval(() => {
    console.log(`[DEBUG] Current state: ${this.stateMachineAdapter.getCurrentState().value}`);
    this.stateMachineAdapter.logState();
  }, 5000); // Every 5 seconds
}
```

---

## Verification Checklist

- [ ] State machine files created (5 files in state-machine/)
- [ ] voice-service.js modified with adapter initialization
- [ ] mediastream.handler.js wired to state machine
- [ ] Gemini event handlers emit to state machine
- [ ] Test: Audio flows from Twilio → state machine → Gemini
- [ ] Test: Silence detection triggers PROCESSING_REQUEST
- [ ] Test: Interruption sensitivity controls interruption logic
- [ ] Test: Filler plays during PROCESSING_REQUEST state
- [ ] Test: Metrics collected and logged on call end

---

## Files Modified/Created

**New Files:**
- `src/modules/call/state-machine/voice-call.machine.js` ✅
- `src/modules/call/state-machine/state.actions.js` ✅
- `src/modules/call/state-machine/state.guards.js` ✅
- `src/modules/call/state-machine/state.services.js` ✅
- `src/modules/call/state-machine/state-machine.controller.js` ✅
- `src/modules/call/state-machine/voice-service-adapter.js` ✅
- `src/modules/call/state-machine/mediastream-integration.js` ✅

**Modified Files:**
- `src/modules/call/voice.service.js` (add adapter integration)
- `src/modules/call/mediastream.handler.js` (wire to state machine)

---

## Next Steps

1. Apply the modifications shown in Steps 1-3
2. Test with local audio input
3. Verify state transitions in console logs
4. Deploy to Cloud Run
5. Monitor metrics collection
