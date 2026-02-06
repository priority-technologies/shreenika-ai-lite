/**
 * Audio Format Converter
 *
 * Handles conversion between Twilio's mulaw 8kHz format
 * and Gemini Live's PCM 16kHz format.
 *
 * Twilio Media Streams: mulaw 8kHz mono, base64 encoded
 * Gemini Live API: PCM 16-bit 16kHz input, 24kHz output
 */

// mulaw decoding table (ITU-T G.711)
const MULAW_DECODE_TABLE = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  const mu = ~i & 0xFF;
  const sign = (mu & 0x80) ? -1 : 1;
  const exponent = (mu >> 4) & 0x07;
  const mantissa = mu & 0x0F;
  const magnitude = ((mantissa << 3) + 0x84) << exponent;
  MULAW_DECODE_TABLE[i] = sign * (magnitude - 0x84);
}

// mulaw encoding helper
const encodeMulaw = (sample) => {
  const MULAW_MAX = 0x1FFF;
  const MULAW_BIAS = 33;

  let sign = (sample >> 8) & 0x80;
  if (sign) sample = -sample;
  if (sample > MULAW_MAX) sample = MULAW_MAX;

  sample += MULAW_BIAS;

  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {}

  const mantissa = (sample >> (exponent + 3)) & 0x0F;
  const encoded = ~(sign | (exponent << 4) | mantissa) & 0xFF;

  return encoded;
};

/**
 * Decode mulaw 8kHz to PCM 16-bit
 * @param {Buffer} mulawBuffer - mulaw encoded audio buffer
 * @returns {Buffer} - PCM 16-bit buffer
 */
export const decodeMulaw = (mulawBuffer) => {
  const pcmBuffer = Buffer.alloc(mulawBuffer.length * 2);

  for (let i = 0; i < mulawBuffer.length; i++) {
    const sample = MULAW_DECODE_TABLE[mulawBuffer[i]];
    pcmBuffer.writeInt16LE(sample, i * 2);
  }

  return pcmBuffer;
};

/**
 * Encode PCM 16-bit to mulaw
 * @param {Buffer} pcmBuffer - PCM 16-bit buffer
 * @returns {Buffer} - mulaw encoded buffer
 */
export const encodeMulawBuffer = (pcmBuffer) => {
  const mulawBuffer = Buffer.alloc(pcmBuffer.length / 2);

  for (let i = 0; i < mulawBuffer.length; i++) {
    const sample = pcmBuffer.readInt16LE(i * 2);
    mulawBuffer[i] = encodeMulaw(sample);
  }

  return mulawBuffer;
};

/**
 * Upsample audio from 8kHz to 16kHz using linear interpolation
 * @param {Buffer} pcm8k - PCM 16-bit at 8kHz
 * @returns {Buffer} - PCM 16-bit at 16kHz
 */
export const upsample8kTo16k = (pcm8k) => {
  const samples8k = pcm8k.length / 2;
  const samples16k = samples8k * 2;
  const pcm16k = Buffer.alloc(samples16k * 2);

  for (let i = 0; i < samples8k; i++) {
    const sample = pcm8k.readInt16LE(i * 2);
    const nextSample = i < samples8k - 1 ? pcm8k.readInt16LE((i + 1) * 2) : sample;

    // Write original sample
    pcm16k.writeInt16LE(sample, i * 4);

    // Write interpolated sample
    const interpolated = Math.round((sample + nextSample) / 2);
    pcm16k.writeInt16LE(interpolated, i * 4 + 2);
  }

  return pcm16k;
};

/**
 * Downsample audio from 24kHz to 8kHz
 * @param {Buffer} pcm24k - PCM 16-bit at 24kHz
 * @returns {Buffer} - PCM 16-bit at 8kHz
 */
export const downsample24kTo8k = (pcm24k) => {
  const samples24k = pcm24k.length / 2;
  const samples8k = Math.floor(samples24k / 3);
  const pcm8k = Buffer.alloc(samples8k * 2);

  for (let i = 0; i < samples8k; i++) {
    // Simple decimation - take every 3rd sample
    // For better quality, use a low-pass filter before decimation
    const sample = pcm24k.readInt16LE(i * 6);
    pcm8k.writeInt16LE(sample, i * 2);
  }

  return pcm8k;
};

/**
 * Convert Twilio mulaw 8kHz base64 to PCM 16kHz for Gemini
 * @param {string} base64Mulaw - Base64 encoded mulaw audio from Twilio
 * @returns {Buffer} - PCM 16-bit 16kHz buffer for Gemini Live
 */
export const twilioToGemini = (base64Mulaw) => {
  // Decode base64 to mulaw buffer
  const mulawBuffer = Buffer.from(base64Mulaw, 'base64');

  // Decode mulaw to PCM 16-bit 8kHz
  const pcm8k = decodeMulaw(mulawBuffer);

  // Upsample to 16kHz for Gemini
  const pcm16k = upsample8kTo16k(pcm8k);

  return pcm16k;
};

/**
 * Convert Gemini PCM 24kHz to Twilio mulaw 8kHz base64
 * @param {Buffer} pcm24k - PCM 16-bit 24kHz buffer from Gemini Live
 * @returns {string} - Base64 encoded mulaw audio for Twilio
 */
export const geminiToTwilio = (pcm24k) => {
  // Downsample from 24kHz to 8kHz
  const pcm8k = downsample24kTo8k(pcm24k);

  // Encode PCM to mulaw
  const mulawBuffer = encodeMulawBuffer(pcm8k);

  // Encode to base64 for Twilio
  return mulawBuffer.toString('base64');
};

/**
 * Create audio chunk message for Twilio Media Streams
 * @param {string} streamSid - The stream SID
 * @param {string} base64Audio - Base64 encoded mulaw audio
 * @returns {object} - Twilio media message object
 */
export const createTwilioMediaMessage = (streamSid, base64Audio) => {
  return {
    event: 'media',
    streamSid,
    media: {
      payload: base64Audio
    }
  };
};

/**
 * Audio buffer accumulator for handling streaming chunks
 */
export class AudioBuffer {
  constructor(targetSampleCount = 160) { // 20ms at 8kHz = 160 samples
    this.buffer = Buffer.alloc(0);
    this.targetBytes = targetSampleCount * 2; // 16-bit samples
  }

  /**
   * Add audio data to buffer
   * @param {Buffer} chunk - Audio chunk
   */
  add(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
  }

  /**
   * Check if buffer has enough data
   * @returns {boolean}
   */
  hasChunk() {
    return this.buffer.length >= this.targetBytes;
  }

  /**
   * Get a chunk from the buffer
   * @returns {Buffer|null}
   */
  getChunk() {
    if (!this.hasChunk()) return null;

    const chunk = this.buffer.slice(0, this.targetBytes);
    this.buffer = this.buffer.slice(this.targetBytes);
    return chunk;
  }

  /**
   * Get remaining buffer data
   * @returns {Buffer}
   */
  flush() {
    const remaining = this.buffer;
    this.buffer = Buffer.alloc(0);
    return remaining;
  }
}

export default {
  decodeMulaw,
  encodeMulawBuffer,
  upsample8kTo16k,
  downsample24kTo8k,
  twilioToGemini,
  geminiToTwilio,
  createTwilioMediaMessage,
  AudioBuffer
};
