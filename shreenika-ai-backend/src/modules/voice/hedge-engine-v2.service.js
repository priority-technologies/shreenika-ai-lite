/**
 * Hedge Engine v2 - Psychology-Aware Audio Filler System
 *
 * CRITICAL IMPROVEMENT: Intelligently selects audio fillers based on:
 * 1. Conversation language (prevents wrong-language fillers)
 * 2. Current psychological principle being used
 * 3. Client profile and conversation stage
 * 4. Liking factors from personal cache
 *
 * Fixes the critical flaw in v1: Random filler selection that destroys
 * conversation flow when wrong language or personality mismatches occur.
 */

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default class HedgeEngineV2 extends EventEmitter {
  constructor(callId, agentId, conversationContext = {}) {
    super();
    this.callId = callId;
    this.agentId = agentId;

    // Filler management
    this.fillerBuffers = [];
    this.fillerMetadata = []; // Array of { buffer, language, principle, clientProfile, likeFactors }
    this.currentFillerIndex = 0;

    // Conversation context for intelligent selection
    this.conversationContext = conversationContext;
    this.detectedLanguage = 'English'; // Will be updated as conversation progresses
    this.currentPrinciple = 'AUTHORITY'; // Will be updated by principle engine
    this.lastSelectedFiller = null;

    // Latency tracking
    this.lastGeminiAudioTime = null;
    this.lastUserSpeechTime = null;
    this.fillerInterval = null;

    // Filler playback control
    this.isPlaying = false;
    this.maxFillerDuration = 2000; // 2 seconds max per filler
    this.fillerPlaybackThreshold = 400; // Play filler after 400ms of silence
    this.silenceDuration = 0;

    // Statistics
    this.fillerPlaybackCount = 0;
    this.fillerSelectionStats = {};
  }

  /**
   * Initialize audio fillers with metadata
   * Static method called during voice service initialization
   *
   * @param {Object} fillerConfig - Configuration with language/principle mappings
   * @returns {Promise<Array>} - Array of filler objects with metadata
   */
  static async initializeFillers(fillerConfig = {}) {
    try {
      const fillersDir = path.join(__dirname, '../../audio/fillers');

      if (!fs.existsSync(fillersDir)) {
        console.warn(`⚠️  Audio fillers directory not found: ${fillersDir}`);
        return [];
      }

      const files = fs.readdirSync(fillersDir).filter(f => f.endsWith('.pcm'));

      if (files.length === 0) {
        console.warn('⚠️  No PCM audio fillers found in fillers directory');
        return [];
      }

      const fillers = [];

      // Load each PCM filler file with metadata
      for (const file of files) {
        try {
          const filePath = path.join(fillersDir, file);
          const buffer = fs.readFileSync(filePath);

          // Parse metadata from filename or config
          // Example: sales_filler_1_en_liking.pcm
          const metadata = this._parseFillerMetadata(file, fillerConfig);

          const durationSecs = (buffer.length / 2) / 16000;

          fillers.push({
            buffer,
            filename: file,
            duration: durationSecs,
            sizeKb: buffer.length / 1024,
            metadata
          });

          console.log(`📻 Loaded filler: ${file} | Languages: ${metadata.languages.join(', ')} | Principles: ${metadata.principles.join(', ')} | (${(buffer.length / 1024).toFixed(1)}KB, ${durationSecs.toFixed(2)}s)`);
        } catch (err) {
          console.error(`❌ Failed to load filler ${file}:`, err.message);
        }
      }

      if (fillers.length > 0) {
        console.log(`✅ Hedge Engine v2 fillers loaded: ${fillers.length} files with metadata`);
      }

      return fillers;
    } catch (err) {
      console.error('❌ Hedge Engine v2 initialization failed:', err.message);
      return [];
    }
  }

  /**
   * Parse metadata from filler filename or config
   *
   * @private
   */
  static _parseFillerMetadata(filename, config = {}) {
    // Default metadata
    let metadata = {
      languages: ['English', 'Hinglish'], // Default: both English and Hinglish
      principles: ['LIKING', 'AUTHORITY', 'RECIPROCITY'], // Default: general-purpose
      clientProfiles: ['ANALYTICAL', 'EMOTIONAL', 'SKEPTICAL', 'DECISION_MAKER'], // Default: all
      likeFactors: ['culture', 'similar_background', 'trustworthy'], // Default liking factors
      tone: 'professional_friendly',
      suitableFor: ['AWARENESS', 'CONSIDERATION', 'DECISION'] // All stages by default
    };

    // Override from config if provided
    if (config[filename]) {
      metadata = { ...metadata, ...config[filename] };
    }

    // Try to parse from filename (e.g., sales_filler_1_en_hi_liking_authority.pcm)
    const nameParts = filename.toLowerCase().replace('.pcm', '').split('_');

    if (nameParts.includes('en')) metadata.languages = ['English'];
    if (nameParts.includes('hi')) metadata.languages = ['Hinglish', 'Hindi'];
    if (nameParts.includes('mr')) metadata.languages = ['Marathi'];

    if (nameParts.includes('liking')) metadata.principles = ['LIKING'];
    if (nameParts.includes('authority')) metadata.principles = ['AUTHORITY'];
    if (nameParts.includes('reciprocity')) metadata.principles = ['RECIPROCITY'];
    if (nameParts.includes('anchoring')) metadata.principles = ['ANCHORING'];

    return metadata;
  }

  /**
   * Update conversation context and detected language
   *
   * @param {Object} conversationContext - Updated context from analyzer
   * @param {String} detectedLanguage - Language detected in conversation
   */
  updateContext(conversationContext, detectedLanguage = null) {
    this.conversationContext = conversationContext;
    if (detectedLanguage) {
      this.detectedLanguage = detectedLanguage;
      console.log(`🌐 Detected conversation language: ${detectedLanguage}`);
    }
  }

  /**
   * Update the current psychological principle being used
   *
   * @param {Object} principleDecision - From PrincipleDecisionEngine.decidePrinciple()
   */
  updatePrinciple(principleDecision) {
    this.currentPrinciple = principleDecision.primary;
    console.log(`🧠 Principle updated: ${this.currentPrinciple}`);
  }

  /**
   * Mark when Gemini audio was last received
   * Used to detect thinking/processing delays
   */
  markGeminiAudioReceived() {
    this.lastGeminiAudioTime = Date.now();
    this.stopFillerPlayback();
  }

  /**
   * Mark when user speech ended
   * Used to detect when user is done talking
   */
  markUserSpeechEnded() {
    this.lastUserSpeechTime = Date.now();
    this.startFillerPlayback();
  }

  /**
   * Start playing fillers during silence
   * Internal method
   */
  startFillerPlayback() {
    if (this.isPlaying || !this.fillerBuffers || this.fillerBuffers.length === 0) {
      return;
    }

    this.isPlaying = true;
    this.silenceDuration = 0;

    // Start checking for silence and play intelligent filler
    this.fillerInterval = setInterval(() => {
      const now = Date.now();
      this.silenceDuration = now - (this.lastGeminiAudioTime || now);

      // If more than threshold ms since last Gemini audio, select and play intelligent filler
      if (this.silenceDuration > this.fillerPlaybackThreshold && this.fillerBuffers.length > 0) {
        const selectedFiller = this._selectIntelligentFiller();

        if (selectedFiller) {
          // Emit filler for playback
          this.emit('playFiller', {
            buffer: selectedFiller.buffer,
            metadata: selectedFiller.metadata,
            reason: `Silence detected (${this.silenceDuration}ms) - Using ${this.currentPrinciple} principle`
          });

          // Track statistics
          this.fillerPlaybackCount++;
          const principle = this.currentPrinciple;
          this.fillerSelectionStats[principle] = (this.fillerSelectionStats[principle] || 0) + 1;
        }
      }
    }, this.maxFillerDuration);
  }

  /**
   * Stop playing fillers
   * Called when real Gemini audio arrives
   */
  stopFillerPlayback() {
    if (this.fillerInterval) {
      clearInterval(this.fillerInterval);
      this.fillerInterval = null;
    }
    this.isPlaying = false;
  }

  /**
   * Intelligently select a filler based on current context
   *
   * CRITICAL LOGIC:
   * 1. Filter fillers that match conversation language
   * 2. Filter fillers that support current principle
   * 3. Filter fillers that match client profile
   * 4. Consider liking factors from personal cache
   * 5. Avoid repeating last filler (variety)
   * 6. Fallback to safest general-purpose filler if no match
   *
   * @private
   * @returns {Object|null} - Selected filler object or null
   */
  _selectIntelligentFiller() {
    if (!this.fillerBuffers || this.fillerBuffers.length === 0) {
      return null;
    }

    // Step 1: Filter by language (CRITICAL - prevents wrong-language fillers)
    let candidates = this.fillerBuffers.filter(filler => {
      if (!filler.metadata || !filler.metadata.languages) {
        return true; // Accept unlabeled fillers as fallback
      }
      return filler.metadata.languages.some(lang =>
        lang.toLowerCase().includes(this.detectedLanguage.toLowerCase()) ||
        (this.detectedLanguage.toLowerCase().includes('hinglish') && lang.includes('Hinglish')) ||
        (this.detectedLanguage.toLowerCase().includes('hindi') && lang.includes('Hinglish'))
      );
    });

    console.log(`🎯 Language filter: ${candidates.length}/${this.fillerBuffers.length} fillers match ${this.detectedLanguage}`);

    // Step 2: Filter by principle (RECOMMENDED - improves persuasion)
    let principleMatches = candidates.filter(filler => {
      if (!filler.metadata || !filler.metadata.principles) {
        return true; // Accept unlabeled fillers
      }
      return filler.metadata.principles.includes(this.currentPrinciple);
    });

    if (principleMatches.length > 0) {
      console.log(`🧠 Principle filter: ${principleMatches.length} fillers support ${this.currentPrinciple}`);
      candidates = principleMatches;
    }

    // Step 3: Filter by client profile (RECOMMENDED)
    const clientProfile = this.conversationContext.clientProfile;
    if (clientProfile) {
      let profileMatches = candidates.filter(filler => {
        if (!filler.metadata || !filler.metadata.clientProfiles) {
          return true;
        }
        return filler.metadata.clientProfiles.includes(clientProfile);
      });

      if (profileMatches.length > 0) {
        console.log(`👤 Profile filter: ${profileMatches.length} fillers suit ${clientProfile}`);
        candidates = profileMatches;
      }
    }

    // Step 4: Avoid repeating last filler
    candidates = candidates.filter(filler => filler.filename !== this.lastSelectedFiller);

    if (candidates.length === 0) {
      // Fallback to safest option
      candidates = this.fillerBuffers;
    }

    // Step 5: Select from candidates (round-robin for variety)
    const selectedFiller = candidates[this.currentFillerIndex % candidates.length];
    this.currentFillerIndex++;
    this.lastSelectedFiller = selectedFiller.filename;

    console.log(`✅ Filler selected: ${selectedFiller.filename} (Language: ${selectedFiller.metadata?.languages?.join('/')}, Principle: ${this.currentPrinciple})`);

    return selectedFiller;
  }

  /**
   * Close and cleanup resources
   */
  close() {
    this.stopFillerPlayback();
    this.fillerBuffers = [];
    this.removeAllListeners();
  }

  /**
   * Get status information
   *
   * @returns {Object}
   */
  getStatus() {
    return {
      callId: this.callId,
      agentId: this.agentId,
      fillerCount: this.fillerBuffers ? this.fillerBuffers.length : 0,
      isPlaying: this.isPlaying,
      timeSinceLastAudio: this.lastGeminiAudioTime ? Date.now() - this.lastGeminiAudioTime : null,
      silenceDuration: this.silenceDuration,
      detectedLanguage: this.detectedLanguage,
      currentPrinciple: this.currentPrinciple,
      fillerPlaybackCount: this.fillerPlaybackCount,
      selectionStats: this.fillerSelectionStats
    };
  }

  /**
   * Get detailed statistics for monitoring
   *
   * @returns {Object}
   */
  getStatistics() {
    return {
      totalFillerPlaybacks: this.fillerPlaybackCount,
      principleUsageDistribution: this.fillerSelectionStats,
      currentLanguage: this.detectedLanguage,
      currentPrinciple: this.currentPrinciple,
      availableFillers: this.fillerBuffers.length,
      lastFillerSelected: this.lastSelectedFiller,
      conversationContext: {
        stage: this.conversationContext.stage,
        clientProfile: this.conversationContext.clientProfile,
        objections: this.conversationContext.objections
      }
    };
  }
}
