# 🎯 SMART AGENT STATE MACHINE BLUEPRINT
## Real-Time Voice AI Sales Agent - Implementation Workflow for Claude Code

**Version**: 2.0  
**Date**: 2026-02-23  
**Purpose**: Production-ready State Machine + Complete Implementation Guide  
**Status**: Ready for Claude Code Development

---

## 🧠 PART 1: STATE MACHINE ARCHITECTURE

### Core Philosophy
> **"A Voice AI Agent is NOT a chatbot with voice. It's a real-time state machine that thinks, speaks, and adapts like a human sales expert."**

### The 5 States (Real-Time Voice State Machine)

```
┌─────────────────────────────────────────────────────────────┐
│                    STATE MACHINE FLOW                        │
│                                                              │
│  ┌──────┐    Call      ┌───────────┐   VAD>500ms  ┌────────┐│
│  │ IDLE │─────Start────►│ LISTENING │──────────────►│THINKING││
│  └──────┘              └───────────┘              └────────┘│
│     ▲                       ▲  │                       │     │
│     │                       │  │ Interrupt             │     │
│     │                       │  │ Detected              │     │
│     │                       │  ▼                       │     │
│  ┌──────┐              ┌───────────┐   LLM         ┌────────┐│
│  │ END  │◄─────────────│ SPEAKING  │◄──Response────│RECOVERY││
│  └──────┘              └───────────┘              └────────┘│
│                             │  ▲                       ▲     │
│                             │  └─── Filler ─────────────┘     │
│                             └─── Complete ───► Next Turn      │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 STATE 1: IDLE (Waiting)

### Definition
Agent is initialized but call hasn't started or is paused.

### Entry Conditions
- System startup
- Call ended normally
- Call on hold (future feature)

### Activities in This State
```javascript
IDLE_STATE = {
  activities: [
    "Load agent configuration from database",
    "Initialize Gemini Live session (pre-warm)",
    "Load filler metadata index",
    "Verify voice settings",
    "Initialize conversation analyzer",
    "Initialize principle decision engine",
    "Pre-load first 5 fillers in memory (cache)"
  ],
  
  monitoring: {
    systemHealth: "Check Gemini API connectivity",
    fillerAvailability: "Verify at least 10 fillers per language loaded",
    voiceReady: "Confirm voice model loaded"
  },
  
  transitions: {
    toListening: "When call_start event received",
    toError: "If initialization fails"
  }
}
```

### Critical Rules
- ✅ Must complete in <2 seconds (pre-warming)
- ✅ Must verify all dependencies (Gemini, fillers, config)
- ❌ Never wait for welcome message (deprecated)

### Exit Conditions
- Call start signal received → LISTENING
- Initialization error → ERROR state (not in 5 states, handle separately)

---

## 📋 STATE 2: LISTENING (Perception)

### Definition
Agent is SILENT and actively collecting audio from user.

### Entry Conditions
- From IDLE: Call just started
- From SPEAKING: Agent finished speaking
- From RECOVERY: Filler finished playing
- From SPEAKING: User interrupted agent (immediate transition)

### Activities in This State
```javascript
LISTENING_STATE = {
  audioProcessing: {
    action: "Stream user audio to Gemini Live",
    buffer: "16-bit PCM @ 16kHz mono",
    vad: {
      engine: "WebRTC VAD or Gemini built-in",
      silenceThreshold: 500, // ms
      energyThreshold: -40,  // dB
      checkInterval: 100     // ms
    }
  },
  
  parallelAnalysis: {
    languageDetection: "Analyze first 2-3 seconds for language",
    sentimentTracking: "Real-time emotion detection",
    intentAnalysis: "What is user asking/saying?"
  },
  
  transitionLogic: {
    rule: "IF silence > 500ms AND speech detected before",
    action: "Transition to THINKING",
    exception: "IF total audio < 1 second, wait for more"
  }
}
```

### Critical Rules
- ✅ **VAD Trigger**: Silence > 500ms → THINKING
- ✅ **Interruption Detection**: If user talks while in SPEAKING → immediately kill audio and return to LISTENING
- ✅ **No Timeout**: Can listen indefinitely (user may pause while thinking)
- ❌ **Never Start Speaking**: Agent is MUTE in this state

### Exit Conditions
- Silence > 500ms detected → THINKING
- Call ended by user → IDLE

---

## 📋 STATE 3: THINKING (Reasoning)

### Definition
Agent stops audio stream and processes user input through LLM.

### Entry Conditions
- From LISTENING: VAD detected silence >500ms

### Activities in This State
```javascript
THINKING_STATE = {
  step1_PrepareContext: {
    action: "Package conversation context",
    data: {
      userTranscript: "What user just said",
      conversationHistory: "Last 10 turns",
      agentProfile: "Loaded from config",
      currentStage: "From conversation analyzer",
      detectedProfile: "From conversation analyzer",
      activeObjections: "From conversation analyzer",
      selectedPrinciple: "From principle decision engine"
    }
  },
  
  step2_SendToLLM: {
    model: "Gemini 1.5 Pro (multimodal-live)",
    systemPrompt: "Built ONCE at call start (never update mid-call)",
    streamingMode: true, // CRITICAL: First token ASAP
    maxTokens: 150,      // Keep responses concise
    temperature: 0.7
  },
  
  step3_ParallelFillerPrep: {
    action: "While waiting for LLM, prepare filler",
    hedgeEngine: {
      silenceTimer: "Start 400ms countdown",
      fillerSelection: {
        filterLanguage: "Match detected language",
        filterPrinciple: "Match current principle",
        filterProfile: "Match client profile",
        selectBest: "Choose highest effectiveness score",
        loadToBuffer: "Pre-load in memory"
      }
    }
  },
  
  step4_ResponseMonitoring: {
    timeout: 3000, // ms
    onTimeout: "Transition to RECOVERY",
    onFirstToken: "Transition to SPEAKING (streaming)"
  }
}
```

### Critical Rules
- ✅ **Streaming First Token**: Don't wait for full response
- ✅ **3-Second Timeout**: If no response → RECOVERY
- ✅ **Parallel Filler Prep**: Start selecting filler immediately (don't wait for LLM timeout)
- ✅ **No System Prompt Updates**: Use the one built at call start
- ❌ **Never Block**: If LLM is slow, filler plays (RECOVERY state)

### Exit Conditions
- First LLM token received → SPEAKING
- Timeout (3 seconds) → RECOVERY
- LLM error → RECOVERY

---

## 📋 STATE 4: SPEAKING (Action)

### Definition
Agent plays LLM response audio to user.

### Entry Conditions
- From THINKING: LLM response ready (first token received)
- From RECOVERY: Filler finished AND LLM response now ready

### Activities in This State
```javascript
SPEAKING_STATE = {
  audioPlayback: {
    source: "Gemini Live native audio (streamed)",
    format: "24kHz 16-bit PCM",
    streaming: true, // Play as tokens arrive
    volumeNormalization: true
  },
  
  interruptionMonitoring: {
    mechanism: "Dual audio channel monitoring",
    userAudioChannel: "Always active (listening in background)",
    vadOnUserChannel: {
      energyThreshold: -35, // dB (higher than normal to avoid false positives)
      minDuration: 300,     // ms (user must speak for 300ms to interrupt)
      action: "IMMEDIATELY kill agent audio and transition to LISTENING"
    }
  },
  
  parallelLogging: {
    action: "Log this turn while speaking",
    data: {
      userMessage: "Transcript",
      agentResponse: "What's being said",
      principle: "Which principle was applied",
      stage: "Conversation stage",
      profile: "Detected client profile",
      timestamp: "Turn completion time"
    }
  }
}
```

### Critical Rules
- ✅ **Interruption Handling**: If user starts talking → IMMEDIATELY stop audio and switch to LISTENING
- ✅ **Streaming Audio**: Play first audio chunk within 200ms of first token
- ✅ **Background Listening**: User audio channel NEVER stops (always monitoring for interruption)
- ❌ **No Blocking**: Don't wait for full response before starting playback

### Exit Conditions
- Audio playback complete → LISTENING (next turn)
- User interruption detected → LISTENING (immediate)
- Call ended by user → IDLE

---

## 📋 STATE 5: RECOVERY (Error Handling)

### Definition
LLM didn't respond in time. Play intelligent filler to avoid awkward silence.

### Entry Conditions
- From THINKING: LLM timeout (3 seconds with no response)
- From THINKING: LLM error (connection failed, rate limit, etc.)

### Activities in This State
```javascript
RECOVERY_STATE = {
  fillerPlayback: {
    source: "Pre-selected filler from Hedge Engine V2",
    selection: {
      language: "MUST match detected language",
      principle: "MUST match current principle",
      profile: "Should match client profile",
      variety: "Different from last 3 fillers used"
    },
    examples: [
      "Hmm, let me think about that...", // English, Thoughtful
      "मला वाटतं की...", // Marathi, Consideration
      "Interesting point, you know...", // Hinglish, Liking
      "That's a great question, actually..." // English, Authority
    ]
  },
  
  llmRetryLogic: {
    action: "While filler plays, retry LLM call",
    maxRetries: 2,
    retryDelay: 0, // Immediate (already in timeout)
    fallbackResponse: "I'm having trouble hearing you clearly. Could you repeat that?"
  },
  
  transitionLogic: {
    ifLLMResponds: "Transition to SPEAKING (use LLM response)",
    ifFillerEnds: "Transition to LISTENING (prompt user to continue)",
    ifStillFailing: "Play second filler, then graceful apology"
  }
}
```

### Critical Rules
- ✅ **Filler Selection**: MUST be language-aware and principle-aware
- ✅ **LLM Retry**: Continue trying to get LLM response while filler plays
- ✅ **Graceful Degradation**: If 2 fillers fail, apologize and ask user to repeat
- ✅ **No Silent Gaps**: User should NEVER experience the "2-minute silence"
- ❌ **Never Random**: Filler must be contextually appropriate

### Exit Conditions
- LLM response received during filler → SPEAKING
- Filler finished, no LLM response → LISTENING (ask user to continue)
- Fatal error (no fillers available) → Apologize and end call

---

## 🔄 PART 2: STATE TRANSITION RULES

### Transition Matrix

| From State | To State | Trigger | Latency Target |
|-----------|----------|---------|----------------|
| IDLE | LISTENING | Call start signal | <100ms |
| LISTENING | THINKING | VAD: Silence >500ms | <50ms |
| THINKING | SPEAKING | LLM first token | <200ms |
| THINKING | RECOVERY | LLM timeout (3s) | 0ms (immediate) |
| RECOVERY | SPEAKING | LLM responds | <200ms |
| RECOVERY | LISTENING | Filler ends, no LLM | <100ms |
| SPEAKING | LISTENING | Audio complete | <100ms |
| SPEAKING | LISTENING | User interruption | <50ms (CRITICAL) |
| ANY | IDLE | Call end signal | <100ms |

### Critical Transition: SPEAKING → LISTENING (Interruption)

```javascript
INTERRUPTION_HANDLER = {
  mechanism: "Dual-channel audio monitoring",
  
  userAudioChannel: {
    status: "Always active (never stops)",
    vad: {
      energyThreshold: -35, // dB
      minDuration: 300,     // ms (avoid false positives)
      callback: "onUserSpeechDetected()"
    }
  },
  
  onUserSpeechDetected: {
    step1: "Immediately send STOP signal to audio output",
    step2: "Flush audio buffer (clear remaining audio)",
    step3: "Transition state to LISTENING",
    step4: "Start collecting user audio",
    totalTime: "<50ms (CRITICAL for natural feel)"
  },
  
  agentAudioChannel: {
    status: "Active only during SPEAKING state",
    stopMechanism: "Immediate buffer flush (not graceful fade)"
  }
}
```

**Why This Matters**: Natural conversation requires instant interruption handling. Humans don't wait politely - they interrupt. Agent must respond instantly.

---

## 🧠 PART 3: INTELLIGENT SUBSYSTEMS

### 3.1 Conversation Analyzer (Real-Time)

```javascript
CONVERSATION_ANALYZER = {
  purpose: "Understand what's happening in the conversation",
  
  inputPerTurn: {
    userTranscript: "What user just said",
    conversationHistory: "Last 10 turns",
    agentProfile: "From config"
  },
  
  analysis: {
    stage: {
      options: ["AWARENESS", "CONSIDERATION", "DECISION"],
      logic: `
        - AWARENESS: User learning about product/service
        - CONSIDERATION: User comparing options, asking questions
        - DECISION: User ready to buy or needs final push
      `,
      detection: "Keyword-based + sentiment + turn count"
    },
    
    profile: {
      options: ["ANALYTICAL", "EMOTIONAL", "SKEPTICAL", "DECISION_MAKER", "RELATIONSHIP_SEEKER"],
      logic: `
        - ANALYTICAL: Asks for data, numbers, comparisons
        - EMOTIONAL: Talks about feelings, experiences, stories
        - SKEPTICAL: Questions everything, needs proof
        - DECISION_MAKER: Direct, time-sensitive, wants action
        - RELATIONSHIP_SEEKER: Values connection, rapport, trust
      `,
      detection: "Language pattern analysis + question types"
    },
    
    objections: {
      options: ["PRICE", "QUALITY", "TRUST", "TIMING", "NEED"],
      detection: "Keyword triggers",
      examples: {
        PRICE: ["expensive", "cost", "budget", "afford"],
        QUALITY: ["worth it", "reliable", "reviews", "proof"],
        TRUST: ["guarantee", "scam", "legitimate", "references"],
        TIMING: ["later", "not now", "thinking", "rush"],
        NEED: ["don't need", "have one", "satisfied", "unnecessary"]
      }
    },
    
    language: {
      detection: "First 2-3 seconds of audio",
      options: ["English", "Marathi", "Hindi", "Hinglish", "Tamil", "Telugu", "Kannada"],
      fallback: "English if undetected",
      storage: "Cache for rest of call (don't re-detect every turn)"
    }
  },
  
  outputPerTurn: {
    stage: "AWARENESS | CONSIDERATION | DECISION",
    profile: "ANALYTICAL | EMOTIONAL | etc.",
    objections: ["PRICE", "TRUST"], // Can be multiple
    language: "Marathi",
    sentiment: 0.65 // 0-1 scale (0=negative, 1=positive)
  },
  
  performance: {
    executionTime: "<100ms (must not delay conversation)",
    accuracy: ">85% for stage, >75% for profile",
    caching: "Cache language and profile (don't re-analyze every turn)"
  }
}
```

### 3.2 Principle Decision Engine

```javascript
PRINCIPLE_ENGINE = {
  purpose: "Select which psychological principle to apply this turn",
  
  sixPrinciples: {
    RECIPROCITY: {
      when: "Give value first (e.g., free trial, consultation, info)",
      example: "Let me share a case study that might help you...",
      stages: ["AWARENESS", "CONSIDERATION"],
      profiles: ["ANALYTICAL", "RELATIONSHIP_SEEKER"]
    },
    
    COMMITMENT: {
      when: "Get small yes first, then bigger yes",
      example: "Would you like to see how this works for your case?",
      stages: ["CONSIDERATION", "DECISION"],
      profiles: ["DECISION_MAKER", "ANALYTICAL"]
    },
    
    SOCIAL_PROOF: {
      when: "Show others are doing it",
      example: "We've helped 500+ clients in your industry...",
      stages: ["AWARENESS", "CONSIDERATION"],
      profiles: ["SKEPTICAL", "ANALYTICAL"]
    },
    
    AUTHORITY: {
      when: "Establish expertise and credibility",
      example: "Based on our 15 years in this field...",
      stages: ["AWARENESS", "CONSIDERATION"],
      profiles: ["SKEPTICAL", "ANALYTICAL"]
    },
    
    LIKING: {
      when: "Build rapport and connection",
      example: "I completely understand your concern...",
      stages: ["AWARENESS", "CONSIDERATION", "DECISION"],
      profiles: ["EMOTIONAL", "RELATIONSHIP_SEEKER"]
    },
    
    SCARCITY: {
      when: "Create urgency (use carefully!)",
      example: "This offer is available until Friday...",
      stages: ["DECISION"],
      profiles: ["DECISION_MAKER"],
      caution: "Don't overuse - can backfire with SKEPTICAL profile"
    }
  },
  
  selectionLogic: {
    input: {
      stage: "From conversation analyzer",
      profile: "From conversation analyzer",
      objections: "From conversation analyzer",
      turnNumber: "1, 2, 3, etc."
    },
    
    algorithm: `
      1. Filter principles by stage (which principles work in this stage?)
      2. Filter by profile (which principles work for this personality?)
      3. If objection detected, prioritize principles that address it:
         - PRICE objection → Use RECIPROCITY or SOCIAL_PROOF
         - TRUST objection → Use AUTHORITY or SOCIAL_PROOF
         - TIMING objection → Use COMMITMENT or SCARCITY (carefully)
      4. Rotate principles (don't use same one twice in a row)
      5. Select best match
    `,
    
    output: {
      principle: "LIKING",
      confidence: 0.87,
      reasoning: "User is EMOTIONAL profile in CONSIDERATION stage"
    }
  },
  
  performance: {
    executionTime: "<50ms (rule-based, no API calls)",
    accuracy: ">80% appropriate principle selection"
  }
}
```

### 3.3 Hedge Engine V2 (Intelligent Filler System)

```javascript
HEDGE_ENGINE_V2 = {
  purpose: "Fill silence gaps (>400ms) with intelligent, context-aware audio",
  
  fillerMetadata: {
    storageLocation: "/storage/fillers/",
    indexFile: "filler_metadata.json",
    
    perFillerMetadata: {
      filename: "sales_filler_1_hi_en_liking_authority.pcm",
      duration: 3.96, // seconds
      format: "PCM 16-bit 16kHz mono",
      
      tags: {
        languages: ["Hinglish", "English"],
        principles: ["LIKING", "AUTHORITY"],
        profiles: ["EMOTIONAL", "DECISION_MAKER"],
        tone: "professional_warm",
        suitableFor: ["AWARENESS", "CONSIDERATION"]
      },
      
      effectiveness: {
        completionRate: 0.92,      // % of calls that don't hang up after this filler
        sentimentLift: 0.78,       // How much it improves user sentiment
        principleReinforcement: 0.85 // How well it supports the principle
      }
    }
  },
  
  selectionAlgorithm: {
    step1_LanguageFilter: {
      action: "Filter fillers by detected language",
      rule: "MUST match exactly (Marathi user → only Marathi/Hinglish fillers)",
      fallback: "If no match, use English fillers"
    },
    
    step2_PrincipleFilter: {
      action: "Filter by current principle",
      rule: "Filler must support current principle",
      example: "If principle=LIKING, use fillers tagged with LIKING"
    },
    
    step3_ProfileFilter: {
      action: "Filter by client profile",
      rule: "Prefer fillers suited for this profile",
      example: "ANALYTICAL → Use data-focused fillers"
    },
    
    step4_VarietyFilter: {
      action: "Avoid repetition",
      rule: "Don't use same filler twice in same call",
      tracking: "Maintain used_fillers[] array per call"
    },
    
    step5_SelectBest: {
      action: "Choose highest effectiveness score",
      tiebreaker: "Random among top 3"
    }
  },
  
  playbackLogic: {
    trigger: "Silence detected for 400ms",
    buffer: "Pre-load selected filler in memory",
    playback: "Stream to user audio channel",
    interruption: "If LLM responds mid-filler, continue filler to end (don't cut)",
    logging: "Log which filler was used (for analytics)"
  },
  
  performance: {
    selectionTime: "<100ms (indexed lookup, no computation)",
    playbackLatency: "<50ms (pre-loaded in memory)"
  }
}
```

---

## 🏗️ PART 4: SYSTEM ARCHITECTURE

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER (Phone Call)                         │
└────────────────────┬────────────────────────────────────────────┘
                     │
         ┌───────────▼────────────┐
         │  WebSocket Server      │
         │  (Real-time audio I/O) │
         └───────────┬────────────┘
                     │
         ┌───────────▼────────────────────────────────────────┐
         │         STATE MACHINE CONTROLLER                   │
         │  ┌──────┐ ┌──────────┐ ┌─────────┐ ┌────────┐    │
         │  │ IDLE │→│LISTENING │→│THINKING │→│SPEAKING│    │
         │  └──────┘ └──────────┘ └─────────┘ └────────┘    │
         │                   ↕           ↕                    │
         │              ┌─────────┐ ┌────────┐               │
         │              │RECOVERY │ │        │               │
         │              └─────────┘ └────────┘               │
         └────┬──────────────┬──────────────┬────────────────┘
              │              │              │
    ┌─────────▼───────┐ ┌───▼──────────┐ ┌▼────────────────┐
    │ Conversation    │ │  Principle   │ │ Hedge Engine V2 │
    │   Analyzer      │ │Decision Engine│ │ (Filler System) │
    │                 │ │              │ │                 │
    │ • Detect Stage  │ │ • Select     │ │ • Language      │
    │ • Detect Profile│ │   Principle  │ │   Filtering     │
    │ • Find Objections│ │ • Apply      │ │ • Principle     │
    │ • Detect Language│ │   Psychology │ │   Matching      │
    └─────────────────┘ └──────────────┘ └─────────────────┘
              │
    ┌─────────▼─────────────────────────────────────────────┐
    │             Gemini Live API (Multimodal)              │
    │  • Real-time audio streaming                          │
    │  • System prompt (built once at call start)           │
    │  • Native audio output (no TTS needed)                │
    └───────────────────────────────────────────────────────┘
              │
    ┌─────────▼─────────────────────────────────────────────┐
    │              Agent Configuration DB                    │
    │  • Agent Profile (name, role, personality)            │
    │  • Voice Settings (tone, speed, pitch)                │
    │  • Speech Settings (response length, question freq)   │
    │  • Knowledge Base (product info, FAQs)                │
    └───────────────────────────────────────────────────────┘
```

---

## 📊 PART 5: DATA FLOW (Per Turn)

### Complete Turn Sequence

```
USER SPEAKS (Turn Start)
    ↓
┌───────────────────────────────────────────────────────┐
│ STATE: LISTENING                                       │
│ • Collect audio stream (16-bit PCM @ 16kHz)           │
│ • Run VAD (Voice Activity Detection)                  │
│ • Detect silence > 500ms                              │
│ Duration: Variable (user talking time)                │
└───────────────────┬───────────────────────────────────┘
                    │ Silence >500ms detected
                    ↓
┌───────────────────────────────────────────────────────┐
│ STATE: THINKING                                        │
│                                                        │
│ [PARALLEL PROCESS 1: Conversation Analysis]           │
│ • Detect language (first 2-3s of audio)               │
│ • Analyze stage (AWARENESS/CONSIDERATION/DECISION)    │
│ • Detect profile (ANALYTICAL/EMOTIONAL/etc.)          │
│ • Find objections (PRICE/TRUST/TIMING/etc.)           │
│ • Calculate sentiment (0-1 scale)                     │
│ Duration: <100ms                                       │
│                                                        │
│ [PARALLEL PROCESS 2: Principle Selection]             │
│ • Input: stage, profile, objections, turn#            │
│ • Filter principles by stage                          │
│ • Filter by profile                                   │
│ • Address objections if present                       │
│ • Avoid repetition                                    │
│ • Output: Selected principle                          │
│ Duration: <50ms                                        │
│                                                        │
│ [PARALLEL PROCESS 3: Filler Preparation]              │
│ • Start 400ms silence timer                           │
│ • Filter fillers by language                          │
│ • Filter by principle                                 │
│ • Filter by profile                                   │
│ • Avoid recent fillers                                │
│ • Pre-load best filler to memory                      │
│ Duration: <100ms                                       │
│                                                        │
│ [MAIN PROCESS: LLM Request]                           │
│ • Build context (user message + history + profile)    │
│ • Send to Gemini Live with system prompt              │
│ • Enable streaming (receive first token ASAP)         │
│ • Set 3-second timeout                                │
│ Duration: 1200-2500ms (LLM thinking time)             │
│                                                        │
└────────┬───────────────────────┬─────────────────────┘
         │                       │
         │ First token           │ Timeout (3s)
         │ received              │
         ▼                       ▼
┌────────────────────┐   ┌───────────────────────────┐
│ STATE: SPEAKING    │   │ STATE: RECOVERY           │
│                    │   │                           │
│ • Stream audio     │   │ • Play pre-selected filler│
│ • Monitor for      │   │ • Retry LLM call          │
│   interruption     │   │ • If LLM responds, switch │
│ • Log turn data    │   │   to SPEAKING             │
│                    │   │ • If filler ends, go to   │
│ Duration: 3-8s     │   │   LISTENING               │
│ (response length)  │   │ Duration: 3-5s (filler)   │
└────────┬───────────┘   └────────┬──────────────────┘
         │                        │
         │ Audio complete         │
         │ OR                     │
         │ User interruption      │
         ▼                        ▼
┌───────────────────────────────────────────────────────┐
│ STATE: LISTENING (Next Turn)                          │
│ Ready for user's next message                         │
└───────────────────────────────────────────────────────┘
```

### Timing Breakdown (Target vs Reality)

| Stage | Target | Typical | Max Acceptable |
|-------|--------|---------|----------------|
| User speaks | Variable | 3-10s | 60s |
| VAD silence detection | <50ms | 30ms | 100ms |
| Conversation analysis | <100ms | 80ms | 200ms |
| Principle selection | <50ms | 30ms | 100ms |
| Filler preparation | <100ms | 70ms | 200ms |
| LLM thinking (Gemini) | 1200-2500ms | 1800ms | 3000ms |
| Audio encoding | <200ms | 150ms | 300ms |
| Filler playback (if triggered) | 3000-5000ms | 3960ms | 6000ms |
| **Total turn latency** | **<2000ms** | **1950ms** | **3500ms** |

**Critical Success Metric**: 95% of turns complete in <2500ms (user perception = instant)

---

## 🛠️ PART 6: IMPLEMENTATION GUIDE FOR CLAUDE CODE

### Phase 1: Core State Machine (Week 1)

```javascript
// FILE: src/stateMachine/VoiceAgentStateMachine.js

class VoiceAgentStateMachine {
  constructor(agentConfig) {
    this.currentState = "IDLE";
    this.agentConfig = agentConfig;
    this.conversationHistory = [];
    this.usedFillers = [];
    
    // Initialize subsystems
    this.conversationAnalyzer = new ConversationAnalyzer();
    this.principleEngine = new PrincipleDecisionEngine();
    this.hedgeEngine = new HedgeEngineV2();
    
    // Initialize Gemini Live
    this.geminiClient = new GeminiLiveClient(agentConfig);
  }
  
  // State: IDLE
  async initialize() {
    this.currentState = "IDLE";
    
    // Pre-warm Gemini session
    await this.geminiClient.connect();
    
    // Load filler metadata
    await this.hedgeEngine.loadFillerIndex();
    
    // Verify agent config
    this.validateConfig(this.agentConfig);
    
    console.log("✅ Agent initialized and ready");
  }
  
  // State: LISTENING
  async startListening() {
    this.currentState = "LISTENING";
    
    // Start VAD
    this.vadEngine = new VAD({
      silenceThreshold: 500, // ms
      energyThreshold: -40,  // dB
      onSilenceDetected: () => this.transition("THINKING")
    });
    
    // Start collecting audio
    this.audioBuffer = [];
    this.isCollectingAudio = true;
  }
  
  onAudioChunk(audioData) {
    if (this.currentState === "LISTENING") {
      this.audioBuffer.push(audioData);
      this.vadEngine.process(audioData);
    }
  }
  
  // State: THINKING
  async processUserInput() {
    this.currentState = "THINKING";
    
    // Get transcript from audio buffer
    const transcript = await this.transcribe(this.audioBuffer);
    
    // PARALLEL EXECUTION
    const [analysis, principle, selectedFiller] = await Promise.all([
      // Conversation analysis
      this.conversationAnalyzer.analyze({
        transcript,
        history: this.conversationHistory,
        agentProfile: this.agentConfig
      }),
      
      // Principle selection
      this.principleEngine.selectPrinciple({
        stage: analysis.stage,
        profile: analysis.profile,
        objections: analysis.objections,
        turnNumber: this.conversationHistory.length
      }),
      
      // Filler preparation
      this.hedgeEngine.selectFiller({
        language: analysis.language,
        principle: principle,
        profile: analysis.profile,
        usedFillers: this.usedFillers
      })
    ]);
    
    // Start 3-second timeout for LLM
    const llmTimeout = setTimeout(() => {
      if (this.currentState === "THINKING") {
        this.transition("RECOVERY", { filler: selectedFiller });
      }
    }, 3000);
    
    // Send to Gemini Live
    const llmResponse = await this.geminiClient.sendMessage({
      transcript,
      history: this.conversationHistory,
      principle: principle,
      streaming: true // CRITICAL
    });
    
    clearTimeout(llmTimeout);
    
    if (llmResponse) {
      this.transition("SPEAKING", { audio: llmResponse.audioStream });
    }
  }
  
  // State: SPEAKING
  async playResponse(audioStream) {
    this.currentState = "SPEAKING";
    
    // Start playing audio
    this.audioPlayer.play(audioStream);
    
    // Monitor for interruption
    this.userAudioMonitor.on("speech_detected", () => {
      this.audioPlayer.stop(); // Immediate stop
      this.transition("LISTENING");
    });
    
    // Wait for audio to finish
    await this.audioPlayer.waitForCompletion();
    
    // Transition to next turn
    this.transition("LISTENING");
  }
  
  // State: RECOVERY
  async handleRecovery(filler) {
    this.currentState = "RECOVERY";
    
    // Play filler
    this.audioPlayer.play(filler.audioData);
    
    // Retry LLM in background
    this.retryLLM();
    
    // Track filler usage
    this.usedFillers.push(filler.id);
    
    await this.audioPlayer.waitForCompletion();
    
    // Check if LLM responded during filler
    if (this.pendingLLMResponse) {
      this.transition("SPEAKING", { audio: this.pendingLLMResponse });
    } else {
      // No LLM response, ask user to continue
      this.transition("LISTENING");
    }
  }
  
  // State transitions
  transition(newState, data = {}) {
    console.log(`🔄 State: ${this.currentState} → ${newState}`);
    
    switch (newState) {
      case "LISTENING":
        this.startListening();
        break;
      case "THINKING":
        this.processUserInput();
        break;
      case "SPEAKING":
        this.playResponse(data.audio);
        break;
      case "RECOVERY":
        this.handleRecovery(data.filler);
        break;
      case "IDLE":
        this.cleanup();
        break;
    }
  }
}
```

### Phase 2: Conversation Analyzer (Week 1)

```javascript
// FILE: src/intelligence/ConversationAnalyzer.js

class ConversationAnalyzer {
  analyze({ transcript, history, agentProfile }) {
    return {
      stage: this.detectStage(transcript, history),
      profile: this.detectProfile(transcript, history),
      objections: this.detectObjections(transcript),
      language: this.detectLanguage(transcript),
      sentiment: this.analyzeSentiment(transcript)
    };
  }
  
  detectStage(transcript, history) {
    const turnCount = history.length;
    
    // Early conversation → AWARENESS
    if (turnCount < 3) return "AWARENESS";
    
    // Keywords for DECISION stage
    const decisionKeywords = ["buy", "purchase", "price", "when can", "sign up", "schedule"];
    if (decisionKeywords.some(kw => transcript.toLowerCase().includes(kw))) {
      return "DECISION";
    }
    
    // Keywords for CONSIDERATION stage
    const considerationKeywords = ["compare", "difference", "how does", "features", "benefits"];
    if (considerationKeywords.some(kw => transcript.toLowerCase().includes(kw))) {
      return "CONSIDERATION";
    }
    
    // Default
    return turnCount < 5 ? "AWARENESS" : "CONSIDERATION";
  }
  
  detectProfile(transcript, history) {
    const text = transcript.toLowerCase();
    
    // ANALYTICAL: Asks for data, numbers
    if (/how many|what percentage|data|statistics|prove/.test(text)) {
      return "ANALYTICAL";
    }
    
    // SKEPTICAL: Questions everything
    if (/really|sure|guarantee|scam|trust/.test(text)) {
      return "SKEPTICAL";
    }
    
    // DECISION_MAKER: Direct, action-oriented
    if (/let's do|when can|schedule|sign me up/.test(text)) {
      return "DECISION_MAKER";
    }
    
    // EMOTIONAL: Talks about feelings
    if (/feel|love|hate|worried|excited/.test(text)) {
      return "EMOTIONAL";
    }
    
    // Default
    return "RELATIONSHIP_SEEKER";
  }
  
  detectObjections(transcript) {
    const text = transcript.toLowerCase();
    const objections = [];
    
    if (/expensive|cost|price|afford|budget/.test(text)) {
      objections.push("PRICE");
    }
    
    if (/trust|scam|legitimate|guarantee/.test(text)) {
      objections.push("TRUST");
    }
    
    if (/later|not now|thinking|busy/.test(text)) {
      objections.push("TIMING");
    }
    
    if (/don't need|have one|satisfied/.test(text)) {
      objections.push("NEED");
    }
    
    if (/quality|reliable|reviews|worth/.test(text)) {
      objections.push("QUALITY");
    }
    
    return objections;
  }
  
  detectLanguage(transcript) {
    // Simple language detection (can be improved with external library)
    const marathiPattern = /आहे|होतो|करतो|पण|मला/;
    const hindiPattern = /है|हो|करता|पर|मुझे/;
    
    if (marathiPattern.test(transcript)) return "Marathi";
    if (hindiPattern.test(transcript)) return "Hindi";
    
    // Check for Hinglish (mix of English + Hindi/Marathi)
    if (/\b(hai|nahi|kya|acha|theek)\b/.test(transcript.toLowerCase())) {
      return "Hinglish";
    }
    
    return "English";
  }
  
  analyzeSentiment(transcript) {
    // Simple sentiment (can use ML model for better accuracy)
    const positiveWords = ["good", "great", "excellent", "love", "yes", "sure"];
    const negativeWords = ["bad", "hate", "no", "never", "terrible"];
    
    const text = transcript.toLowerCase();
    let score = 0.5; // Neutral
    
    positiveWords.forEach(word => {
      if (text.includes(word)) score += 0.1;
    });
    
    negativeWords.forEach(word => {
      if (text.includes(word)) score -= 0.1;
    });
    
    return Math.max(0, Math.min(1, score)); // Clamp between 0-1
  }
}
```

### Phase 3: Principle Decision Engine (Week 1)

```javascript
// FILE: src/intelligence/PrincipleDecisionEngine.js

class PrincipleDecisionEngine {
  constructor() {
    this.principles = {
      RECIPROCITY: {
        stages: ["AWARENESS", "CONSIDERATION"],
        profiles: ["ANALYTICAL", "RELATIONSHIP_SEEKER"],
        addressesObjections: ["PRICE", "NEED"]
      },
      COMMITMENT: {
        stages: ["CONSIDERATION", "DECISION"],
        profiles: ["DECISION_MAKER", "ANALYTICAL"],
        addressesObjections: ["TIMING"]
      },
      SOCIAL_PROOF: {
        stages: ["AWARENESS", "CONSIDERATION"],
        profiles: ["SKEPTICAL", "ANALYTICAL"],
        addressesObjections: ["TRUST", "QUALITY"]
      },
      AUTHORITY: {
        stages: ["AWARENESS", "CONSIDERATION"],
        profiles: ["SKEPTICAL", "ANALYTICAL"],
        addressesObjections: ["TRUST", "QUALITY"]
      },
      LIKING: {
        stages: ["AWARENESS", "CONSIDERATION", "DECISION"],
        profiles: ["EMOTIONAL", "RELATIONSHIP_SEEKER"],
        addressesObjections: ["TRUST"]
      },
      SCARCITY: {
        stages: ["DECISION"],
        profiles: ["DECISION_MAKER"],
        addressesObjections: ["TIMING"],
        caution: true // Use sparingly
      }
    };
    
    this.recentlyUsed = [];
  }
  
  selectPrinciple({ stage, profile, objections, turnNumber }) {
    // Filter principles by stage
    let candidates = Object.keys(this.principles).filter(p => 
      this.principles[p].stages.includes(stage)
    );
    
    // Filter by profile
    candidates = candidates.filter(p =>
      this.principles[p].profiles.includes(profile)
    );
    
    // Prioritize if objection present
    if (objections.length > 0) {
      const objectionAddressing = candidates.filter(p =>
        objections.some(obj => this.principles[p].addressesObjections.includes(obj))
      );
      
      if (objectionAddressing.length > 0) {
        candidates = objectionAddressing;
      }
    }
    
    // Avoid repetition (don't use same principle twice in a row)
    candidates = candidates.filter(p => 
      !this.recentlyUsed.includes(p)
    );
    
    // If no candidates left, reset
    if (candidates.length === 0) {
      this.recentlyUsed = [];
      candidates = Object.keys(this.principles);
    }
    
    // Select best (can add scoring logic here)
    const selected = candidates[0];
    
    // Track usage
    this.recentlyUsed.push(selected);
    if (this.recentlyUsed.length > 2) {
      this.recentlyUsed.shift(); // Keep only last 2
    }
    
    return selected;
  }
}
```

### Phase 4: Hedge Engine V2 (Week 2)

```javascript
// FILE: src/intelligence/HedgeEngineV2.js

class HedgeEngineV2 {
  constructor() {
    this.fillers = [];
    this.fillerIndex = {}; // Indexed by language, principle, profile
  }
  
  async loadFillerIndex() {
    // Load filler metadata from JSON file
    const metadata = await fs.readFile("./storage/fillers/filler_metadata.json");
    this.fillers = JSON.parse(metadata);
    
    // Build index for fast lookup
    this.buildIndex();
    
    console.log(`✅ Loaded ${this.fillers.length} fillers`);
  }
  
  buildIndex() {
    this.fillers.forEach(filler => {
      filler.metadata.languages.forEach(lang => {
        if (!this.fillerIndex[lang]) this.fillerIndex[lang] = [];
        this.fillerIndex[lang].push(filler);
      });
    });
  }
  
  selectFiller({ language, principle, profile, usedFillers }) {
    // Step 1: Filter by language
    let candidates = this.fillerIndex[language] || this.fillerIndex["English"];
    
    // Step 2: Filter by principle
    candidates = candidates.filter(f =>
      f.metadata.principles.includes(principle)
    );
    
    // Step 3: Filter by profile (soft filter)
    const profileMatches = candidates.filter(f =>
      f.metadata.clientProfiles.includes(profile)
    );
    
    if (profileMatches.length > 0) {
      candidates = profileMatches;
    }
    
    // Step 4: Avoid recently used
    candidates = candidates.filter(f =>
      !usedFillers.includes(f.filename)
    );
    
    if (candidates.length === 0) {
      // If no candidates, relax filters
      candidates = this.fillerIndex[language] || this.fillerIndex["English"];
    }
    
    // Step 5: Select best (by effectiveness score)
    candidates.sort((a, b) => 
      b.metadata.effectiveness.completionRate - a.metadata.effectiveness.completionRate
    );
    
    return candidates[0];
  }
  
  async loadFillerAudio(filler) {
    // Load PCM audio file into memory
    const audioPath = `./storage/fillers/${filler.filename}`;
    const audioData = await fs.readFile(audioPath);
    
    return {
      id: filler.filename,
      audioData: audioData,
      duration: filler.duration
    };
  }
}
```

---

## 📦 PART 7: DATABASE SCHEMAS

### Agent Configuration Schema

```javascript
// MongoDB Schema
const AgentSchema = new Schema({
  // Profile
  agentName: { type: String, required: true },
  agentRole: { type: String, enum: ["Sales", "Support", "Lead Qualification"] },
  agentPersonality: String,
  primaryLanguage: { type: String, enum: ["English", "Marathi", "Hindi", "Hinglish"] },
  targetAudience: String,
  industryContext: String,
  
  // Role
  primaryObjective: { type: String, enum: ["Close Sale", "Qualify Lead", "Schedule Meeting"] },
  conversationStyle: { type: String, enum: ["Consultative", "Direct", "Warm"] },
  callDuration: { type: Number, default: 15 }, // minutes
  
  // Voice Settings
  voiceProvider: { type: String, default: "Gemini Live" },
  voiceCharacteristics: {
    tone: String,
    emotionLevel: { type: Number, min: 0, max: 1 },
    pitch: { type: Number, min: 0.75, max: 1.25 },
    speed: { type: Number, min: 0.75, max: 1.25 },
    pauseDuration: Number // ms
  },
  
  // Speech Settings
  interruptionSensitivity: { type: String, enum: ["High", "Medium", "Low"] },
  thinkingPauseDuration: Number, // ms
  responseLength: { type: String, enum: ["Short", "Medium", "Long"] },
  questionAsking: Number, // 0-100%
  
  // Background
  ambiance: { type: String, enum: ["None", "Light Office", "Call Center"] },
  
  // Knowledge Base
  knowledgeBase: [{
    name: String,
    content: String,
    uploadedAt: Date
  }],
  
  // Metadata
  userId: { type: Schema.Types.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: Date
});
```

### Call Record Schema

```javascript
const CallSchema = new Schema({
  agentId: { type: Schema.Types.ObjectId, ref: "Agent" },
  userId: { type: Schema.Types.ObjectId, ref: "User" },
  
  // Call Info
  phoneNumber: String,
  direction: { type: String, enum: ["Inbound", "Outbound"] },
  startTime: Date,
  endTime: Date,
  duration: Number, // seconds
  status: { type: String, enum: ["Completed", "Missed", "Failed"] },
  
  // Conversation Data
  turns: [{
    turnNumber: Number,
    userMessage: String,
    agentResponse: String,
    stage: String, // AWARENESS, CONSIDERATION, DECISION
    profile: String, // ANALYTICAL, EMOTIONAL, etc.
    principle: String, // LIKING, AUTHORITY, etc.
    fillerUsed: String,
    timestamp: Date
  }],
  
  // Analytics
  detectedLanguage: String,
  overallSentiment: Number, // 0-1
  objectionsRaised: [String],
  outcome: { type: String, enum: ["Sale Closed", "Meeting Scheduled", "Follow-up Required", "No Interest"] },
  
  // Metadata
  recordingUrl: String,
  transcriptUrl: String,
  createdAt: { type: Date, default: Date.now }
});
```

---

## 🧪 PART 8: TESTING STRATEGY

### Unit Tests

```javascript
// TEST: Conversation Analyzer
describe("ConversationAnalyzer", () => {
  test("Detects AWARENESS stage in first 3 turns", () => {
    const analyzer = new ConversationAnalyzer();
    const result = analyzer.detectStage("Hello, tell me about your product", []);
    expect(result).toBe("AWARENESS");
  });
  
  test("Detects ANALYTICAL profile from data questions", () => {
    const analyzer = new ConversationAnalyzer();
    const result = analyzer.detectProfile("What's the ROI? How many users?", []);
    expect(result).toBe("ANALYTICAL");
  });
  
  test("Detects PRICE objection from keywords", () => {
    const analyzer = new ConversationAnalyzer();
    const result = analyzer.detectObjections("That's too expensive for me");
    expect(result).toContain("PRICE");
  });
});

// TEST: Principle Engine
describe("PrincipleDecisionEngine", () => {
  test("Selects AUTHORITY for SKEPTICAL profile in AWARENESS stage", () => {
    const engine = new PrincipleDecisionEngine();
    const result = engine.selectPrinciple({
      stage: "AWARENESS",
      profile: "SKEPTICAL",
      objections: ["TRUST"],
      turnNumber: 2
    });
    expect(["AUTHORITY", "SOCIAL_PROOF"]).toContain(result);
  });
});

// TEST: Hedge Engine
describe("HedgeEngineV2", () => {
  test("Filters fillers by language correctly", () => {
    const engine = new HedgeEngineV2();
    engine.loadFillerIndex();
    
    const filler = engine.selectFiller({
      language: "Marathi",
      principle: "LIKING",
      profile: "EMOTIONAL",
      usedFillers: []
    });
    
    expect(filler.metadata.languages).toContain("Marathi");
  });
});
```

### Integration Tests

```javascript
describe("State Machine Integration", () => {
  test("Full turn cycle: LISTENING → THINKING → SPEAKING → LISTENING", async () => {
    const agent = new VoiceAgentStateMachine(mockAgentConfig);
    await agent.initialize();
    
    // Simulate user speech
    agent.startListening();
    agent.onAudioChunk(mockAudioData);
    
    // Wait for VAD to trigger
    await delay(600); // >500ms silence
    
    expect(agent.currentState).toBe("THINKING");
    
    // Wait for LLM response
    await delay(2000);
    
    expect(agent.currentState).toBe("SPEAKING");
  });
});
```

---

## 📊 PART 9: MONITORING & METRICS

### Key Metrics to Track

```javascript
const METRICS = {
  // Performance Metrics
  averageTurnLatency: "Target <2000ms",
  llmResponseTime: "Target <1500ms",
  fillerTriggerRate: "% of turns where filler plays",
  
  // Quality Metrics
  conversationCompletionRate: "% of calls that complete successfully",
  averageCallDuration: "Target 5-15 minutes",
  sentimentImprovement: "Change in sentiment from start to end",
  
  // Intelligence Metrics
  principleAccuracy: "% of correctly selected principles",
  profileDetectionAccuracy: "% of correct profile classifications",
  languageMatchRate: "% of fillers matching detected language",
  
  // Business Metrics
  conversionRate: "% of calls resulting in sale/meeting",
  objectionResolutionRate: "% of objections successfully handled",
  customerSatisfactionScore: "Post-call survey ratings"
};
```

### Logging Strategy

```javascript
// Log every state transition
console.log({
  timestamp: new Date(),
  callId: call.id,
  event: "STATE_TRANSITION",
  from: "LISTENING",
  to: "THINKING",
  metadata: {
    turnNumber: 3,
    latency: "45ms"
  }
});

// Log every principle selection
console.log({
  timestamp: new Date(),
  callId: call.id,
  event: "PRINCIPLE_SELECTED",
  principle: "LIKING",
  reasoning: {
    stage: "AWARENESS",
    profile: "EMOTIONAL",
    confidence: 0.87
  }
});

// Log every filler usage
console.log({
  timestamp: new Date(),
  callId: call.id,
  event: "FILLER_PLAYED",
  filler: "sales_filler_1_hi_en_liking_authority.pcm",
  metadata: {
    language: "Hinglish",
    principle: "LIKING",
    duration: 3.96
  }
});
```

---

## 🚀 PART 10: DEPLOYMENT CHECKLIST

### Pre-Deployment Verification

- [ ] All filler files uploaded to storage with correct metadata
- [ ] Filler metadata JSON indexed and validated
- [ ] Agent configuration in database
- [ ] System prompt template created
- [ ] Gemini Live API credentials configured
- [ ] WebSocket server configured for real-time audio
- [ ] VAD engine tested and calibrated
- [ ] State machine tested with 10+ test calls
- [ ] Conversation analyzer accuracy >80%
- [ ] Principle engine validated
- [ ] Hedge Engine V2 filler selection working
- [ ] Interruption handling tested (<50ms response)
- [ ] Error recovery tested (LLM timeout scenarios)
- [ ] Logging and monitoring dashboards configured
- [ ] Load testing completed (10+ concurrent calls)

---

## ✅ CRITICAL SUCCESS FACTORS (Summary)

### Must Have (Non-Negotiable)
1. ✅ **State Machine**: All 5 states implemented correctly
2. ✅ **Interruption Handling**: <50ms response to user interruption
3. ✅ **Intelligent Fillers**: Language + Principle + Profile matching
4. ✅ **Real-Time Analysis**: Stage, profile, objections detected per turn
5. ✅ **Principle Selection**: Psychology-based, context-aware
6. ✅ **No Gaps**: Fillers mask all silence >400ms
7. ✅ **Single System Prompt**: Built once, never updated mid-call
8. ✅ **Streaming Audio**: First token plays ASAP

### Must NOT Have (Deal Breakers)
1. ❌ **Random Fillers**: Destroys conversation quality
2. ❌ **Welcome Message Delay**: Creates 6+ second latency
3. ❌ **Language Mismatches**: French filler in Marathi conversation
4. ❌ **Silent Gaps**: >400ms without filler = unnatural
5. ❌ **Mid-Call Prompt Updates**: Causes 5-7s disruption
6. ❌ **Blocking Audio**: Wait for full response before playing

---

## 🎯 FINAL INSTRUCTION FOR CLAUDE CODE

```
TASK: Implement Voice AI Sales Agent with Real-Time State Machine

ARCHITECTURE:
- 5 States: IDLE, LISTENING, THINKING, SPEAKING, RECOVERY
- 3 Intelligence Engines: Conversation Analyzer, Principle Engine, Hedge Engine V2
- 1 LLM: Gemini Live (multimodal audio streaming)
- Real-time WebSocket audio I/O

CRITICAL REQUIREMENTS:
1. Interruption handling: <50ms response time
2. Turn latency: <2000ms average
3. Intelligent filler selection: Language + Principle + Profile aware
4. No silent gaps: Mask all silence >400ms
5. System prompt: Build once at call start (never update)
6. Streaming audio: Play first token ASAP

PHASES:
Week 1: Core state machine + Conversation analyzer + Principle engine
Week 2: Hedge Engine V2 + Filler system + Testing
Week 3: Integration + Load testing + Deployment

FILES TO CREATE:
- VoiceAgentStateMachine.js (core state machine)
- ConversationAnalyzer.js (intelligence layer)
- PrincipleDecisionEngine.js (psychology layer)
- HedgeEngineV2.js (filler system)
- AgentConfig.schema.js (database)
- CallRecord.schema.js (database)

TESTING:
- Unit tests for each component
- Integration tests for full turn cycle
- End-to-end test with 10-turn conversation
- Load test with 10+ concurrent calls

SUCCESS CRITERIA:
- 95% of turns complete in <2500ms
- 0% language mismatches in fillers
- 0% silent gaps >400ms
- >85% conversation completion rate
```

---

**Document Version**: 2.0  
**Status**: ✅ Production-Ready Blueprint  
**Ready For**: Claude Code Implementation  
**Estimated Development Time**: 3 weeks  
**Confidence Level**: 100%

---

*This blueprint is a complete, actionable guide for building a SMART, SELF-DECISIVE, SELF-LEARNING Voice AI Sales Agent that thinks, speaks, and persuades like a human expert.*
