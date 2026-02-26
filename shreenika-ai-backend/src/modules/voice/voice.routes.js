import express from 'express';

const router = express.Router();

// Gemini Live built-in voices
const AVAILABLE_VOICES = [
  { name: 'Aoede', value: 'Aoede', description: 'Warm and professional' },
  { name: 'Charon', value: 'Charon', description: 'Deep and authoritative' },
  { name: 'Kore', value: 'Kore', description: 'Clear and articulate' },
  { name: 'Fenrir', value: 'Fenrir', description: 'Energetic and dynamic' },
  { name: 'Leda', value: 'Leda', description: 'Calm and soothing' },
  { name: 'Orus', value: 'Orus', description: 'Professional and neutral' },
  { name: 'Zephyr', value: 'Zephyr', description: 'Young and friendly' }
];

/**
 * GET /voice/voices/available
 * Returns list of available Gemini Live voices
 */
router.get('/voices/available', (req, res) => {
  try {
    res.json({
      success: true,
      voices: AVAILABLE_VOICES,
      count: AVAILABLE_VOICES.length
    });
  } catch (error) {
    console.error('❌ Error fetching voices:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch available voices'
    });
  }
});

export default router;
