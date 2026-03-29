/**
 * Gemini Message Validator Service (Milestone 5)
 *
 * Validates all messages before sending to Gemini to prevent:
 * - Malformed messages
 * - Contradictory instructions
 * - Messages exceeding size limits
 * - Invalid structure
 *
 * Gemini Live API Constraints:
 * - Context window: 128k tokens max
 * - Message must follow client_content format for mid-session
 * - No conflicting system instructions mid-session
 * - All parts must be valid text or audio
 */

export class GeminiMessageValidatorService {
  constructor(maxMessageSize = 4096) {
    this.maxMessageSize = maxMessageSize; // Bytes
    this.maxTokens = 125000; // Conservative limit (128k - 3k buffer)

    console.log('✅ Gemini Message Validator Service initialized');
  }

  /**
   * Validate a message before sending to Gemini
   *
   * @param {Object} message - Message to validate
   * @returns {Object} - { isValid, errors, warnings, details }
   */
  validate(message) {
    const errors = [];
    const warnings = [];
    const details = {};

    // Check message structure
    if (!message) {
      errors.push('Message is null or undefined');
      return { isValid: false, errors, warnings, details };
    }

    if (typeof message !== 'object') {
      errors.push('Message must be an object');
      return { isValid: false, errors, warnings, details };
    }

    // Validate client_content structure
    if (!message.client_content) {
      errors.push('Missing client_content (required for mid-session injection)');
    } else {
      this._validateClientContent(message.client_content, errors, warnings, details);
    }

    // Check for contradictions
    this._checkForContradictions(message, errors, warnings);

    // Estimate token count
    const estimatedTokens = this._estimateTokenCount(message);
    details.estimatedTokens = estimatedTokens;

    if (estimatedTokens > this.maxTokens) {
      errors.push(`Message too large: ${estimatedTokens} tokens (max: ${this.maxTokens})`);
    } else if (estimatedTokens > this.maxTokens * 0.8) {
      warnings.push(`Message is large: ${estimatedTokens} tokens (80%+ of max)`);
    }

    // Check message size in bytes
    const messageSize = JSON.stringify(message).length;
    details.sizeBytes = messageSize;
    if (messageSize > this.maxMessageSize) {
      warnings.push(`Message size: ${messageSize} bytes (${this.maxMessageSize} recommended)`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      details
    };
  }

  /**
   * Validate client_content structure
   *
   * @private
   */
  _validateClientContent(clientContent, errors, warnings, details) {
    if (!clientContent.turns || !Array.isArray(clientContent.turns)) {
      errors.push('client_content.turns must be an array');
      return;
    }

    if (clientContent.turns.length === 0) {
      errors.push('client_content.turns is empty');
      return;
    }

    details.turnCount = clientContent.turns.length;

    // Validate each turn
    for (let i = 0; i < clientContent.turns.length; i++) {
      const turn = clientContent.turns[i];

      // Check role
      if (!turn.role || !['user', 'assistant'].includes(turn.role)) {
        errors.push(`Turn ${i}: Invalid role "${turn.role}" (must be "user" or "assistant")`);
      }

      // Check parts
      if (!turn.parts || !Array.isArray(turn.parts) || turn.parts.length === 0) {
        errors.push(`Turn ${i}: parts must be non-empty array`);
        continue;
      }

      // Validate each part
      for (let j = 0; j < turn.parts.length; j++) {
        const part = turn.parts[j];

        // Parts must have either text or inline_data
        if (!part.text && !part.inline_data) {
          errors.push(`Turn ${i}, Part ${j}: Must contain either "text" or "inline_data"`);
        }

        // If text, check it's not empty
        if (part.text && typeof part.text !== 'string') {
          errors.push(`Turn ${i}, Part ${j}: text must be a string`);
        }

        if (part.text && part.text.trim().length === 0) {
          warnings.push(`Turn ${i}, Part ${j}: text is empty or whitespace only`);
        }
      }
    }
  }

  /**
   * Check for contradictory instructions
   *
   * @private
   */
  _checkForContradictions(message, errors, warnings) {
    if (!message.client_content || !message.client_content.turns) {
      return;
    }

    // Extract all text from message
    const allText = message.client_content.turns
      .map(turn => turn.parts?.map(p => p.text || '').join(' '))
      .join(' ')
      .toLowerCase();

    // Check for common contradictions
    const contradictionPairs = [
      ['never say', 'always say'],
      ['do not', 'must be'],
      ['skip this', 'include this'],
      ['ignore', 'follow']
    ];

    for (const [negative, positive] of contradictionPairs) {
      const hasNegative = allText.includes(negative);
      const hasPositive = allText.includes(positive);

      if (hasNegative && hasPositive) {
        warnings.push(`Potential contradiction detected: both "${negative}" and "${positive}" found`);
      }
    }

    // Check for duplicate instructions
    const lines = allText.split('\n').filter(l => l.trim());
    const uniqueLines = new Set(lines.map(l => l.trim()));

    if (uniqueLines.size < lines.length) {
      const duplicateCount = lines.length - uniqueLines.size;
      warnings.push(`${duplicateCount} duplicate instruction lines detected`);
    }
  }

  /**
   * Estimate token count (rough estimate)
   *
   * @private
   */
  _estimateTokenCount(message) {
    let totalText = '';

    if (message.client_content && message.client_content.turns) {
      totalText = message.client_content.turns
        .map(turn => turn.parts?.map(p => p.text || '').join(''))
        .join('');
    }

    if (message.systemInstruction) {
      totalText += message.systemInstruction;
    }

    // Rough estimate: 1.3 characters per token
    return Math.ceil(totalText.length / 1.3);
  }

  /**
   * Validate and log a message (for debugging)
   *
   * @param {Object} message
   * @returns {boolean} - True if valid
   */
  validateAndLog(message) {
    const result = this.validate(message);

    if (result.isValid) {
      console.log(`✅ [VALIDATOR] Message valid`);
      console.log(`   ├─ Turns: ${result.details.turnCount}`);
      console.log(`   ├─ Estimated tokens: ${result.details.estimatedTokens}`);
      console.log(`   └─ Size: ${result.details.sizeBytes} bytes`);
    } else {
      console.error(`❌ [VALIDATOR] Message invalid:`);
      result.errors.forEach(err => console.error(`   ├─ ERROR: ${err}`));
    }

    if (result.warnings.length > 0) {
      console.warn(`⚠️ [VALIDATOR] Warnings:`);
      result.warnings.forEach(warn => console.warn(`   ├─ ${warn}`));
    }

    return result.isValid;
  }

  /**
   * Sanitize a message by removing problematic content
   *
   * @param {Object} message
   * @returns {Object} - Sanitized message
   */
  sanitize(message) {
    if (!message || !message.client_content) {
      return message;
    }

    const sanitized = JSON.parse(JSON.stringify(message)); // Deep copy

    // Remove empty turns
    sanitized.client_content.turns = sanitized.client_content.turns.filter(turn => {
      const hasContent = turn.parts?.some(p => (p.text && p.text.trim()) || p.inline_data);
      return hasContent;
    });

    // Remove empty parts
    sanitized.client_content.turns.forEach(turn => {
      turn.parts = turn.parts?.filter(p => (p.text && p.text.trim()) || p.inline_data);
    });

    return sanitized;
  }

  /**
   * Create a validation report
   *
   * @param {Object} message
   * @returns {string} - Human-readable report
   */
  createReport(message) {
    const result = this.validate(message);

    let report = `
╔════════════════════════════════════════╗
║     Gemini Message Validation Report   ║
╚════════════════════════════════════════╝

Status: ${result.isValid ? '✅ VALID' : '❌ INVALID'}

Details:
  - Turns: ${result.details.turnCount}
  - Estimated Tokens: ${result.details.estimatedTokens}/${this.maxTokens}
  - Size: ${result.details.sizeBytes} bytes

${result.errors.length > 0 ? `Errors (${result.errors.length}):\n${result.errors.map(e => `  ❌ ${e}`).join('\n')}\n` : ''}
${result.warnings.length > 0 ? `Warnings (${result.warnings.length}):\n${result.warnings.map(w => `  ⚠️ ${w}`).join('\n')}` : ''}
    `.trim();

    return report;
  }
}

export default GeminiMessageValidatorService;
