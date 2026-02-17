/**
 * Response Enhancer Service
 *
 * Enhances Gemini responses with prosodic fillers to mask latency.
 * Makes pauses feel natural and human-like during AI processing.
 *
 * Strategy:
 * 1. Detect processing delays (>150ms before first response)
 * 2. Inject natural fillers ("Haan...", "So...", "Matlab...") at start
 * 3. Add pause markers for natural speech timing
 * 4. Maintain conversational flow without robotic feel
 */

/**
 * Prosodic filler options by language
 */
const FILLERS = {
  'hinglish': [
    'Haan, ',
    'So, ',
    'Matlab, ',
    'Acha, ',
    'Theek hai, ',
    'Right, ',
    'You know, ',
    'I mean, '
  ],
  'hi-IN': [
    'Haan, ',
    'Bilkul, ',
    'Matlab, ',
    'Acha, ',
    'Theek hai, '
  ],
  'en-IN': [
    'So, ',
    'Right, ',
    'You know, ',
    'I mean, ',
    'Listen, ',
    'See, '
  ],
  'en-US': [
    'So, ',
    'You know, ',
    'Right, ',
    'I mean, ',
    'Well, ',
    'Look, '
  ]
};

/**
 * Pause markers for natural speech timing
 */
const PAUSE_MARKERS = {
  'short': '[PAUSE:200ms]',   // Between clauses
  'medium': '[PAUSE:400ms]',  // Between sentences
  'long': '[PAUSE:700ms]'     // Major breaks
};

/**
 * Inject prosodic filler based on latency
 * @param {string} responseText - Original Gemini response
 * @param {number} latencyMs - Latency in milliseconds
 * @param {string} language - Agent language (hinglish, hi-IN, en-IN, en-US)
 * @returns {string} - Enhanced text with fillers
 */
export function injectProsodyicFiller(responseText, latencyMs = 0, language = 'en-US') {
  if (!responseText || responseText.length === 0) {
    return responseText;
  }

  // Only add fillers if latency is noticeable (>150ms)
  if (latencyMs < 150) {
    return responseText;
  }

  // Get language-specific fillers
  const fillerList = FILLERS[language] || FILLERS['en-US'];

  // Determine filler intensity based on latency
  let shouldAddFiller = false;
  let fillerCount = 0;

  if (latencyMs > 150 && latencyMs < 300) {
    // 150-300ms: 50% chance to add filler
    shouldAddFiller = Math.random() > 0.5;
    fillerCount = 1;
  } else if (latencyMs >= 300 && latencyMs < 500) {
    // 300-500ms: 80% chance, possibly 2 fillers
    shouldAddFiller = Math.random() > 0.2;
    fillerCount = Math.random() > 0.7 ? 2 : 1;
  } else {
    // 500ms+: Always add fillers
    shouldAddFiller = true;
    fillerCount = Math.min(Math.ceil(latencyMs / 300), 3); // Cap at 3
  }

  if (!shouldAddFiller) {
    return responseText;
  }

  // Randomly select fillers
  const selectedFillers = [];
  for (let i = 0; i < fillerCount; i++) {
    const filler = fillerList[Math.floor(Math.random() * fillerList.length)];
    selectedFillers.push(filler);
  }

  // Combine fillers and response
  return selectedFillers.join('') + responseText;
}

/**
 * Add natural pause markers to text
 * Improves perceived naturalness of speech
 */
export function addNaturalPauses(text, characteristics = []) {
  if (!text || text.length === 0) return text;

  // Split by sentences
  const sentences = text.split(/([.!?])/);
  const enhanced = [];

  // Determine pause style based on characteristics
  const isCalm = characteristics.includes('Calm') || characteristics.includes('Thoughtful');
  const isEnthusiastic = characteristics.includes('Enthusiastic') || characteristics.includes('Energetic');

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];

    // Add sentence
    enhanced.push(sentence);

    // Add pause after sentence-ending punctuation
    if (i + 1 < sentences.length && /[.!?]/.test(sentence)) {
      const nextIdx = i + 1;

      if (sentences[nextIdx] === '.') {
        // Period = normal pause
        if (isCalm) {
          enhanced.push(PAUSE_MARKERS['long']);
        } else if (isEnthusiastic) {
          enhanced.push(PAUSE_MARKERS['short']);
        } else {
          enhanced.push(PAUSE_MARKERS['medium']);
        }
      } else if (sentences[nextIdx] === '?' || sentences[nextIdx] === '!') {
        // Question or exclamation = shorter pause
        enhanced.push(PAUSE_MARKERS['short']);
      }

      enhanced.push(sentences[nextIdx]); // Add punctuation
      i++; // Skip next iteration (we processed punctuation)
    }
  }

  return enhanced.join('');
}

/**
 * Expand brief responses with elaboration to use processing time
 * Makes latency feel like thoughtful consideration
 */
export function expandBriefResponse(text, latencyMs = 0, agent = null) {
  // Only expand if response is very short AND latency is high
  const wordCount = text.trim().split(/\s+/).length;
  if (wordCount > 15 || latencyMs < 300) {
    return text;
  }

  // Expansion phrases by language
  const expansions = {
    'hinglish': [
      'Let me think about this... ',
      'Actually, ',
      'More specifically, ',
      'To be honest, ',
      'In my experience, '
    ],
    'hi-IN': [
      'Toh, ',
      'Ek baar, ',
      'Bilkul sach, '
    ],
    'en-IN': [
      'Actually, ',
      'You see, ',
      'Moreover, '
    ],
    'en-US': [
      'Actually, ',
      'To be honest, ',
      'More specifically, '
    ]
  };

  const language = agent?.voiceProfile?.language || 'en-US';
  const expansionList = expansions[language] || expansions['en-US'];
  const expansion = expansionList[Math.floor(Math.random() * expansionList.length)];

  return expansion + text;
}

/**
 * Add breathing points (silence markers) to long responses
 * Prevents run-on sentences, improves clarity
 */
export function addBreathingPoints(text, emotion = 0.5) {
  if (!text || text.length < 100) return text;

  // Split into clauses
  const clauses = text.split(/([,;:])/);
  const enhanced = [];

  let clauseCount = 0;
  const targetBreathInterval = emotion > 0.7 ? 3 : emotion < 0.3 ? 8 : 5; // More breaks for enthusiastic

  for (let i = 0; i < clauses.length; i++) {
    enhanced.push(clauses[i]);

    // Add breathing point every N clauses
    if (i % targetBreathInterval === 0 && i > 0 && i < clauses.length - 1) {
      enhanced.push(PAUSE_MARKERS['short']);
    }
  }

  return enhanced.join('');
}

/**
 * Calculate optimal enhancement strategy for response
 * Combines multiple techniques based on latency and agent settings
 */
export function enhanceResponseForLatency(responseText, latencyMs = 0, agent = null, voiceConfig = null) {
  if (!responseText) return responseText;

  const language = agent?.voiceProfile?.language || 'en-US';
  const emotion = voiceConfig?.characteristics40?.emotions ?? agent?.speechSettings?.emotions ?? 0.5;
  const characteristics = voiceConfig?.characteristics40?.traits ?? agent?.characteristics ?? [];

  let enhanced = responseText;

  // Step 1: Inject prosodic fillers if latency is noticeable
  if (latencyMs > 150) {
    enhanced = injectProsodyicFiller(enhanced, latencyMs, language);
  }

  // Step 2: Expand if response is too brief
  if (latencyMs > 300) {
    enhanced = expandBriefResponse(enhanced, latencyMs, agent);
  }

  // Step 3: Add natural pauses
  enhanced = addNaturalPauses(enhanced, characteristics);

  // Step 4: Add breathing points for long responses
  if (enhanced.length > 150) {
    enhanced = addBreathingPoints(enhanced, emotion);
  }

  return enhanced;
}

/**
 * Detect if response quality might be low (generic/brief)
 * and suggest enhancement
 */
export function shouldEnhanceResponse(responseText, latencyMs = 0) {
  // Response needs enhancement if:
  // 1. Very brief (< 10 words)
  // 2. AND latency is high (> 500ms) - suggests processing effort
  // 3. OR contains filler words ("um", "uh")

  const wordCount = responseText.trim().split(/\s+/).length;
  const hasFillers = /\b(um|uh|err|hmm|like)\b/i.test(responseText);

  return (wordCount < 10 && latencyMs > 500) || hasFillers;
}

/**
 * Format response for audio delivery
 * Removes markdown, formats for TTS
 */
export function formatForAudioDelivery(text) {
  // Remove markdown formatting
  let formatted = text
    .replace(/\*\*(.*?)\*\*/g, '$1') // Bold
    .replace(/__(.*?)__/g, '$1')       // Underscore bold
    .replace(/\*(.*?)\*/g, '$1')       // Italic
    .replace(/_(.*?)_/g, '$1')         // Underscore italic
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1'); // Links

  // Remove code blocks
  formatted = formatted.replace(/```[\s\S]*?```/g, '');
  formatted = formatted.replace(/`([^`]+)`/g, '$1');

  // Clean up whitespace
  formatted = formatted.replace(/\s+/g, ' ').trim();

  return formatted;
}

export default {
  injectProsodyicFiller,
  addNaturalPauses,
  expandBriefResponse,
  addBreathingPoints,
  enhanceResponseForLatency,
  shouldEnhanceResponse,
  formatForAudioDelivery
};
