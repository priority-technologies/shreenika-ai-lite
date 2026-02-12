/**
 * Speech-to-Text Service
 * Handles streaming speech recognition with pause detection
 * Uses Google Cloud Speech API
 */

import speech from '@google-cloud/speech';
import { getSTTLanguageCode } from './voiceService.js';

const client = new speech.SpeechClient();

export class STTService {
  /**
   * Initialize STT service for an agent
   */
  constructor(agent, options = {}) {
    this.agent = agent;
    this.languageCode = getSTTLanguageCode(agent.voiceProfile?.language || 'en-US');
    this.interruptionSensitivity =
      agent.speechSettings?.interruptionSensitivity || 0.5;

    // Pause threshold: lower sensitivity = longer pause required
    // High sensitivity (0.8) = 200ms, Low sensitivity (0.2) = 500ms
    this.pauseThreshold = 500 - this.interruptionSensitivity * 300;

    this.options = {
      encoding: options.encoding || 'LINEAR16',
      sampleRateHertz: options.sampleRateHertz || 16000,
      maxAlternatives: options.maxAlternatives || 1,
      profanityFilter: options.profanityFilter || false,
      ...options
    };

    this.interimTranscript = '';
    this.finalTranscript = '';
    this.pauseTimer = null;
  }

  /**
   * Process streaming audio and detect pause for response trigger
   */
  async processStream(audioStream) {
    return new Promise((resolve, reject) => {
      const requests = [
        {
          config: {
            encoding: this.options.encoding,
            sampleRateHertz: this.options.sampleRateHertz,
            languageCode: this.languageCode,
            enableAutomaticPunctuation: true,
            maxAlternatives: this.options.maxAlternatives,
            profanityFilter: this.options.profanityFilter,
            useEnhanced: true, // Use enhanced model
            model: 'default'
          },
          audioContent: null // Will be filled by stream
        }
      ];

      let currentRequest = requests[0];
      let requestIndex = 0;
      let isFinal = false;

      // Create the streaming request
      const stream = client.streamingRecognize();

      // Send initial config
      stream.write(requests[0]);

      stream.on('data', (response) => {
        if (!response.results || response.results.length === 0) {
          return;
        }

        const result = response.results[0];

        if (!result.alternatives || result.alternatives.length === 0) {
          return;
        }

        const transcript = result.alternatives[0].transcript;

        if (result.isFinal) {
          // Final transcript - user has finished speaking
          this.finalTranscript += (this.interimTranscript || transcript) + ' ';
          this.interimTranscript = '';
          isFinal = true;

          // Reset pause timer
          this.resetPauseTimer();

          // Trigger pause detection - check if user stopped speaking
          this.triggerPauseDetection(() => {
            stream.end();
            resolve({
              transcript: this.finalTranscript.trim(),
              isFinal: true,
              interimResults: []
            });
          });
        } else {
          // Interim results
          this.interimTranscript = transcript;

          // Return interim results
          resolve({
            transcript: this.interimTranscript,
            isFinal: false,
            confidence: result.alternatives[0].confidence || 0
          });
        }
      });

      stream.on('error', (error) => {
        reject({
          error,
          message: 'Speech-to-text error',
          transcript: this.finalTranscript
        });
      });

      stream.on('end', () => {
        // Stream ended
        resolve({
          transcript: this.finalTranscript.trim(),
          isFinal: true,
          streamEnded: true
        });
      });

      // Pipe audio data to stream
      audioStream.on('data', (chunk) => {
        stream.write({
          audioContent: chunk
        });
      });

      audioStream.on('end', () => {
        stream.end();
      });

      audioStream.on('error', (error) => {
        stream.destroy();
        reject(error);
      });
    });
  }

  /**
   * Detect pause in speech (user stopped talking)
   * Triggers response generation when pause detected
   */
  triggerPauseDetection(callback) {
    // Clear existing timer
    if (this.pauseTimer) {
      clearTimeout(this.pauseTimer);
    }

    // Set new timer for pause detection
    this.pauseTimer = setTimeout(() => {
      if (this.finalTranscript.trim().length > 0) {
        callback();
      }
    }, this.pauseThreshold);
  }

  /**
   * Reset pause timer
   */
  resetPauseTimer() {
    if (this.pauseTimer) {
      clearTimeout(this.pauseTimer);
      this.pauseTimer = null;
    }
  }

  /**
   * Recognize speech from audio buffer (one-shot, not streaming)
   */
  async recognizeAudio(audioBuffer) {
    try {
      const request = {
        config: {
          encoding: this.options.encoding,
          sampleRateHertz: this.options.sampleRateHertz,
          languageCode: this.languageCode,
          enableAutomaticPunctuation: true,
          useEnhanced: true,
          model: 'default'
        },
        audio: {
          content: audioBuffer
        }
      };

      const [response] = await client.recognize(request);

      if (!response.results || response.results.length === 0) {
        return {
          transcript: '',
          confidence: 0,
          error: 'No speech detected'
        };
      }

      const result = response.results[response.results.length - 1];
      const alternative = result.alternatives[0];

      return {
        transcript: alternative.transcript,
        confidence: alternative.confidence,
        isFinal: result.isFinal
      };
    } catch (error) {
      console.error('Error in recognizeAudio:', error);
      return {
        transcript: '',
        confidence: 0,
        error: error.message
      };
    }
  }

  /**
   * Get language code
   */
  getLanguageCode() {
    return this.languageCode;
  }

  /**
   * Get pause threshold in milliseconds
   */
  getPauseThreshold() {
    return this.pauseThreshold;
  }

  /**
   * Get current interim transcript
   */
  getInterimTranscript() {
    return this.interimTranscript;
  }

  /**
   * Get current final transcript
   */
  getFinalTranscript() {
    return this.finalTranscript;
  }

  /**
   * Reset transcript
   */
  reset() {
    this.interimTranscript = '';
    this.finalTranscript = '';
    this.resetPauseTimer();
  }

  /**
   * Get STT configuration info
   */
  getConfig() {
    return {
      languageCode: this.languageCode,
      encoding: this.options.encoding,
      sampleRateHertz: this.options.sampleRateHertz,
      pauseThreshold: this.pauseThreshold,
      interruptionSensitivity: this.interruptionSensitivity
    };
  }
}

export default STTService;
