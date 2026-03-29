/**
 * Gemini Message Formatter Service (Milestone 5)
 *
 * Formats all injections as client_content (not system instruction)
 * ensuring mid-session compatibility with Gemini Live API.
 *
 * Key Constraint: System instructions CANNOT be updated mid-session.
 * MUST use client_content with "user" role for mid-session injections.
 *
 * Format Pattern:
 * {
 *   type: "client_content",
 *   client_content: {
 *     turns: [{
 *       role: "user",
 *       parts: [{ text: "combined instructions" }]
 *     }]
 *   }
 * }
 */

export class GeminiMessageFormatterService {
  constructor() {
    console.log('📝 Gemini Message Formatter Service initialized');
  }

  /**
   * Format combined instructions as client_content for Gemini
   *
   * @param {string|Array} instructions - Combined instruction text OR array of instruction parts
   * @returns {Object} - Formatted message ready for Gemini
   */
  formatClientContent(instructions) {
    if (!instructions) {
      console.warn('[FORMATTER] No instructions provided');
      return null;
    }

    // Normalize to string
    let instructionText = '';
    if (Array.isArray(instructions)) {
      instructionText = instructions.join('\n\n');
    } else if (typeof instructions === 'string') {
      instructionText = instructions;
    } else {
      console.warn('[FORMATTER] Invalid instructions type');
      return null;
    }

    if (!instructionText.trim()) {
      console.warn('[FORMATTER] Empty instruction text');
      return null;
    }

    // Build client_content message
    const message = {
      type: 'client_content',
      client_content: {
        turns: [
          {
            role: 'user',
            parts: [
              {
                text: instructionText
              }
            ]
          }
        ]
      }
    };

    console.log(`[FORMATTER] Formatted message (${instructionText.length} chars, ${instructionText.split('\n').length} lines)`);

    return message;
  }

  /**
   * Combine multiple instruction objects into a single formatted message
   *
   * @param {Array} injections - Array of { instruction, metadata } objects
   * @returns {Object} - Formatted message
   */
  formatFromInjections(injections) {
    if (!Array.isArray(injections) || injections.length === 0) {
      console.warn('[FORMATTER] No injections provided');
      return null;
    }

    // Extract instruction text from each injection
    const instructionParts = injections.map((inj, idx) => {
      const header = inj.type ? `[${inj.type}]` : `[INJECTION_${idx}]`;
      return `${header}\n${inj.instruction}`;
    });

    return this.formatClientContent(instructionParts);
  }

  /**
   * Format a psychology principle as client_content
   *
   * @param {string} principleInstruction - The principle instruction text
   * @returns {Object} - Formatted message
   */
  formatPrincipleAsClientContent(principleInstruction) {
    const wrappedInstruction = `
You are operating under the following psychology-driven instruction:

${principleInstruction}

Apply this principle naturally in your next response to the user. Be subtle and conversational.
    `.trim();

    return this.formatClientContent(wrappedInstruction);
  }

  /**
   * Combine multiple instructions with proper formatting
   *
   * @param {Object} options - { psychology, personality, context, prediction }
   * @returns {Object} - Formatted message
   */
  formatWithCategories(options = {}) {
    const parts = [];

    // Add each category if present
    if (options.psychology) {
      parts.push(`[PSYCHOLOGY]\n${options.psychology}`);
    }
    if (options.personality) {
      parts.push(`[PERSONALITY]\n${options.personality}`);
    }
    if (options.context) {
      parts.push(`[CONTEXT]\n${options.context}`);
    }
    if (options.prediction) {
      parts.push(`[PREDICTION]\n${options.prediction}`);
    }

    if (parts.length === 0) {
      console.warn('[FORMATTER] No categories provided');
      return null;
    }

    const combined = parts.join('\n\n');
    return this.formatClientContent(combined);
  }

  /**
   * Get the size of a message in tokens (rough estimate)
   * Assumes ~1.3 chars per token on average
   *
   * @param {Object} message - Formatted message
   * @returns {number} - Estimated token count
   */
  estimateTokenCount(message) {
    if (!message || !message.client_content) {
      return 0;
    }

    const text = message.client_content.turns
      ?.map(turn => turn.parts?.map(part => part.text || '').join(''))
      .join('') || '';

    // Rough estimate: 1.3 characters per token
    return Math.ceil(text.length / 1.3);
  }

  /**
   * Wrap plain text in client_content format
   *
   * @param {string} text
   * @returns {Object} - Formatted message
   */
  wrapText(text) {
    return this.formatClientContent(text);
  }

  /**
   * Create a system override message
   * Used only at session setup time (not for mid-session injection)
   *
   * @deprecated System instructions cannot be updated mid-session
   * @param {string} systemInstruction
   * @returns {Object} - Setup-only message (NOT for use mid-session)
   */
  formatSystemInstruction(systemInstruction) {
    console.warn('[FORMATTER] ⚠️ WARNING: System instructions should only be set at session setup');
    console.warn('[FORMATTER] For mid-session updates, use formatClientContent() instead');

    return {
      type: 'system_instruction',
      systemInstruction: systemInstruction,
      note: 'This is for setup-time only, not mid-session injection'
    };
  }
}

export default GeminiMessageFormatterService;
