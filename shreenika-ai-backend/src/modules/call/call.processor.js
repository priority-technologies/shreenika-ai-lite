import Call from "./call.model.js";
import PromptCache from "../cache/promptCache.model.js";
import { getGeminiClient } from "../../config/google.client.js";
import { runCallAI } from "../ai/call.ai.js";

/**
 * Hash helper (simple + deterministic)
 */
const hashText = (text) => {
  return Buffer.from(text).toString("base64").slice(0, 64);
};

/**
 * MAIN AI PROCESSOR
 * Runs ONCE per call
 */
export const processCallAI = async (callId) => {
  const call = await Call.findById(callId);
  if (!call) return;

  // Safety locks
  if (call.aiProcessed) return;
  if (!call.recordingUrl) return;

  const { llm } = getGeminiClient();

  // -------- TRANSCRIPTION (SIMULATED PLACEHOLDER) --------
  // Real STT will be plugged here later
  const transcriptText = `
Agent: Hello, this is Shreenika AI calling.
Lead: Yes, I received your call.
Agent: We wanted to discuss our service briefly.
Lead: Sounds good.
`;

  // -------- CACHE CHECK --------
  const transcriptHash = hashText(transcriptText);
  let cached = await PromptCache.findOne({ hash: transcriptHash });

  let summary, sentiment;

  if (cached) {
    summary = cached.response.summary;
    sentiment = cached.response.sentiment;
  } else {
    const prompt = `
Analyze this phone call transcript:

"${transcriptText}"

Return JSON:
{
  "summary": "1-2 sentence summary",
  "sentiment": "Positive | Neutral | Negative"
}
`;

    const result = await llm.generateContent(prompt);
    const text = result.response.text();

    const parsed = JSON.parse(text);

    summary = parsed.summary;
    sentiment = parsed.sentiment;

    await PromptCache.create({
      hash: transcriptHash,
      response: parsed,
      tokensUsed: text.length
    });
  }

  // -------- SAVE RESULTS --------
  call.transcript = transcriptText;
  call.summary = summary;
  call.sentiment = sentiment;
  call.aiProcessed = true;

  await call.save();

  console.log(`✅ AI processed call ${call._id}`);
};

/**
 * Format conversation turns into readable transcript
 */
const formatConversationTurns = (turns) => {
  if (!turns || turns.length === 0) return null;

  return turns
    .map(turn => `${turn.role === 'agent' ? 'Agent' : 'Lead'}: ${turn.content}`)
    .join('\n');
};

/**
 * This function is the SINGLE SOURCE OF TRUTH
 * for post-call processing.
 *
 * Priority:
 * 1. Use real-time conversationTurns from Gemini Live (if available)
 * 2. Fall back to recording URL processing with STT
 */
export const processCompletedCall = async (callId) => {
  const call = await Call.findById(callId);

  if (!call) return;
  if (call.aiProcessed === true) return; // idempotent guard

  console.log(`🔄 Processing completed call: ${call._id}`);

  let transcriptText = null;

  // ===== PRIORITY 1: Use real-time transcript from Gemini Live =====
  // BUG 4.5 FIX (2026-02-20): This is the PRIMARY transcript source - captured during call
  if (call.conversationTurns && call.conversationTurns.length > 0) {
    console.log(`📝 Using real-time transcript from Gemini Live (${call.conversationTurns.length} turns)`);
    console.log(`   └─ Sample: "${call.conversationTurns[0]?.content?.substring(0, 50)}..."`);
    transcriptText = formatConversationTurns(call.conversationTurns);
    call.transcript = transcriptText;
    console.log(`✅ Transcript formatted: ${transcriptText.length} characters`);
  } else {
    console.warn(`⚠️  No conversationTurns found for call ${callId} - falling back to recording`);
  }

  // ===== PRIORITY 2: Fall back to recording + STT =====
  // BUG 4.5 FIX (2026-02-20): runCallAI was trying to transcribe URL string with text API (broken)
  // Only use if recording exists - but note: manual transcription would need to be implemented
  // For now, if no conversationTurns and no manual STT, mark as complete and skip
  if (!transcriptText && call.recordingUrl) {
    console.log(`🎙️ Recording available: ${call.recordingUrl}`);
    console.warn(`⚠️  Recording transcription not implemented - conversationTurns are the primary transcript source`);
    // TODO: Implement proper STT via Google Speech-to-Text API
    // For now, create a placeholder indicating recording exists but isn't transcribed
    transcriptText = '[Recording transcription pending - use Gemini Live conversationTurns instead]';
  }

  // ===== No transcript available =====
  if (!transcriptText) {
    console.log(`⚠️ No transcript available for call: ${call._id}`);
    call.aiProcessed = true;
    await call.save();
    return;
  }

  // ===== ANALYZE TRANSCRIPT WITH GEMINI =====
  // BUG 4.5 FIX (2026-02-20): Enhanced analysis with proper outcome detection
  try {
    if (!transcriptText) {
      console.warn(`⚠️  No transcript to analyze - skipping AI analysis`);
    } else {
      const { llm } = getGeminiClient();

      const prompt = `
Analyze this phone call transcript and return JSON:

"${transcriptText}"

Return ONLY valid JSON (no markdown):
{
  "summary": "1-2 sentence summary of the call",
  "sentiment": "Positive" | "Neutral" | "Negative",
  "outcome": "meeting_booked" | "callback_requested" | "not_interested" | "voicemail" | null
}

Meeting booking indicators: "let's schedule", "calendar invite", "send you a meeting link", "next week/month", "set up a demo", "book a time", "confirm our appointment", "scheduled".
Callback indicators: "call me back", "try again later", "I'll think about it", "get back to you".
Not interested indicators: "not interested", "remove me from list", "don't call again", "we're good".
Set null if none of these outcomes clearly apply.
`;

      const result = await llm.generateContent(prompt);
      const responseText = result.response.text();

      // Clean the response (remove markdown if present)
      const cleanJson = responseText.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      call.summary = parsed.summary;
      call.sentiment = parsed.sentiment;
      call.outcome = parsed.outcome || null;

      console.log(`✅ AI analysis complete:`);
      console.log(`   ├─ Sentiment: ${parsed.sentiment}`);
      console.log(`   ├─ Outcome: ${parsed.outcome || 'none'}`);
      console.log(`   └─ Summary: ${parsed.summary.substring(0, 50)}...`);
    }

  } catch (error) {
    console.error(`❌ AI analysis failed:`, error.message);
    // Set defaults on error but still save the transcript
    call.summary = "Call completed. Analysis unavailable.";
    call.sentiment = "Neutral";
  }

  call.aiProcessed = true;
  await call.save();

  console.log(`✅ Processed call: ${call._id}`);
};