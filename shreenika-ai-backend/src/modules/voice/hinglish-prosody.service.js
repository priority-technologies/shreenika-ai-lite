/**
 * Hinglish Prosody Service
 *
 * Implements Hinglish-specific acoustic patterns for authentic Indian English-Hindi blend.
 *
 * Key Features:
 * 1. Rising Statement Intonation: Statements end with pitch rise (warm, involved tone)
 * 2. High Question Peaks: Questions peak at 210-230Hz for curious, engaged tone
 * 3. Schwa Deletion: Remove schwa sounds for natural Hindi-influenced pronunciation
 * 4. First-Syllable Stress: Emphasize first syllable in multi-syllabic words
 * 5. Drop-Rise Emphasis: Natural emphasis on key words with pitch contour
 * 6. Prosodic Fillers: "Haan...", "So...", "Matlab..." mask processing latency
 */

/**
 * Detect and enhance Hinglish phonetic patterns
 * @param {string} text - Response text to analyze
 * @param {Object} prosodyProfile - Calculated prosody profile
 * @returns {Object} - Enhanced text with phonetic guidance
 */
export function enhanceHinglishPhonetics(text, prosodyProfile) {
  // Common Hinglish words that should be preserved
  const hinglishWords = [
    'haan', 'nahi', 'bilkul', 'matlab', 'bhai', 'acha',
    'theek', 'sahi', 'arre', 'yaar', 'dekh', 'bolo',
    'samjha', 'karo', 'kya', 'jao', 'do', 'sun',
    'padhai', 'naukri', 'paise', 'ghar', 'mere'
  ];

  // Schwa deletion rules for common English words in Hinglish
  const schwaMap = {
    'about': 'bout',
    'because': 'bcuz',
    'before': 'bfore',
    'perhaps': 'praps',
    'different': 'diffrent',
    'interest': 'intrest',
    'temperature': 'tmprature',
    'actually': 'actually', // Keep for clarity
    'exactly': 'xactly',
    'together': 'tgthr',
    'memory': 'mmry',
    'every': 'evry',
    'camera': 'cmra'
  };

  let enhancedText = text;

  // Mark Hinglish words for natural prosody (preserve pronunciation)
  hinglishWords.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    enhancedText = enhancedText.replace(regex, `[HINGLISH:${word.toUpperCase()}]`);
  });

  // Note schwa deletion opportunities (for Gemini guidance)
  // Don't actually delete - let Gemini naturally shorten vowels
  Object.entries(schwaMap).forEach(([original, shortened]) => {
    const regex = new RegExp(`\\b${original}\\b`, 'gi');
    enhancedText = enhancedText.replace(regex, `[SCHWA:${original}]`);
  });

  return enhancedText;
}

/**
 * Apply rising intonation pattern for statements
 * Statements should end with pitch rise to sound warm and involved
 */
export function applyRisingIntonation(text, prosodyProfile) {
  // Split by sentences
  const sentences = text.split(/([.!?])/);
  const enhanced = [];

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];

    // Periods at end of statements → rising intonation
    if (i + 1 < sentences.length && sentences[i + 1] === '.') {
      // Statement ending with period - apply rise
      enhanced.push(`${sentence} [RISE:+8st]`); // +8 semitones rise at end
      enhanced.push(sentences[++i]); // Add the period
    }
    // Questions already have natural rise
    else if (i + 1 < sentences.length && sentences[i + 1] === '?') {
      // Question - apply high peak
      const words = sentence.trim().split(/\s+/);
      if (words.length > 0) {
        const lastWord = words[words.length - 1];
        // Apply high peak to last content word before question mark
        enhanced.push(sentence.replace(lastWord, `${lastWord} [PEAK:210-230Hz]`));
      } else {
        enhanced.push(sentence);
      }
      enhanced.push(sentences[++i]); // Add the question mark
    } else {
      enhanced.push(sentence);
    }
  }

  return enhanced.join('');
}

/**
 * Apply first-syllable stress pattern
 * Emphasize first syllable in multi-syllabic words for natural Hinglish rhythm
 */
export function applyFirstSyllableStress(text) {
  // Words with obvious syllable patterns
  const stressPatterns = {
    // Pattern: CVCCVC (stress first)
    'computer': 'COMputer',
    'important': 'IMportant',
    'different': 'DIFferent',
    'hospital': 'HOSpital',
    'business': 'BUSiness',
    'document': 'DOCument',
    'interest': 'INterest',
    'experience': 'EXperience',
    'telephone': 'TELphone',
    'everything': 'EVrything',
    'positive': 'POsitive',
    'understand': 'UNderstand',
    'remember': 'REMember',
    'possible': 'POssible',
    'family': 'FAMily',
    'energy': 'ENergy',
    'quality': 'QUAlity',
    'service': 'SERvice',
    'problem': 'PROblem',
    'system': 'SYStem',
    'information': 'INformation',
    'general': 'GENeral',
    'personal': 'PERsonal',
    'special': 'SPEcial',
    'similar': 'SIMilar',
    'separate': 'SEParate',
    'society': 'soSIety', // Note: Hindi speakers often stress second syllable, but first is more standard
    'government': 'GOVernment'
  };

  let enhanced = text;

  Object.entries(stressPatterns).forEach(([word, stressed]) => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    // Mark primary stress with notation (Gemini will interpret)
    enhanced = enhanced.replace(regex, `[STRESS:${stressed}]`);
  });

  return enhanced;
}

/**
 * Add drop-rise emphasis for key information
 * Natural emphasis pattern where pitch drops then rises (focus/importance)
 */
export function addDropRiseEmphasis(text, keyPhrases = []) {
  let enhanced = text;

  // Default key phrases to emphasize if not provided
  if (keyPhrases.length === 0) {
    keyPhrases = [
      'important', 'special', 'unique', 'exclusive', 'best',
      'free', 'today', 'now', 'immediately', 'opportunity',
      'limited', 'guaranteed', 'absolutely', 'definitely'
    ];
  }

  keyPhrases.forEach(phrase => {
    const regex = new RegExp(`\\b(${phrase})\\b`, 'gi');
    enhanced = enhanced.replace(regex, `[EMPHASIS:$1]`); // Drop-rise emphasis
  });

  return enhanced;
}

/**
 * Add prosodic fillers naturally to mask latency
 * "Haan...", "So...", "Matlab..." during thinking/processing time
 */
export function addProsodyicFillers(text, latencyMs = 0) {
  // Only add fillers if response is being delayed
  if (latencyMs < 100) return text;

  const fillers = [
    'So, ',
    'Haan, ',
    'Matlab, ',
    'You know, ',
    'I mean, ',
    'Right, ',
    'Well, '
  ];

  // 50% chance to add filler to first sentence if latency > 200ms
  if (latencyMs > 200 && Math.random() > 0.5) {
    const filler = fillers[Math.floor(Math.random() * fillers.length)];
    return filler + text;
  }

  return text;
}

/**
 * Generate Hinglish-specific prosody system prompt
 * Comprehensive instructions for Gemini to follow Hinglish patterns
 */
export function generateHinglishProsodyPrompt() {
  return `
HINGLISH PROSODY PATTERNS - Follow these acoustic guidelines for authentic Indian English delivery:

1. RISING STATEMENT INTONATION
   - Statements should END with a PITCH RISE (not fall like American English)
   - This conveys warmth, involvement, and natural conversation
   - Example: "That's a great question" (pitch rises at end, not falls)
   - Effect: Sounds warm, friendly, engaged rather than formal

2. HIGH PITCH QUESTIONS
   - Questions peak at 210-230Hz on the key word
   - Sound curious, engaged, and interested
   - Maintain energy through the question
   - Example: "What would you LIKE?" (LIKE peaks at 220Hz)

3. FIRST SYLLABLE STRESS
   - Emphasize first syllable in multi-syllabic words
   - Example: "COMputer" not "comPUter"
   - Example: "IMportant" not "imPORtant"
   - This matches native Hindi stress patterns

4. SCHWA DELETION
   - Naturally shorten vowel sounds in unstressed syllables
   - "about" → "bout", "because" → "bcuz", "different" → "diffrent"
   - Creates natural, flowing Hinglish pronunciation
   - Don't remove - just naturally shorten the vowel sound

5. DROP-RISE EMPHASIS
   - Important information: Drop pitch, then RISE (natural focus)
   - Example: "This is absolutely CRUCIAL" (emphasis on CRUCIAL with drop-rise)
   - Sounds more natural than American peak-accent pattern

6. PROSODIC FILLERS
   - Use natural fillers while "thinking": "Haan...", "So...", "Matlab..."
   - Never use American fillers like "um" or "uh" alone
   - Makes latency feel natural and human-like
   - Example: "Haan, let me think about that..." (sounds natural, not robotic)

7. RHYTHM AND TIMING
   - Shorter pauses between phrases (200-400ms)
   - Longer pauses at major sentence boundaries (500-800ms)
   - Natural speech overlap acceptable (very slight)
   - Maintains conversational momentum

8. TONE AND CHARACTER
   - Always sound involved, never distant or mechanical
   - Show genuine interest in the caller's needs
   - Warmth > Formality in all interactions
   - Be conversational, not transactional

REMEMBER: These patterns should feel natural and automatic - not forced or affected.
The goal is to sound like a warm, engaged human Indian who speaks English daily.
`;
}

/**
 * Enhance text for Hinglish delivery
 * Combines all patterns for authentic Hinglish prosody
 */
export function enhanceTextForHinglish(text, prosodyProfile = {}) {
  let enhanced = text;

  // Step 1: Mark Hinglish-specific words
  enhanced = enhanceHinglishPhonetics(enhanced, prosodyProfile);

  // Step 2: Apply rising intonation to statements
  enhanced = applyRisingIntonation(enhanced, prosodyProfile);

  // Step 3: Apply first-syllable stress
  enhanced = applyFirstSyllableStress(enhanced);

  // Step 4: Add drop-rise emphasis for key phrases
  enhanced = addDropRiseEmphasis(enhanced);

  // Step 5: Add fillers if needed for latency
  const latencyMs = prosodyProfile.latencyMs || 0;
  enhanced = addProsodyicFillers(enhanced, latencyMs);

  return enhanced;
}

export default {
  enhanceHinglishPhonetics,
  applyRisingIntonation,
  applyFirstSyllableStress,
  addDropRiseEmphasis,
  addProsodyicFillers,
  generateHinglishProsodyPrompt,
  enhanceTextForHinglish
};
