/**
 * Codec Negotiation Service
 * Gap 11: Validate audio codec compatibility between provider and Gemini
 *
 * Supports:
 * - SansPBX: PCM Linear 44100Hz → 16kHz for Gemini
 * - Twilio: mulaw 8kHz → PCM 16kHz for Gemini
 * - Gemini Live: Outputs 24kHz PCM
 */

export class CodecNegotiator {
  constructor() {
    this.supportedCodecs = {
      'PCM16': { sampleRate: 16000, bitDepth: 16, format: 'PCM', encoding: 'linear' },
      'PCM24': { sampleRate: 24000, bitDepth: 16, format: 'PCM', encoding: 'linear' },
      'MULAW': { sampleRate: 8000, bitDepth: 8, format: 'mulaw', encoding: 'mulaw' },
      'OPUS': { sampleRate: 48000, bitDepth: 16, format: 'OPUS', encoding: 'opus' },
      'G711': { sampleRate: 8000, bitDepth: 8, format: 'G.711', encoding: 'ulaw' }
    };

    this.providerCodecs = {
      'SansPBX': {
        input: { codec: 'PCM16', sampleRate: 44100, format: 'PCM Linear 44100Hz' },
        output: { codec: 'PCM24', sampleRate: 44100, format: 'PCM Linear 44100Hz' },
        geminiRequired: 'PCM16:16000'
      },
      'Twilio': {
        input: { codec: 'MULAW', sampleRate: 8000, format: 'mulaw 8kHz' },
        output: { codec: 'MULAW', sampleRate: 8000, format: 'mulaw 8kHz' },
        geminiRequired: 'PCM16:16000'
      },
      'Gemini': {
        input: { codec: 'PCM16', sampleRate: 16000, format: 'PCM 16kHz' },
        output: { codec: 'PCM24', sampleRate: 24000, format: 'PCM 24kHz' }
      }
    };
  }

  /**
   * Validate codec compatibility for a call
   * @param {string} provider - Provider name ('SansPBX' or 'Twilio')
   * @param {object} audioChunk - Audio data to validate
   * @returns {object} - { valid: boolean, codec: string, sampleRate: number, error: string }
   */
  validateCodec(provider, audioChunk) {
    if (!this.providerCodecs[provider]) {
      return {
        valid: false,
        codec: null,
        sampleRate: null,
        error: `Unknown provider: ${provider}`
      };
    }

    const providerConfig = this.providerCodecs[provider];
    const expectedCodec = providerConfig.input.codec;
    const expectedSampleRate = providerConfig.input.sampleRate;

    // Basic validation: check if buffer looks like valid audio
    if (!Buffer.isBuffer(audioChunk) || audioChunk.length === 0) {
      return {
        valid: false,
        codec: expectedCodec,
        sampleRate: expectedSampleRate,
        error: 'Empty or invalid audio buffer'
      };
    }

    // For 16-bit PCM, buffer length should be even (2 bytes per sample)
    if (expectedCodec === 'PCM16' && audioChunk.length % 2 !== 0) {
      return {
        valid: false,
        codec: expectedCodec,
        sampleRate: expectedSampleRate,
        error: `Invalid PCM16 buffer length (odd bytes): ${audioChunk.length}`
      };
    }

    return {
      valid: true,
      codec: expectedCodec,
      sampleRate: expectedSampleRate,
      bufferSize: audioChunk.length,
      expectedSamples: Math.floor(audioChunk.length / 2),
      error: null
    };
  }

  /**
   * Get conversion path from provider to Gemini
   * @param {string} provider - Provider name
   * @returns {object} - Conversion steps and requirements
   */
  getConversionPath(provider) {
    const config = this.providerCodecs[provider];
    if (!config) {
      return { error: `Unknown provider: ${provider}` };
    }

    const steps = [];
    let currentCodec = config.input.codec;
    let currentSampleRate = config.input.sampleRate;

    // For SansPBX: 44100 Hz → 16000 Hz
    if (provider === 'SansPBX') {
      steps.push({
        step: 1,
        from: `PCM 44100Hz`,
        to: `PCM 16000Hz`,
        operation: 'downsample44100to16k',
        ratio: 16000 / 44100
      });
      currentSampleRate = 16000;
    }

    // For Twilio: mulaw 8kHz → PCM 16kHz
    if (provider === 'Twilio') {
      steps.push({
        step: 1,
        from: `mulaw 8kHz`,
        to: `PCM 8kHz`,
        operation: 'decodeMulaw',
        ratio: 1
      });
      steps.push({
        step: 2,
        from: `PCM 8kHz`,
        to: `PCM 16kHz`,
        operation: 'upsample8kTo16k',
        ratio: 2
      });
      currentSampleRate = 16000;
    }

    return {
      provider,
      inputCodec: config.input.codec,
      inputSampleRate: config.input.sampleRate,
      outputCodec: 'PCM16',
      outputSampleRate: 16000,
      conversionSteps: steps,
      requiredFunctions: steps.map(s => s.operation),
      verified: true
    };
  }

  /**
   * Get output conversion path from Gemini to provider
   * @param {string} provider - Provider name
   * @returns {object} - Conversion requirements
   */
  getOutputConversionPath(provider) {
    const config = this.providerCodecs[provider];
    if (!config) {
      return { error: `Unknown provider: ${provider}` };
    }

    const steps = [];

    // From Gemini 24kHz to provider format
    if (provider === 'SansPBX') {
      steps.push({
        step: 1,
        from: `PCM 24kHz (Gemini output)`,
        to: `PCM 44100Hz (SansPBX input)`,
        operation: 'upsample24kTo44100',
        ratio: 44100 / 24000,
        encoding: 'base64'
      });
    }

    if (provider === 'Twilio') {
      steps.push({
        step: 1,
        from: `PCM 24kHz (Gemini output)`,
        to: `PCM 8kHz`,
        operation: 'downsample24kTo8k',
        ratio: 8000 / 24000
      });
      steps.push({
        step: 2,
        from: `PCM 8kHz`,
        to: `mulaw 8kHz`,
        operation: 'encodeMulawBuffer',
        ratio: 1,
        encoding: 'base64'
      });
    }

    return {
      provider,
      geminiInput: 'PCM24:24000',
      providerOutput: config.output,
      conversionSteps: steps,
      requiredFunctions: steps.map(s => s.operation),
      verified: true
    };
  }

  /**
   * Log codec negotiation status
   * @param {string} provider - Provider name
   */
  logNegotiationStatus(provider) {
    const inputPath = this.getConversionPath(provider);
    const outputPath = this.getOutputConversionPath(provider);

    console.log(`📊 CODEC NEGOTIATION - ${provider}:`);
    console.log(`   ├─ INPUT PATH:`);
    inputPath.conversionSteps.forEach(step => {
      console.log(`   │  ├─ Step ${step.step}: ${step.from} → ${step.to}`);
      console.log(`   │  │  └─ Operation: ${step.operation} (ratio: ${step.ratio.toFixed(3)})`);
    });
    console.log(`   └─ OUTPUT PATH:`);
    outputPath.conversionSteps.forEach(step => {
      console.log(`      ├─ Step ${step.step}: ${step.from} → ${step.to}`);
      console.log(`      │  └─ Operation: ${step.operation} (ratio: ${step.ratio.toFixed(3)})`);
    });
  }
}

export default CodecNegotiator;
