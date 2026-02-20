# Shreenika AI Platform - Comprehensive Bug Analysis & ToDo List
**Date:** 2026-02-20
**Phase:** Understanding & Planning (Pre-Implementation)
**Status:** Ready for User Approval Before Execution

---

## PART 1: COMPLETE BUG TAXONOMY

### 1. DASHBOARD ISSUES

#### Bug 1.1: Call Count Not Updating
- **Symptom:** Dashboard shows "2 calls" but actual calls exceed this number
- **Impact:** User loses visibility into actual call volume
- **Likely Causes:**
  - Real-time listener not updating on call completion
  - Call status not being persisted correctly to database
  - Query logic missing recent calls
- **Affected Code Areas:** Dashboard.tsx, call.controller.js, call.model.js
- **Dependency:** Depends on stable call status tracking

---

### 2. AGENT MANAGEMENT ISSUES

#### Bug 2.1: Background Sound Not Effective in Calls
- **Symptom:** When agent sets background sound in settings, it doesn't apply to actual voice calls
- **Impact:** Agent voice customization feature partially non-functional
- **Likely Causes:**
  - Voice customization config not passed to VoiceService during call creation
  - VoiceService not applying background sound effect during audio processing
  - Audio effect parameters not matching with speech settings
- **Affected Code Areas:** voice.service.js, voice-customization.service.js, mediastream.handler.js, google.live.client.js
- **Dependency:** Core voice quality system (40-60 ratio architecture)
- **Related To:** Bug 2.3 (Prompt Sensitivity - same config pipeline)

#### Bug 2.2: Welcome Message Missing <First_Name> Placeholder
- **Symptom:** Welcome message hardcoded or generic, doesn't insert lead's first name
- **Problem:** Should say "Hello John, welcome to..." NOT "Hello, welcome to..."
- **Expected Behavior:**
  - Extract lead's first name from campaign contact
  - Insert with "Ji" suffix (India) → "John Ji"
  - OR with "Mr." prefix (Global) → "Mr. John"
  - Dynamic based on region/language setting
- **Affected Code Areas:**
  - test-agent.handler.js (test mode welcome message)
  - VoiceService initialization (Gemini Live system prompt)
  - Agent system instruction building
- **Dependency:** Contact/Lead name fetching from database
- **Related To:** Bug 3.1 (Contacts - name fields must be available)

#### Bug 2.3: Prompt Sensitivity Too High for Starter Plan Users
- **Symptom:** Starter Plan users with simple prompts experience random/unexpected speech outputs
- **Problem:** AI is "too sensitive" to prompt wording, overinterpreting instructions
- **Root Cause Hypothesis:**
  - System prompt not properly grounded for Starter users
  - Emotion level defaulting to extreme values (0.9 = too enthusiastic)
  - Lack of knowledge base causing model to "hallucinate" based on weak instructions
- **Expected Behavior:**
  - Default safe parameters for Starter Plan (emotion: 0.5 neutral, conservative response style)
  - Pro Plan allows higher sensitivity tuning
- **Affected Code Areas:**
  - voice-customization.service.js (emotion level defaults)
  - google.live.client.js (system instruction building for new agents)
  - Agent creation schema
- **Dependency:** Agent plan type detection (Starter vs Pro)
- **Related To:** Bug 2.1 (background sound uses same config system)

#### Bug 2.4: Document Upload Failing for Various File Types
- **Symptom:** Upload button rejects files with message "Could not extract meaningful text"
- **Problem:**
  - Some valid document types rejected at validation stage
  - System should accept ALL types, then OCR process what it can
  - Current: rejects types it doesn't recognize → user can't even try
- **Root Cause:**
  - knowledge.controller.js has whitelist of accepted types (PDF, DOCX, TXT only)
  - Should accept ANY file type instead
  - OCR failure should be handled gracefully post-upload
- **Expected Behavior:**
  - Accept file upload regardless of extension/MIME type
  - Pass to pdf-parse (if PDF) or Vision OCR (if image/scanned)
  - Return error only if extraction produces ZERO meaningful text
- **User Context:** User uploaded self-created PDF with text + logo, got rejected
- **Affected Code Areas:** knowledge.controller.js (upload handler), knowledge.model.js (validation)
- **Dependency:** PDF-parse + Google Vision OCR must be functioning
- **Related To:** Test results from revision 00262-r8b show diagnostic logging added, awaiting re-test

---

### 3. CONTACTS ISSUES

#### Bug 3.1: Contact Fields Not Available Collectively for Name-Speaking
- **Symptom:** When building welcome message, system can't fetch all name fields (First Name, Last Name, salutation, etc.) reliably
- **Problem:**
  - Contact/Lead schema may not have all required fields
  - Fetch query may not be pulling all fields
  - Name assembly logic missing or broken
- **Expected Behavior:**
  - Query returns: { firstName, lastName, salutation, phoneNumber, email, location, ... }
  - System can construct: "Mr. John Smith" or "John Ji" based on available fields + region setting
- **Affected Code Areas:**
  - contact.model.js (schema - verify firstName, lastName fields exist)
  - contact.controller.js (getContact endpoint - verify all fields returned)
  - lead.model.js (campaign leads should inherit from contacts)
  - Agent name-building logic in google.live.client.js
- **Dependency:** Database schema completeness
- **Related To:** Bug 2.2 (welcome message uses these fields)

#### Bug 3.2: UI Scrolling Issue - Can't Delete Last Lead
- **Symptom:**
  - When scrolling in contact/lead list, UI element dropdown goes below viewport
  - Can't click delete button on last item in list
  - Scrollbar prevents interaction
- **Problem:**
  - CSS z-index or overflow issue with modal/dropdown
  - Modal positioned without accounting for scrollbar width
  - Dropdown not positioned relative to scroll container
- **Affected Code Areas:**
  - CallManager.tsx (if showing in campaign lead picker)
  - ContactManager.tsx or similar component
  - CSS: overflow, position, z-index rules
  - Tailwind classes or style overrides
- **Dependency:** None (pure UI/UX fix)
- **Browser/OS Specific:** May affect Chrome more than Firefox, depends on scrollbar rendering

---

### 4. CALL MANAGEMENT ISSUES

#### Bug 4.1: Analytics Banner Disappears on Section Switch
- **Symptom:**
  - Analytics banner with call stats appears initially
  - Clicking different section (Calls, Campaigns, etc.) causes banner to auto-remove
  - Cross button to close doesn't properly disconnect/cleanup calls
- **Problem:**
  - Banner state not persisted across section switches
  - Event listeners not properly cleaned up
  - WebSocket/listener not being closed on banner dismiss
- **Expected Behavior:**
  - Banner persists across section switches
  - Cross button properly closes active call connections
  - State survives navigation
- **Affected Code Areas:**
  - CallManager.tsx (banner component state management)
  - voice.service.js (cleanup on disconnect)
  - mediastream.handler.js (WebSocket cleanup)
- **Dependency:** WebSocket connection lifecycle management
- **Related To:** Bug 4.2 (recording presence depends on proper call lifecycle)

#### Bug 4.2: Recording Not Generated After Call Execution
- **Symptom:** Call completes successfully but no recording URL appears in call details
- **Problem:**
  - Twilio recording not initiated during call
  - Recording created but URL not stored in database
  - twilioRecordingStatus webhook not triggered/registered
- **Expected Behavior:**
  - Every call has `call.recordingUrl` set
  - Recording playable via audio player in UI
- **Affected Code Areas:**
  - TwilioProvider.js (add recording params to call initiation)
  - twilio.controller.js (twilioRecordingStatus handler)
  - server.js (webhook route registration)
  - call.model.js (recordingUrl field)
  - CallManager.tsx (audio player component)
- **Dependency:** Twilio account must have recording enabled
- **Related To:** Bug 4.3 (waveform needs recording to display)

#### Bug 4.3: Waveform Static - No Dynamic Playback
- **Symptom:**
  - Call details show static waveform visualization
  - No audio player, no play/pause controls
  - Can't listen to call recording
- **Problem:**
  - Waveform component exists but not wired to actual audio
  - Audio player component missing or not integrated
  - Recording URL not being used
- **Expected Behavior:**
  - Audio player with play/pause/seek controls
  - Waveform updates dynamically during playback
  - Shows duration and current position
- **Affected Code Areas:**
  - CallManager.tsx or CallDetails.tsx (waveform + audio player)
  - React audio player library integration
  - CSS for waveform styling
- **Dependency:** Depends on Bug 4.2 (recording must exist)
- **Related To:** Bug 4.4 (call details must show this)

#### Bug 4.4: Call Details Fields Verification Required
- **Symptom:** Unclear which fields are missing or incorrect in call details display
- **Problem:**
  - Schema may not match UI display
  - Some fields may not be populated on call completion
- **Required Fields to Verify:**
  - Call ID, Agent ID, Lead/Contact info
  - Duration, start time, end time
  - Status (Completed, Failed, No Answer, Voicemail, etc.)
  - Outcome (meeting_booked, interested, not_interested, etc.)
  - Transcription (text), Call Summary (AI-generated)
  - Recording URL, Waveform data
  - Cost (if applicable)
- **Affected Code Areas:**
  - call.model.js (schema definition)
  - call.controller.js (call creation and completion logic)
  - CallManager.tsx (display fields)
  - call.processor.js (processCompletedCall - populates fields)
- **Dependency:** All other call management bugs depend on correct schema

#### Bug 4.5: Transcription Showing Random English Sentences
- **Symptom:**
  - Call transcription displays generic/random text instead of actual conversation
  - Example: Shows "The quick brown fox jumps over..." instead of actual caller+AI dialogue
- **Problem:**
  - Google Speech-to-Text not being called correctly
  - Voice content not properly extracted from call audio
  - Transcription service returning placeholder text
  - Recording URL not accessible to transcription service
- **Expected Behavior:**
  - Transcription shows actual caller statements + AI responses
  - Format: "Caller: '...' Agent: '...' Caller: '...'"
  - Language: English or Hinglish depending on call content
- **Affected Code Areas:**
  - call.processor.js (processCompletedCall function)
  - transcript.service.js (Google Speech-to-Text integration)
  - call.model.js (transcript field)
  - CallManager.tsx (transcript display)
- **Dependency:** Bug 4.2 (recording must exist and be accessible)
- **Related To:** Bug 4.6 (summary generation uses transcription)

#### Bug 4.6: Call Summary Missing
- **Symptom:** No AI-generated summary appears in call details after completion
- **Problem:**
  - Call summary generation not triggered on call completion
  - Gemini post-call LLM (gemini-2.5-flash) not being invoked
  - Summary field not populated in database
- **Expected Behavior:**
  - After call ends, system sends transcription + call context to gemini-2.5-flash
  - Returns 2-3 sentence AI summary of call outcome
  - Summary stored in call.summary field
- **Affected Code Areas:**
  - call.processor.js (processCompletedCall - add summary generation)
  - google.live.client.js (already has post-call model configured)
  - call.model.js (summary field)
  - CallManager.tsx (summary display)
- **Dependency:** Bug 4.5 (transcription must exist)
- **Related To:** Depends on entire call completion pipeline

#### Bug 4.7: "Archive" Button Text Should Be "Delete"
- **Symptom:** Button labeled "Archive" but performs delete operation
- **Problem:** UX mismatch - text doesn't match action
- **Expected Behavior:** Change button text from "Archive" to "Delete"
- **Affected Code Areas:** CallManager.tsx (button label)
- **Dependency:** None

#### Bug 4.8: Refresh Button Not Working for Re-Dialing
- **Symptom:** Clicking refresh button doesn't re-initiate call to same contact
- **Problem:**
  - Refresh button may just reload UI, not actually dial again
  - Call state not reset after completion
  - Permission/validation preventing re-dial
- **Expected Behavior:**
  - Refresh button initiates new outbound call to same contact
  - Previous call marked as historical
  - New call gets new call ID
- **Affected Code Areas:**
  - CallManager.tsx (refresh button handler)
  - call.controller.js (initiateOutboundCall endpoint)
  - UI state management
- **Dependency:** Depends on stable call initiation system

---

### 5. SETTINGS ISSUES

#### Bug 5.1: Profile Missing First Name, Last Name, Mobile, Address Fields
- **Symptom:** User profile in settings only shows email/basic info
- **Problem:**
  - User schema missing these fields
  - UI form not built for these fields
  - Save endpoint not handling them
- **Expected Behavior:**
  - Profile has: First Name, Last Name, Mobile Number, Address
  - All can be edited and saved
  - Used in system (e.g., email signatures, call context)
- **Affected Code Areas:**
  - user.model.js (add fields to schema)
  - user.controller.js (updateProfile endpoint)
  - SettingsPage.tsx or ProfilePage.tsx (form UI)
  - Database migration (if needed)
- **Dependency:** None

#### Bug 5.2: VOIP Details Page Not Showing When Provider Active
- **Symptom:** When user has VOIP provider configured, settings doesn't show details
- **Problem:**
  - Details page component not built/integrated
  - Data not being fetched from voip.model.js
  - UI toggle/link missing
- **Expected Behavior:**
  - When VOIP active, show collapsible section with:
    - Provider Name (Twilio, SansPBX, Other)
    - API Key (masked)
    - SID Key or Auth Token (masked)
    - DID Number (full display)
    - Webhooks/URLs configured
    - Last validated: timestamp
  - Edit option for credentials
- **Affected Code Areas:**
  - voip.controller.js (getVoipProvider endpoint to fetch current)
  - SettingsPage.tsx (add VOIP details section)
  - voip.model.js (verify all fields present)
- **Dependency:** VOIP provider must be configured in database

#### Bug 5.3: API Integration Status Re-Verification Required
- **Symptom:** Unclear what the current status is and what needs checking
- **Problem:**
  - May have incomplete integration (partially wired)
  - May need re-testing of API connectivity
  - Documentation unclear on what APIs are integrated
- **Affected Code Areas:** Various (depends on which APIs)
- **Dependency:** Requires clarification on which integrations

---

### 6. CACHING SYSTEM (CORE - MOST SENSITIVE)

#### Bug 6.1: Context Caching Not Working (Requires Separate Discussion)
- **Symptom:** 90% cost reduction not achieved, users still pay full price
- **Problem:** Multiple critical bugs in caching service (see MEMORY.md notes)
- **Status:** REQUIRES SEPARATE DISCUSSION WITH DETAILED ANALYSIS
- **Known Issues:**
  - Model mismatch (cache vs live session)
  - Singleton pattern broken (new instance per call)
  - Token threshold below minimum (32K)
  - No TTL keep-alive
- **Impact:** Cost optimization feature completely non-functional
- **Files:** context-caching.service.js, google.live.client.js, voice.service.js
- **Dependency:** BLOCKING - Core to billing model for Pro users
- **Related To:** All calling features depend on stable caching

---

## PART 2: INTER-BUG DEPENDENCIES & RELATIONSHIPS

### Dependency Map

```
Bug 4.2 (Recording)
    ├─→ Bug 4.3 (Waveform playback)
    ├─→ Bug 4.5 (Transcription)
    │   └─→ Bug 4.6 (Call Summary)
    └─→ Bug 4.4 (Call Details verification)

Bug 3.1 (Contact fields)
    └─→ Bug 2.2 (Welcome message with name)

Bug 2.1 (Background sound)
    └─→ Bug 2.3 (Prompt sensitivity)
    └─→ Same voice customization pipeline

Bug 5.1 (Profile fields)
    └─→ Bug 5.2 (VOIP details)

Bug 3.2 (UI Scrolling)
    └─→ Independent (UI-only fix)

Bug 4.1 (Analytics banner)
    └─→ Affects Call state management

Bug 4.7 (Button text)
    └─→ Independent (UX-only fix)

Bug 4.8 (Refresh button)
    └─→ Depends on stable call system
```

### Critical Path (Blocking Other Bugs)
1. **Bug 4.2** (Recording) → Blocks Bug 4.3, 4.5, 4.6
2. **Bug 3.1** (Contact fields) → Blocks Bug 2.2
3. **Bug 2.1** (Background sound) ↔ Bug 2.3 (Same system)

### Safe to Implement In Parallel
- Bug 3.2 (UI Scrolling) - Pure UI
- Bug 4.7 (Button text) - Pure UI
- Bug 5.1 (Profile fields) - User schema
- Bug 5.3 (API status) - Clarification needed

---

## PART 3: BUG SEVERITY & PRIORITY MATRIX

| Bug ID | Title | Severity | Priority | Scope | Effort |
|--------|-------|----------|----------|-------|--------|
| 2.2 | Welcome message <First_Name> | High | P0 | Frontend + Backend | 1-2h |
| 4.2 | Recording generation | Critical | P0 | Backend + Frontend | 2-3h |
| 4.5 | Transcription fix | High | P1 | Backend | 2-3h |
| 4.6 | Call summary generation | High | P1 | Backend | 1-2h |
| 2.1 | Background sound effect | High | P1 | Backend | 2-3h |
| 2.3 | Prompt sensitivity defaults | Medium | P1 | Backend | 1-2h |
| 4.3 | Waveform + audio player | High | P1 | Frontend | 2-3h |
| 2.4 | Document upload file types | Medium | P1 | Backend | 1-2h |
| 3.1 | Contact field completeness | High | P1 | Backend + Frontend | 1-2h |
| 1.1 | Dashboard call count | Medium | P2 | Frontend + Backend | 1-2h |
| 4.1 | Analytics banner persistence | Medium | P2 | Frontend | 1-2h |
| 4.4 | Call details fields | Medium | P2 | Full Stack | 1-2h |
| 3.2 | UI scrolling issue | Low | P3 | Frontend | 0.5-1h |
| 4.7 | Button text (Archive→Delete) | Trivial | P3 | Frontend | 0.1h |
| 4.8 | Refresh button re-dial | Low | P2 | Frontend | 1-2h |
| 5.1 | Profile fields | Low | P2 | Backend + Frontend | 2-3h |
| 5.2 | VOIP details display | Low | P2 | Frontend | 2-3h |
| 5.3 | API integration status | TBD | TBD | TBD | TBD |
| 6.1 | Context caching system | Critical | P0 | Backend | 5-8h |

---

## PART 4: GROUPED TODO LIST BY PRIORITY & AREA

### PHASE 1: CRITICAL PATH (P0 - Must fix first)
**Estimated: 12-16 hours**

1. **2.2** - Add <First_Name> placeholder to welcome message
   - Extract lead name from database
   - Build "John Ji" (India) or "Mr. John" (Global) format
   - Inject into Gemini Live system prompt

2. **4.2** - Enable call recording and store URL
   - Add recording parameters to TwilioProvider.initiateCall
   - Create twilioRecordingStatus webhook handler
   - Store recordingUrl in call.model
   - Register webhook route in server.js

3. **4.5** - Fix transcription extraction
   - Debug transcript.service.js
   - Verify recording URL is accessible to Speech-to-Text
   - Ensure actual caller+agent dialogue is captured
   - Test with sample call

4. **4.6** - Implement call summary generation
   - After transcription complete, invoke gemini-2.5-flash
   - Generate 2-3 sentence summary
   - Store in call.summary
   - Display in call details

### PHASE 2: HIGH PRIORITY (P1 - Major features)
**Estimated: 15-20 hours**

5. **2.1** - Fix background sound application
   - Verify voice customization config passed to VoiceService
   - Apply audio effects in mediastream.handler.js
   - Test with actual call

6. **2.3** - Set safe defaults for Starter Plan
   - Detect account plan (Starter vs Pro)
   - Apply conservative emotion level (0.5)
   - Use cautious response style
   - Document defaults for Pro Plan

7. **4.3** - Add audio player with waveform
   - Integrate React audio player library
   - Connect to recording URL from Bug 4.2
   - Implement dynamic waveform visualization
   - Add play/pause/seek controls

8. **2.4** - Accept all document types for upload
   - Remove file type whitelist
   - Accept any extension/MIME type
   - Pass to OCR pipeline
   - Return error only if zero text extracted

9. **3.1** - Ensure all contact fields available
   - Verify contact.model.js has firstName, lastName, salutation
   - Update contact.controller.js getContact to return all fields
   - Verify lead schema inherits these fields
   - Test name-building logic

10. **4.4** - Verify all call detail fields
    - Cross-check call.model.js schema
    - Verify all fields populated in call completion
    - Check CallManager.tsx displays all fields
    - Test with real call

### PHASE 3: MEDIUM PRIORITY (P2 - Important but not blocking)
**Estimated: 8-12 hours**

11. **1.1** - Fix dashboard call count updating
    - Add real-time listener for new calls
    - Update count on call.completed event
    - Persist across page refreshes
    - Test with multiple concurrent calls

12. **4.1** - Persist analytics banner across navigation
    - Move banner state to top-level context/Redux
    - Prevent auto-removal on section switch
    - Properly cleanup WebSocket on close
    - Test navigation scenarios

13. **4.8** - Fix refresh button to re-dial
    - Add re-dial handler
    - Reset call state
    - Create new call with same contact
    - Test with completed calls

14. **5.1** - Add profile fields (First Name, Last Name, Mobile, Address)
    - Update user.model.js
    - Create migration if needed
    - Build profile edit form
    - Wire save endpoint

15. **5.2** - Display VOIP details when active
    - Fetch current VOIP provider from database
    - Build details component
    - Show masked credentials
    - Add edit option

### PHASE 4: LOW PRIORITY (P3 - Polish)
**Estimated: 2-3 hours**

16. **3.2** - Fix UI scrolling (can't delete last item)
    - Adjust z-index and overflow CSS
    - Test dropdown positioning in scroll context
    - Fix for all screen sizes

17. **4.7** - Change "Archive" button to "Delete"
    - Update CallManager.tsx button label

### PHASE 5: REQUIRES CLARIFICATION (Blocked)
**Pending User Input**

18. **5.3** - API Integration Status
    - Clarify which APIs need verification
    - Understand current integration status
    - Plan verification steps

19. **6.1** - Context Caching System (SEPARATE DISCUSSION)
    - REQUIRES DETAILED ANALYSIS PHASE
    - Known blockers: model mismatch, singleton, token threshold
    - Plan: Fix 5 critical issues in context-caching.service.js
    - Impact: 90% cost reduction for Pro Plan users

---

## PART 5: IMPLEMENTATION STRATEGY

### Approach
1. **Fix Critical Path First** → Unblock other features
2. **Group by Area** → Related bugs together for efficiency
3. **Test as You Go** → Each phase needs verification
4. **Deploy After Each Phase** → Monitor for regressions

### Quality Gates
- ✅ Code syntax verified
- ✅ Related tests pass
- ✅ No security vulnerabilities introduced
- ✅ Logs show expected messages
- ✅ User confirms fix works

### Rollback Plan
- Keep previous Cloud Run revision active
- Tag commits clearly (phase-1, phase-2, etc.)
- Test in staging before production deployment
- Monitor logs for 15 minutes after each deploy

---

## PART 6: UNDERSTANDING SUMMARY

**Total Bugs Identified:** 19
**Critical/High Severity:** 8
**Medium Severity:** 6
**Low Severity:** 3
**Clarification Needed:** 2

**Estimated Total Effort:** 40-55 hours
**Estimated Timeline:** 5-7 working days (with parallel execution)

**Dependencies Identified:**
- Recording → Transcription → Summary (sequential)
- Contact Fields → Welcome Message (sequential)
- Background Sound ↔ Prompt Sensitivity (parallel)

**Files Requiring Changes:** 25+
**Commits Required:** 10-15
**Cloud Run Deployments:** 4-5 phases

**Key Principle for Implementation:**
- NO voice feature removal (per user's directive from earlier fixes)
- All changes are additions or fixes to existing systems
- Focus on stability and user experience

---

## NEXT STEP

**Status:** Understanding phase COMPLETE ✅

**Ready For:** User approval to proceed with Phase 1 implementation

**User Confirmation Needed:**
1. Does this analysis correctly capture all bugs?
2. Are there any bugs missing or incorrectly understood?
3. Are the priority rankings appropriate?
4. Should we proceed with Phase 1 (Critical Path) execution?

