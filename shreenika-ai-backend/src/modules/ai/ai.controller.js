import crypto from "crypto";
import PromptCache from "../cache/promptCache.model.js";
import Usage from "../usage/usage.model.js";
import { getGeminiClient } from "../../config/google.client.js";

const getMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/**
 * LATENCY OPTIMIZATION ARCHITECTURE
 * 
 * Current: ~1.5-2s Google API latency
 * 
 * Phase 1 (NOW): Cache hit = 50ms response
 * Phase 2 (POST-DEPLOYMENT): Phrase-level caching for greetings/objections
 * Phase 3 (POST-DEPLOYMENT): Streaming responses via WebSockets
 * Phase 4 (POST-DEPLOYMENT): Provider failover (Google → OpenAI if timeout)
 * 
 * Target: 85%+ accuracy, <500ms perceived latency
 */

export const runAgentPrompt = async (req, res) => {
  try {
    const { prompt, agentId, context } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: "Prompt missing" });
    }

    const startTime = Date.now();

    // Phase 1: Check cache (exact match)
    const hash = crypto.createHash("sha256").update(prompt).digest("hex");
    const cached = await PromptCache.findOne({ hash });

    if (cached) {
      const latency = Date.now() - startTime;
      console.log(`✅ Cache hit: ${latency}ms`);
      
      return res.json({
        cached: true,
        response: cached.response,
        latency,
        tokens: cached.tokensUsed
      });
    }

    // Phase 2: Call Google Gemini
    const { llm } = getGeminiClient();
    
    // Set timeout for Google API (fail fast)
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Google API timeout")), 8000)
    );

    const geminiPromise = llm.generateContent(prompt);
    
    let result;
    try {
      result = await Promise.race([geminiPromise, timeoutPromise]);
    } catch (timeoutError) {
      console.error("⚠️ Google API timeout, falling back to default");
      
      // Future: Implement provider failover here
      // For now, return a graceful error
      return res.status(504).json({
        error: "AI response timeout",
        fallback: "I'm experiencing technical difficulties. Please try again.",
        latency: Date.now() - startTime
      });
    }

    const response = result.response.text();
    const tokensUsed = result.response.usageMetadata?.totalTokenCount || 
                       Math.ceil(response.length / 4); // Rough estimate

    const latency = Date.now() - startTime;
    console.log(`🤖 Gemini response: ${latency}ms | ${tokensUsed} tokens`);

    // Phase 3: Cache the response (async, don't block response)
    PromptCache.create({
      hash,
      response,
      tokensUsed,
      agentId,
      createdAt: new Date()
    }).catch(err => console.error("Cache save failed:", err));

    // Phase 4: Track usage (async, don't block response)
    const userId = req.user._id || req.user.id;
    const month = getMonthKey();
    
    Usage.findOneAndUpdate(
      { userId, month },
      { 
        $inc: { 
          llmTokensUsed: tokensUsed,
          llmCallsCount: 1 
        } 
      },
      { upsert: true }
    ).catch(err => console.error("Usage tracking failed:", err));

    res.json({
      cached: false,
      response,
      latency,
      tokens: tokensUsed
    });
    
  } catch (err) {
    console.error("❌ Gemini execution error:", err.message);
    
    res.status(500).json({
      error: "AI execution failed",
      message: err.message,
      fallback: "I'm having trouble processing that. Could you rephrase?"
    });
  }
};

/**
 * POST-DEPLOYMENT: Phrase-level caching
 * 
 * Common phrases to pre-cache:
 * - Greetings: "Hello, how can I help you?"
 * - Objections: "I understand your concern about pricing..."
 * - Closings: "Thank you for your time, have a great day!"
 */
export const precacheCommonPhrases = async (req, res) => {
  try {
    const commonPhrases = [
      "Hello, how can I help you today?",
      "I understand your concern.",
      "Could you tell me more about that?",
      "Thank you for your time.",
      "Is there anything else I can help with?",
      "Let me transfer you to a specialist.",
      "I'll send you that information via email."
    ];

    const { llm } = getGeminiClient();
    const results = [];

    for (const phrase of commonPhrases) {
      const hash = crypto.createHash("sha256").update(phrase).digest("hex");
      const exists = await PromptCache.findOne({ hash });
      
      if (!exists) {
        const result = await llm.generateContent(phrase);
        const response = result.response.text();
        
        await PromptCache.create({
          hash,
          response,
          tokensUsed: result.response.usageMetadata?.totalTokenCount || 0,
          isCommonPhrase: true
        });
        
        results.push({ phrase, cached: true });
      } else {
        results.push({ phrase, cached: false, reason: "Already cached" });
      }
    }

    res.json({
      message: "Common phrases precached",
      results
    });
    
  } catch (err) {
    console.error("❌ Precache error:", err);
    res.status(500).json({ error: err.message });
  }
};