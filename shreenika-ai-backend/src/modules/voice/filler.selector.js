/**
 * Filler Selector - STEP 6
 * Language-strict selection of verbal fillers
 *
 * Ensures fillers match conversation language
 * Prevents English fillers in Hinglish conversations
 */

const HINGLISH_FILLERS = [
  'Acha', 'Haan', 'Matlab', 'Bilkul', 'Theek hai',
  'Dekho', 'Samajhte ho', 'Suno', 'Basically',
  'Toh', 'Actually bol raha hu', 'Ek min', 'Exactly'
];

const ENGLISH_FILLERS = [
  'Um', 'Uh', 'You know', 'I mean', 'Like',
  'So', 'Actually', 'Basically', 'Right', 'Okay',
  'Let me think', 'Well', 'Now', 'Just'
];

const SPANISH_FILLERS = [
  'Eh', 'O sea', 'Pues', 'Bueno', 'Entonces',
  'Mira', 'Oye', 'Mande', 'Verdad', 'Okay'
];

const FRENCH_FILLERS = [
  'Euh', 'Enfin', 'Quoi', 'Bon', 'Alors',
  'Voilà', 'Donc', 'D\'ailleurs', 'Vous savez'
];

/**
 * Get language-appropriate fillers
 */
export function getLanguageFillers(language) {
  if (!language) return ENGLISH_FILLERS;

  const lang = language.toLowerCase();

  if (lang.includes('hindi') || lang.includes('hinglish') || lang === 'hi-IN') {
    return HINGLISH_FILLERS;
  } else if (lang.includes('spanish') || lang === 'es-US' || lang === 'es-ES') {
    return SPANISH_FILLERS;
  } else if (lang.includes('french') || lang === 'fr-FR') {
    return FRENCH_FILLERS;
  }

  return ENGLISH_FILLERS;
}

/**
 * Select random filler for language
 */
export function selectFiller(language) {
  const fillers = getLanguageFillers(language);
  return fillers[Math.floor(Math.random() * fillers.length)];
}

/**
 * Build filler instruction for system prompt
 */
export function buildFillerInstruction(language) {
  const fillers = getLanguageFillers(language);
  const exampleFillers = fillers.slice(0, 3).join(', ');

  const instructions = {
    'hi-IN': `Use natural Hindi fillers: ${exampleFillers}, etc. Match the conversational style.`,
    'hinglish': `Use Hinglish fillers naturally: ${exampleFillers}. Mix Hindi and English naturally.`,
    'es-US': `Use Spanish fillers: ${exampleFillers}. Sound natural and conversational.`,
    'fr-FR': `Use French fillers: ${exampleFillers}. Maintain French conversational flow.`,
    'en-US': `Use English conversational fillers: ${exampleFillers}. Keep it natural.`,
    'en-GB': `Use British English fillers appropriately. Maintain native-like quality.`
  };

  const key = language ? language.toLowerCase() : 'en-US';
  return instructions[key] || instructions['en-US'];
}

export default {
  HINGLISH_FILLERS,
  ENGLISH_FILLERS,
  SPANISH_FILLERS,
  FRENCH_FILLERS,
  getLanguageFillers,
  selectFiller,
  buildFillerInstruction
};
