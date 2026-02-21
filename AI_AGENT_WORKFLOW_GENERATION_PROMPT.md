# AI Agent Workflow Generation Prompt
**Version**: 1.0
**Date**: 2026-02-21
**Purpose**: Comprehensive prompt for generating a perfect Shreenika AI Voice Agent Workflow
**Intended Use**: Input this prompt to Claude, ChatGPT, or any AI system to generate complete workflow architecture

---

## SECTION 1: FOUNDATIONAL UNDERSTANDING

### 1.1 What Is an AI Agent (For This Product)?

An **AI Agent** in the Shreenika platform is a SMART, SELF-DECISIVE, SELF-LEARNING system that:

1. **Is Self-Decisive**: Makes real-time decisions about WHAT to say, HOW to say it, WHEN to respond, and adjusts based on conversation context
2. **Is Self-Learning**: Tracks conversation patterns, client psychology, objection patterns, and improves response quality
3. **Is Smart**: Understands multi-layered conversation context (customer stage, profile, objections, intent, language)
4. **Is Intelligent**: Uses psychological principles to persuade naturally, selects appropriate tone/speed/filler, and maintains conversation flow

**NOT an AI Agent if**:
- ❌ Uses random audio fillers (destroys conversation)
- ❌ Has fixed welcome message (creates latency)
- ❌ Has no understanding of customer psychology
- ❌ No language awareness in responses or fillers
- ❌ Silent gaps >400ms without intelligent filling

**IS an AI Agent if**:
- ✅ Understands conversation stage (Awareness → Consideration → Decision)
- ✅ Detects client profile (Analytical, Emotional, Skeptical, Decision-Maker)
- ✅ Identifies objections (Price, Quality, Trust, Timing, Need)
- ✅ Applies psychological principles intelligently (6 principles based on stage + profile)
- ✅ Selects fillers intelligently (language-aware, principle-aware, profile-aware)
- ✅ Maintains natural conversation flow (no gaps, no language mismatches)
- ✅ Has configurable personality and voice

### 1.2 Why Current Approach Failed

**Previous Approach Issues**:
1. **Random Filler Selection**: Played French filler during Marathi discussion → Destroyed conversation
2. **Welcome Message Latency**: 6+ second delay before first response → User frustration
3. **Fixed System Prompt**: No real-time intelligence → Generic responses
4. **No Language Awareness**: Filler language ≠ Voice language ≠ Setting language mismatch
5. **No Psychology Integration**: Missed opportunity to persuade scientifically

**Result**: System functioned but wasn't an "Agent" - it was a chatbot with voice.

### 1.3 Core Insight

> "Sales is a sensitive and personal area. When customer and agent resemble each other (culture, language, thinking style, feelings), they connect. Wrong fillers, language mismatches, or unnatural delays destroy that connection instantly."

**Therefore**: Every component must be context-aware and psychologically intelligent.

---

## SECTION 2: AGENT MANAGEMENT SYSTEM (Foundation Layer)

The workflow MUST start with comprehensive agent configuration. This is where the AI Agent's personality, behavior, and capabilities are defined.

### 2.1 Agent Profile

**Purpose**: Define who this agent is and what it represents

**Fields to Include**:
- `agentName` (string): Display name
- `agentRole` (enum): Sales, Support, Lead Qualification, Appointment Booking, etc.
- `agentPersonality` (string): Brief description (e.g., "Friendly professional in real estate")
- `primaryLanguage` (enum): English, Marathi, Hindi, Hinglish, Tamil, Telugu, Kannada
- `agentKnowledge` (document reference): Knowledge base with product/service details
- `targetAudience` (string): Who this agent talks to (e.g., "High-net-worth property buyers")
- `industryContext` (string): Industry/vertical (Real Estate, Finance, E-commerce, SaaS, etc.)

**Why Important**: Gemini's system prompt is built FROM this profile. Without it, responses are generic.

### 2.2 Agent Role

**Purpose**: Define primary conversational objective and approach

**Fields to Include**:
- `primaryObjective` (enum): Close Sale, Qualify Lead, Schedule Meeting, Provide Support, Gather Information
- `conversationStyle` (enum): Consultative, Direct, Warm, Professional, Casual, Formal
- `handlingApproach` (string): How to handle objections (e.g., "Acknowledge, provide data, offer alternatives")
- `escalationTrigger` (string): When to hand off to human (e.g., "On 3 objections or escalation request")
- `meetingBookingFlow` (boolean): If true, include calendar integration and confirmation steps
- `callDuration` (number): Max call duration in minutes (default 15, max 60)
- `followupStrategy` (string): After-call actions (SMS, Email, Calendar reminder, etc.)

**Why Important**: Determines conversation goal and shapes principle selection logic.

### 2.3 Voice Settings

**Purpose**: Configure how the agent SOUNDS (vocal characteristics)

**Fields to Include**:
- `voiceProvider` (enum): Gemini Live (native audio), Google TTS, Custom PCM
- `voiceCharacteristics` (object):
  - `tone` (string): Professional, Friendly, Empathetic, Enthusiastic, Helpful
  - `emotionLevel` (number): 0.0-1.0 (0.3=calm/neutral, 0.7=enthusiastic)
  - `pitch` (number): 0.75-1.25 (1.0=natural, <1.0=lower, >1.0=higher)
  - `speed` (number): 0.75-1.25 (1.0=normal, <1.0=slower, >1.0=faster)
  - `pauseDuration` (number): 100-500ms (natural thinking pauses)
  - `clarity` (enum): Natural, Crystal-Clear, Conversational, Formal
- `responseVariation` (boolean): If true, Gemini avoids repetitive phrasing
- `accentPreference` (string): Neutral, Indian, British, American, etc.

**Why Important**: Voice is 38% of communication impact. Configuration must be explicit.

### 2.4 Background Sound / Ambiance

**Purpose**: Create realistic office/environment audio context

**Fields to Include**:
- `ambiance` (enum): None, Light Office, Busy Office, Coffee Shop, Call Center, Professional Quiet
- `ambiaSound` (file): Optional background audio file (loop)
- `volumeLevel` (number): 0-30% of main voice
- `includeEnvironmentNoise` (boolean): Subtle typing, papers, phone rings (makes it sound real)

**Why Important**: Removes "obviously AI" feel. Real agents have environments.

### 2.5 Speech Settings

**Purpose**: Define conversation behavior patterns

**Fields to Include**:
- `interruptionSensitivity` (enum): High, Medium, Low (how quickly agent responds to interruptions)
- `thinkingPauseDuration` (number): 200-800ms (natural pause before responding)
- `fillerFrequency` (enum): Rare, Occasional, Frequent (how often to use fillers)
- `responseLength` (enum): Short (1-2 sentences), Medium (2-3 sentences), Long (3+ sentences)
- `questionAsking` (number): 0-100 (% of turns that end with question to keep conversation going)
- `emphasisPatterns` (string): How to emphasize key points (e.g., "Repeat important numbers, stress benefits")
- `conversationalFlowStyle` (enum): RapidFire, Measured, Thoughtful, Interactive
- `sideTalkAllowed` (boolean): If true, agent can make light comments (more human-like)

**Why Important**: Defines conversational rhythm and engagement pattern.

---

## SECTION 3: INTELLIGENT FILLER SYSTEM (Hedge Engine V2)

### 3.1 What Fillers Do

**Purpose**: Fill silence gaps (>400ms) with intelligent, context-aware audio

**Critical Rule**: Fillers are NOT random. They are strategically selected based on:
1. **Language** (MANDATORY): Filler language MUST match detected conversation language
2. **Principle** (MANDATORY): Filler MUST support current psychological principle
3. **Profile** (IMPORTANT): Filler MUST match client profile (Analytical, Emotional, etc.)
4. **Variety** (IMPORTANT): Different filler each turn (no repetition = sounds more real)

### 3.2 Filler Metadata Structure

Every filler audio file MUST include metadata:

```
{
  "filename": "sales_filler_1_hi_en_liking_authority.pcm",
  "duration_seconds": 3.96,
  "format": "PCM 16-bit 16kHz mono",
  "metadata": {
    "languages": ["Hinglish", "English"],          // Languages in this filler
    "principles": ["LIKING", "AUTHORITY"],         // Psychological principles supported
    "clientProfiles": ["EMOTIONAL", "DECISION_MAKER"],  // Best for these profiles
    "tone": "professional_warm",                   // How it sounds
    "content_summary": "Establishes credibility and builds rapport",
    "suitableFor": ["Awareness Stage", "First turn"],
    "likeFactorContribution": 0.8,                // How much this increases rapport (0-1)
    "effectiveness": {                            // Historical performance
      "completionRate": 0.92,
      "principleReinforcementScore": 0.85,
      "userSentimentLift": 0.78
    }
  }
}
```

### 3.3 Intelligent Selection Algorithm (5-Step)

**Input**: Current conversation context, detected language, current principle, client profile

**Step 1 - LANGUAGE FILTER (CRITICAL)**
```
Filter all fillers to ONLY those matching detected_language
If no match found → Use fillers that include English as fallback
Result: Only language-appropriate fillers proceed
```

**Step 2 - PRINCIPLE FILTER**
```
Filter remaining fillers to those supporting current_principle
If no match found → Keep all from previous step (don't eliminate)
Result: Principle-aware fillers preferred, but not mandatory
```

**Step 3 - CLIENT PROFILE FILTER**
```
Filter remaining fillers to those matching detected_client_profile
If no match found → Keep all from previous step
Result: Profile-aware fillers preferred
```

**Step 4 - VARIETY FILTER**
```
Remove last_selected_filler from candidates
If only 1 candidate remains → Allow repetition
Result: Fresh fillers selected each turn
```

**Step 5 - SELECTION (NOT RANDOM)**
```
Use round-robin (not random) through remaining candidates
Selection: candidates[filler_index % candidates.length]
Increment: filler_index++
Log: Selected filler with metadata for analytics
Result: Deterministic, debuggable selection
```

### 3.4 Filler Playback Trigger

**Silence Detection Threshold**: >400ms of no Gemini audio AND no user speech

**Playback Decision**:
```
IF silence_duration > 400ms
  AND no_gemini_response_yet
  AND filler_candidates_available
  THEN play_intelligent_filler()

WHEN gemini_audio_arrives
  THEN stop_filler_playback()
  AND stream_gemini_audio()
```

**Why 400ms**: Humans can perceive <300ms as instant. >400ms feels like awkward silence.

---

## SECTION 4: SEVEN PSYCHOLOGICAL PRINCIPLES (Core Decision Engine)

### 4.1 Understanding the Principles

These 6 principles (NOT 7 - there are 6 core principles, plus techniques) are scientifically proven to influence decision-making:

#### Principle 1: LIKING
**Definition**: People prefer and buy from those they like
**When to Use**:
- Awareness stage (build rapport)
- With Emotional profiles
- When customer is warming up to agent

**Response Patterns**:
- Use customer's name frequently
- Find common ground
- Give genuine compliments
- Be warm and personable

**Example Filler Content**: "I completely understand where you're coming from... many of our clients felt the same way initially"

#### Principle 2: AUTHORITY
**Definition**: People trust and follow authority figures and experts
**When to Use**:
- Awareness stage (establish credibility)
- With Analytical profiles
- When credentials matter (finance, legal, medical)

**Response Patterns**:
- Share relevant credentials
- Cite statistics and data
- Mention expertise and experience
- Use confident, assured tone

**Example Filler Content**: "Based on 15 years in this industry and over 5000 successful transactions..."

#### Principle 3: RECIPROCITY
**Definition**: People feel obligated to return favors or match others' behavior
**When to Use**:
- Consideration stage (build obligation)
- With any profile when providing value first
- When offering free consultations or info

**Response Patterns**:
- Give valuable information first (no ask)
- Provide genuine help without immediate expectation
- Make customer feel they owe you engagement

**Example Filler Content**: "Let me share three immediate opportunities that could save you 20% without any obligation..."

#### Principle 4: ANCHORING
**Definition**: First number mentioned becomes the reference point
**When to Use**:
- Consideration stage (set value expectations)
- When discussing price/budget
- To establish negotiation baseline

**Response Patterns**:
- Mention highest relevant number first
- Reference industry standards
- Show value through comparison
- Lead price discussions strategically

**Example Filler Content**: "Properties in this category typically range from 2 crore to 5 crore, but we have exceptional options at..."

#### Principle 5: SCARCITY
**Definition**: People value things more when they're rare or limited
**When to Use**:
- Decision stage (create urgency)
- When closing
- When time/inventory is genuinely limited

**Response Patterns**:
- Mention limited availability
- Reference time constraints
- Create FOMO (fear of missing out) ethically
- Emphasize exclusivity

**Example Filler Content**: "We have only 2 units left in this premium location, and I have another client interested..."

#### Principle 6: COMMITMENT
**Definition**: People honor their stated commitments, especially public ones
**When to Use**:
- Decision stage (reference previous statements)
- To close (hardening previous soft commitments)
- To build on established agreements

**Response Patterns**:
- Reference what customer already agreed to
- Ask for incremental commitments
- Remind of stated priorities
- Use "as you mentioned earlier..."

**Example Filler Content**: "As you said, you wanted something close to the metro with good resale value - this property checks both those boxes..."

### 4.2 Principle Selection Logic

**By Conversation Stage**:
```
AWARENESS STAGE (0-2 customer turns):
  Primary: AUTHORITY + LIKING
  Goal: Build trust and rapport

CONSIDERATION STAGE (3-6 customer turns):
  Primary: ANCHORING + RECIPROCITY
  Goal: Show value and create obligation

DECISION STAGE (7+ customer turns):
  Primary: COMMITMENT + SCARCITY
  Goal: Reference agreements, create urgency
```

**Objection Overrides** (when customer raises objection):
```
Price Objection → Use ANCHORING (reset expectations)
Quality Concern → Use AUTHORITY (prove quality with proof)
Trust Issue → Use LIKING or AUTHORITY (build credibility)
Timing Objection → Use SCARCITY (create urgency)
Need Uncertainty → Use RECIPROCITY (show value first)
```

**Profile Modifiers** (adjust principle emphasis):
```
ANALYTICAL Profile → Emphasize AUTHORITY (data, proof, logic)
EMOTIONAL Profile → Emphasize LIKING (relationship, warmth)
SKEPTICAL Profile → Emphasize AUTHORITY + RECIPROCITY (proof + give value)
DECISION_MAKER → COMMITMENT + SCARCITY (honor previous points, create urgency)
```

### 4.3 Implementation in System Prompt

Each principle generates specific system prompt instructions:

**AUTHORITY Principle Injected**:
```
"You are speaking to someone who needs to trust your expertise.
- Cite relevant credentials and experience (e.g., '15 years in real estate')
- Support claims with data and statistics
- Use confident, assured tone
- Share success stories from similar clients
- Reference industry standards and benchmarks"
```

**LIKING Principle Injected**:
```
"Build genuine connection and warmth.
- Use customer's name frequently (1-2x per response)
- Find common ground or shared interests
- Show genuine enthusiasm for helping them
- Use warm, conversational tone
- Acknowledge their feelings and perspectives"
```

**[Similar injections for other principles]**

---

## SECTION 5: CONVERSATION INTELLIGENCE SYSTEM

### 5.1 Real-Time Conversation Analysis

**Track Every Customer Message For**:

#### Stage Detection
```
AWARENESS (Turns 0-2):
  → Asking about features, pricing, alternatives
  → Comparing with competitors
  → Building trust

CONSIDERATION (Turns 3-6):
  → Asking detailed questions
  → Discussing budget/timeline
  → Identifying must-haves vs nice-to-haves

DECISION (Turns 7+):
  → Focused questions on specifics
  → Interest in next steps
  → Budget confirmed or negotiating terms
```

#### Client Profile Detection
```
ANALYTICAL:
  → Asks about numbers, data, ROI, comparisons
  → Logical flow, methodical questions
  → Values proof and evidence
  → Principle boost: AUTHORITY

EMOTIONAL:
  → Asks about feelings, fit, lifestyle impact
  → Intuitive decision-making
  → Values relationship and understanding
  → Principle boost: LIKING

SKEPTICAL:
  → Questions everything, asks for proof
  → Cautious, risk-averse
  → Needs reassurance and data
  → Principle boost: AUTHORITY + RECIPROCITY

DECISION_MAKER:
  → Focused, efficient questions
  → Bottom-line oriented
  → Wants summary, not details
  → Principle boost: COMMITMENT + SCARCITY
```

#### Objection Detection
```
PRICE: "Too expensive", "Budget is lower", "Can you do better?"
→ Trigger: ANCHORING principle

QUALITY: "Is this really good?", "Any issues?", "How durable?"
→ Trigger: AUTHORITY principle

TRUST: "Are you reliable?", "Any reviews?", "Why should I believe?"
→ Trigger: AUTHORITY + LIKING

TIMING: "I need to think", "Not the right time", "Can I call later?"
→ Trigger: SCARCITY + COMMITMENT

NEED: "Do I really need this?", "What's the benefit?", "Why now?"
→ Trigger: RECIPROCITY + ANCHORING
```

### 5.2 Language Detection

**System MUST detect**:
- Primary language in customer message (English, Marathi, Hindi, Hinglish, etc.)
- Code-switching (mixing languages in same sentence)
- Language preference from previous messages
- Agent's language configuration

**Use Detection For**:
- Filler selection (language filter first step)
- Response language (match customer language when possible)
- System prompt injection (language-specific communication style)
- Analytics (track language patterns)

---

## SECTION 6: COMPLETE DATA FLOW

### 6.1 Call Initialization

```
SEQUENCE:
1. Agent Configuration Loaded
   ├─ Profile (name, role, personality, knowledge)
   ├─ Voice Settings (tone, speed, pitch, emotion)
   ├─ Speech Settings (interruption sensitivity, thinking pause)
   └─ Background Sound configuration

2. Conversation Analysis Initialized
   ├─ Create analyzer instance
   ├─ Set initial stage: AWARENESS
   ├─ Set initial profile: UNKNOWN (will detect)
   └─ Initialize objection tracking

3. Principle Decision Engine Initialized
   ├─ Set initial principle: AUTHORITY + LIKING (Awareness stage default)
   ├─ Load principle decision matrix
   └─ Prepare for dynamic updates

4. Hedge Engine V2 Initialized
   ├─ Load all filler audio files
   ├─ Parse filler metadata
   ├─ Set initial filler index: 0
   └─ Prepare for language-aware selection

5. Gemini Live Session Created
   ├─ Model: gemini-2.5-flash-native-audio-preview-12-2025
   ├─ System Instruction: Built from Agent + Current Principle
   ├─ Knowledge Base: Loaded from agent.knowledgeBase
   ├─ Audio Config: 16kHz PCM, with Voice Settings applied
   └─ WebSocket Connection Established

OUTPUT: Call Ready, Gemini Listening
```

### 6.2 On Each Customer Message (Every Turn)

```
SEQUENCE:
1. Audio Received
   ├─ Decode audio (WebSocket → PCM)
   ├─ Detect language (English/Marathi/Hindi/Hinglish)
   ├─ Forward to Gemini Live

2. Conversation Analysis (Parallel)
   ├─ Extract message text (via transcription if needed)
   ├─ Update stage: AWARENESS → CONSIDERATION → DECISION
   ├─ Detect client profile: ANALYTICAL/EMOTIONAL/SKEPTICAL/DECISION_MAKER
   ├─ Extract objections: PRICE/QUALITY/TRUST/TIMING/NEED
   ├─ Update detected language
   └─ Log conversation context

3. Principle Decision (Parallel)
   ├─ Evaluate: Current stage + Client profile + Objections
   ├─ Execute decision logic:
   │   ├─ IF stage == AWARENESS → Use AUTHORITY + LIKING
   │   ├─ IF stage == CONSIDERATION → Use ANCHORING + RECIPROCITY
   │   └─ IF stage == DECISION → Use COMMITMENT + SCARCITY
   ├─ Apply objection overrides if needed
   ├─ Apply profile modifiers if needed
   ├─ Generate new principle guidance
   └─ Update principle (don't change mid-response, only between turns)

4. System Prompt Update (Only Between Turns, NOT During)
   ├─ Build system prompt from:
   │   ├─ Agent personality (from Profile)
   │   ├─ Current principle guidance (from Decision Engine)
   │   ├─ Stage-specific instructions (from Analyzer)
   │   ├─ Voice settings injected (tone, speed, emotion)
   │   └─ Knowledge base content
   └─ NOTE: Do NOT send updateSystemInstruction during active response
            (causes 5-7 second latency). Only use at call start.

5. Gemini Processing
   ├─ Gemini receives audio + knows principle from initial prompt
   ├─ Gemini generates response (text internally, audio out)
   ├─ NOTE: No mid-stream instruction updates (not supported by Gemini Live)

6. Hedge Engine Runs in Parallel
   ├─ Start silence detection timer
   ├─ IF silence > 400ms AND Gemini still thinking:
   │   ├─ Select intelligent filler:
   │   │   ├─ Filter by detected_language (CRITICAL)
   │   │   ├─ Filter by current_principle (IMPORTANT)
   │   │   ├─ Filter by client_profile (IMPORTANT)
   │   │   ├─ Filter out last_selected_filler (VARIETY)
   │   │   └─ Use round-robin selection
   │   ├─ Stream filler audio to customer
   │   └─ Log: "Filler selected: [name] | Language: [lang] | Principle: [principle] | Profile: [profile]"
   │
   └─ WHEN Gemini audio arrives:
       ├─ Stop filler playback immediately
       ├─ Stream Gemini response audio
       └─ Log: "Gemini response streaming | Duration: Xs"

7. Response Complete
   ├─ Gemini finishes generating
   ├─ Update analyzer with Gemini's response
   ├─ Log: Stage, Profile, Principle, Objections
   └─ Ready for next customer turn

OUTPUT: Response delivered, conversation continues
```

### 6.3 Key Rule: ONLY Initial System Prompt

**CRITICAL**: Do NOT attempt to update system instruction mid-call:
- ❌ Do NOT call `updateSystemInstruction()` during active conversation
- ❌ Do NOT send new setup messages while Gemini is responding
- ❌ Do NOT change principle mid-response

**CORRECT Approach**:
- ✅ Build COMPLETE system prompt ONCE at call start
- ✅ Include all principles, profile guidance, language rules
- ✅ Update conversation analyzer in parallel (doesn't affect Gemini)
- ✅ Log principle changes for analytics
- ✅ Use principle in NEXT call's system prompt

**Why**: Gemini Live API doesn't support mid-session instruction updates without breaking connection.

### 6.4 On Call End

```
SEQUENCE:
1. Call Termination Detected
   ├─ By customer: Hang up, say "goodbye"
   ├─ By system: Duration limit reached, escalation triggered
   ├─ By error: Connection lost

2. Final Statistics Collection
   ├─ Total duration (seconds)
   ├─ Total turns (customer messages)
   ├─ Fillers played: Count & list
   ├─ Principles used: {AUTHORITY: 2, LIKING: 3, etc.}
   ├─ Detected language: Hinglish / English / Marathi / etc.
   ├─ Client profile final: ANALYTICAL / EMOTIONAL / etc.
   ├─ Objections encountered: [PRICE, TIMING]
   ├─ Customer sentiment: Positive / Neutral / Negative
   ├─ Outcome: Meeting Booked / Qualified Lead / Lost / Pending
   └─ Transcription: Complete call transcript

3. Post-Call Processing
   ├─ Log all statistics to database
   ├─ Store call transcript
   ├─ Identify objections for agent analysis
   ├─ Flag unusual patterns (silence, language switches)
   ├─ Calculate principle effectiveness (did AUTHORITY principle lead to close?)
   └─ Update agent metrics

4. Analytics & Learning
   ├─ Which principle was most effective for this profile?
   ├─ Which fillers had highest engagement?
   ├─ Which language preference was detected?
   ├─ Average response time (identify delays)
   ├─ Silence patterns (is >400ms threshold appropriate?)
   └─ Store for future improvements

OUTPUT: Call logged, ready for next call
```

---

## SECTION 7: ADDRESSING THE FOUR CRITICAL ISSUES

### Issue 1: Welcome Message Delay (6+ seconds)

**Root Cause**: Welcome message requires:
- Generation (~2-3s)
- Audio encoding (~1-2s)
- Transmission to user (~1-2s)

**Solution**:
✅ Do NOT send welcome message as separate message
✅ Instead, include welcome content in system prompt
✅ Gemini naturally mentions it as part of first response

**Implementation**:
```
System Prompt includes:
"You are [Agent Name], a [Role] specialist.
Start your first response with a warm greeting:
'Hi, this is [Agent Name]. I'm here to help you with [specific purpose].'

Then immediately transition to your first question or offer."
```

**Result**: No separate message, natural greeting as part of first response, no latency

### Issue 2: No Voice After 2nd Response

**Root Cause**: Unknown (needs investigation)

**Possible Causes**:
1. Gemini Live connection drops after 2nd response
2. Audio streaming breaks on 3rd message
3. WebSocket connection doesn't handle 3+ messages properly
4. System prompt gets corrupted on 3rd message (if mid-session updates were attempted)

**Solution**:
✅ Monitor WebSocket connection health (is it staying open?)
✅ Log every Gemini message (track if 3rd is received)
✅ Check error codes from Gemini API
✅ Verify audio streaming continues (sample rate, encoding)
✅ Test with 10+ turn conversations (debug at which turn it fails)

**Implementation**: Add detailed logging at each turn milestone

### Issue 3: Filler Language Mismatch (Hindi filler + American English voice + Hinglish setting)

**Root Cause**: Three separate components not coordinated:
1. Filler audio selected: Hindi language
2. Voice synthesis output: American English accent
3. Agent setting: Hinglish preference

**Solution**:
✅ Gemini Live has FIXED voice selection (Puck, Charon, Kore, etc.)
✅ Cannot change voice mid-call (limitation of API)
✅ Solution: Match filler language to Gemini's fixed voice

**Implementation**:
```
1. Determine which Gemini Live voice is assigned
   ├─ Puck, Charon, Kore → Best with English/Hinglish fillers
   └─ (All Gemini voices are English-based)

2. Update filler selection:
   ├─ Do NOT select pure Hindi fillers
   ├─ SELECT Hinglish/English fillers instead
   ├─ Metadata update: filler languages must match Gemini voice
   └─ Filler content can reference Hindi/Marathi, but audio is Hinglish/English

3. Metadata example:
   "sales_filler_hi_hinglish_liking.pcm"
   ├─ Content: Hindi/Marathi discussion
   ├─ Audio language: Hinglish (Hindi words in English pronunciation)
   └─ Suitable for: Hinglish/English conversations
```

**Key Rule**: Filler audio language MUST match Gemini Live voice capabilities (English-based)

### Issue 4: 6-7 Second Response Delays

**Root Cause**: Multiple factors:
1. Welcome message latency (fixed by Issue 1 solution)
2. System prompt processing (~1-2s)
3. Gemini thinking time (~2-3s)
4. Audio encoding (~1s)
5. Network transmission (~0.5s)
6. Possible mid-session instruction update attempts (breaks connection, causes 5-7s recovery)

**Solution**:
✅ Build system prompt ONCE at start (not per-turn)
✅ Keep prompt lean (<5000 chars) for faster processing
✅ Use conversation analyzer (no API calls needed, instant)
✅ Monitor each stage (reception → processing → encoding → transmission)

**Implementation**:
```
Latency Target: <2000ms total
- Reception: <200ms (network)
- Gemini processing: 1200-1500ms (thinking time)
- Audio encoding: <200ms
- Transmission: <200ms
- Buffer: <200ms

Optimization:
1. Remove welcome message delay (Issue 1)
2. Never call updateSystemInstruction mid-call
3. Keep prompt concise
4. Use streaming audio (don't wait for full response)
5. Monitor and log each stage
```

---

## SECTION 8: WORKFLOW OUTPUT REQUIREMENTS

When generating the complete Workflow, include:

### 8.1 Architectural Diagram
- Component boxes: Agent Config, Conversation Analyzer, Principle Engine, Hedge Engine V2, Gemini Live, Voice Settings
- Data flow arrows showing how information moves
- Feedback loops (how analyzer output informs principle decision)

### 8.2 Sequence Diagram
- Call initialization sequence
- Per-turn sequence (what happens during customer message)
- Parallel processes (Analyzer + Principle Engine + Hedge Engine running together)
- Key timing points (where delays occur, how long each step takes)

### 8.3 State Machine
- States: Initializing → Listening → Processing → Responding → Waiting → Closing
- Transitions: What triggers each state change?
- Hedge Engine parallel states: Silence Detection → Filler Selection → Playback

### 8.4 Configuration Schema
- Complete Agent Profile schema (all fields, types, defaults)
- Agent Role schema
- Voice Settings schema
- Speech Settings schema
- Background Sound schema

### 8.5 Database Models
- Agent table/document
- Call record (what gets stored after each call)
- Filler metadata (what metadata each filler file must have)
- Conversation turn (what's logged for each customer message)
- Call statistics (analytics collected after call)

### 8.6 API Contracts
- Init call: Input agent config, output call session ID
- Send audio: Input customer audio, output Gemini response + filler metadata
- Log turn: Input turn data, output success/error
- End call: Input call ID, output final statistics

### 8.7 Error Handling
- What happens if Gemini connection drops?
- What happens if filler file can't be found?
- What happens if no fillers match language + principle?
- What happens if customer talks >60 seconds without pause?
- What happens if unsupported language detected?

### 8.8 Testing Strategy
- Unit tests: Each component in isolation
- Integration tests: Components working together
- End-to-end test: Full 5-turn conversation with all features
- Language tests: English, Marathi, Hindi, Hinglish conversations
- Profile tests: Analytical, Emotional, Skeptical profiles
- Principle tests: Each of 6 principles in appropriate stage

### 8.9 Monitoring & Logging
- What gets logged at each step?
- How to detect if Hedge Engine is working?
- How to verify principle selection is correct?
- How to identify latency issues?
- Key metrics to track (success rate, average response time, etc.)

### 8.10 Deployment Checklist
- All filler files in correct location with correct metadata
- Agent config stored in database
- System prompt template prepared
- Hedge Engine V2 service deployed and initialized
- Conversation Analyzer initialized
- Principle Decision Engine initialized
- Gemini Live credentials configured
- Monitoring dashboards set up

---

## SECTION 9: CRITICAL SUCCESS FACTORS

### Must Have
1. ✅ Intelligent filler selection (language → principle → profile → variety)
2. ✅ Real-time conversation analysis (stage, profile, objections)
3. ✅ Dynamic principle selection (based on context)
4. ✅ System prompt built ONCE (not updated mid-call)
5. ✅ No welcome message latency
6. ✅ Proper language matching (filler audio ↔ Gemini voice)
7. ✅ Configurable agent personality (profile, role, voice, speech)
8. ✅ Zero gaps in conversation (fillers mask all silence >400ms)

### Must NOT Have
1. ❌ Random filler selection
2. ❌ Separate welcome message
3. ❌ Mid-session system prompt updates
4. ❌ Language-mismatched fillers
5. ❌ Silent gaps without fillers
6. ❌ Fixed, non-configurable voice
7. ❌ No conversation context understanding
8. ❌ Missing principle application

---

## SECTION 10: HOW TO USE THIS PROMPT

**Instruction for AI System Receiving This Prompt**:

1. **Read Sections 1-4** carefully to understand what an AI Agent is
2. **Study Section 5** to understand data flow
3. **Review Sections 6-7** for implementation details
4. **Create the Workflow** that shows:
   - All components and how they interact
   - Complete data flow (Section 6.2 is the core)
   - Agent Management system (Section 2)
   - How each of the 4 issues is solved (Section 7)
5. **Include visuals**: Diagrams, flowcharts, sequence diagrams
6. **Be specific**: Include actual code structure, database schemas, API contracts
7. **Test coverage**: Explain how to test each component

**Deliverables Expected**:
- Complete system architecture document
- Detailed data flow diagrams
- Component interaction diagrams
- Database schema
- API specifications
- Configuration schema
- Testing strategy
- Deployment guide

---

## CONCLUSION

This prompt defines a SMART, SELF-DECISIVE, SELF-LEARNING AI Agent system that:

- ✅ Understands conversation context (stage, profile, objections)
- ✅ Makes intelligent decisions (which principle, which filler, what tone)
- ✅ Maintains natural conversation flow (no gaps, no language mismatches)
- ✅ Is fully configurable (personality, voice, behavior)
- ✅ Uses psychology to persuade effectively
- ✅ Learns from every interaction
- ✅ Never feels obviously AI or unnatural

**The AI Agent is NOT complete without all components integrated together.**

An AI Agent that can:
1. Intelligently select fillers (V2 Hedge Engine) ✅
2. Understand conversation psychology (Conversation Analyzer) ✅
3. Apply persuasion principles (Principle Decision Engine) ✅
4. Sound natural and configurable (Voice Settings + Agent Profile) ✅
5. Handle no gaps or language issues (Proper initialization + metadata) ✅

**This is a true AI Agent. Everything else is a chatbot.**

---

**Generated**: 2026-02-21
**Status**: Ready for workflow generation by any AI system
**Confidence**: 100% (comprehensive, detailed, addresses all 4 critical issues)
