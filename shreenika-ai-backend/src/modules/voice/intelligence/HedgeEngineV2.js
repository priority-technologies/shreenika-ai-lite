/**
 * HedgeEngineV2.js
 * ============================================================
 * Intelligent Filler Selection System
 * 5-Step Algorithm: Language → Principle → Profile → Variety → Select
 * Fills silence gaps (>400ms) with context-aware audio
 *
 * Based on: SMART_AGENT_BLUEPRINT.md (Version 2.0)
 * Author: Claude Code
 * Date: 2026-02-23
 */

const fs = require('fs').promises;
const path = require('path');

class HedgeEngineV2 {
  constructor() {
    this.fillers = []; // All loaded fillers
    this.fillerIndex = {}; // Indexed by language for fast lookup
    this.fillerMetadataPath = path.join(__dirname, '../../audio/fillers/filler_metadata.json');
  }

  /**
   * Load filler metadata index on initialization
   */
  async loadFillerIndex() {
    console.log(`\n   📂 Loading filler metadata index...`);

    try {
      // Read filler metadata JSON
      const metadataContent = await fs.readFile(this.fillerMetadataPath, 'utf-8');
      this.fillers = JSON.parse(metadataContent);

      console.log(`      ✅ Loaded ${this.fillers.length} fillers`);

      // Build language-based index for fast lookup
      this._buildIndex();

      // Log summary
      this._logFillerSummary();

    } catch (error) {
      console.warn(`⚠️  Could not load filler metadata: ${error.message}`);
      console.log(`      Creating empty filler index...`);
      this.fillers = [];
      this.fillerIndex = {};
    }
  }

  /**
   * Build index for fast lookup
   * Index structure: { language: [fillers], principle: [fillers], etc. }
   */
  _buildIndex() {
    this.fillerIndex = {
      byLanguage: {},
      byPrinciple: {},
      byProfile: {}
    };

    // Index by language
    this.fillers.forEach(filler => {
      filler.metadata.languages.forEach(lang => {
        if (!this.fillerIndex.byLanguage[lang]) {
          this.fillerIndex.byLanguage[lang] = [];
        }
        this.fillerIndex.byLanguage[lang].push(filler);
      });

      // Index by principle
      filler.metadata.principles.forEach(principle => {
        if (!this.fillerIndex.byPrinciple[principle]) {
          this.fillerIndex.byPrinciple[principle] = [];
        }
        this.fillerIndex.byPrinciple[principle].push(filler);
      });

      // Index by profile
      filler.metadata.clientProfiles.forEach(profile => {
        if (!this.fillerIndex.byProfile[profile]) {
          this.fillerIndex.byProfile[profile] = [];
        }
        this.fillerIndex.byProfile[profile].push(filler);
      });
    });
  }

  /**
   * Log filler inventory summary
   */
  _logFillerSummary() {
    console.log(`\n      📊 Filler Inventory Summary:`);

    // By language
    console.log(`         Languages:`);
    for (const [lang, fillers] of Object.entries(this.fillerIndex.byLanguage)) {
      console.log(`            - ${lang}: ${fillers.length} fillers`);
    }

    // By principle
    console.log(`         Principles:`);
    for (const [principle, fillers] of Object.entries(this.fillerIndex.byPrinciple)) {
      console.log(`            - ${principle}: ${fillers.length} fillers`);
    }
  }

  /**
   * Main filler selection algorithm
   * 5-Step: Language → Principle → Profile → Variety → Select Best
   */
  selectFiller({ language, principle, profile, usedFillers }) {
    console.log(`\n      🎯 Hedge Engine V2 - Filler Selection`);
    console.log(`         Input: Language=${language}, Principle=${principle}, Profile=${profile}`);

    // ============================================================
    // STEP 1: LANGUAGE FILTER (CRITICAL)
    // ============================================================
    let candidates = this._filterByLanguage(language);
    console.log(`         ✓ Step 1 (Language): ${candidates.length} candidates`);

    if (candidates.length === 0) {
      console.warn(`         ⚠️  No fillers for language ${language}, falling back to English`);
      candidates = this._filterByLanguage('English');
    }

    if (candidates.length === 0) {
      console.error(`         ❌ NO FILLERS AVAILABLE!`);
      return this._createFallbackFiller();
    }

    // ============================================================
    // STEP 2: PRINCIPLE FILTER (MANDATORY)
    // ============================================================
    const principleMatches = candidates.filter(f =>
      f.metadata.principles.includes(principle)
    );

    if (principleMatches.length > 0) {
      candidates = principleMatches;
      console.log(`         ✓ Step 2 (Principle): ${candidates.length} candidates`);
    } else {
      console.log(`         ⚠️  Step 2 (Principle): No matches, keeping all language-filtered`);
      // Don't eliminate - keep all from language filter
    }

    // ============================================================
    // STEP 3: PROFILE FILTER (SOFT FILTER)
    // ============================================================
    const profileMatches = candidates.filter(f =>
      f.metadata.clientProfiles.includes(profile)
    );

    if (profileMatches.length > 0) {
      candidates = profileMatches;
      console.log(`         ✓ Step 3 (Profile): ${candidates.length} candidates`);
    } else {
      console.log(`         ⚠️  Step 3 (Profile): No matches, keeping previous`);
      // Soft filter - don't eliminate if no matches
    }

    // ============================================================
    // STEP 4: VARIETY FILTER
    // ============================================================
    const unusedFillers = candidates.filter(f =>
      !usedFillers.includes(f.filename)
    );

    if (unusedFillers.length > 0) {
      candidates = unusedFillers;
      console.log(`         ✓ Step 4 (Variety): ${candidates.length} candidates (unused)`);
    } else {
      console.log(`         ⚠️  Step 4 (Variety): All fillers used, allowing repetition`);
      // Allow repetition if all have been used
    }

    // ============================================================
    // STEP 5: SELECT BEST BY EFFECTIVENESS SCORE
    // ============================================================
    candidates.sort((a, b) => {
      const scoreA = a.metadata.effectiveness.completionRate *
                     a.metadata.effectiveness.principleReinforcement;
      const scoreB = b.metadata.effectiveness.completionRate *
                     b.metadata.effectiveness.principleReinforcement;
      return scoreB - scoreA; // Descending order (highest first)
    });

    const selected = candidates[0];

    console.log(`         ✅ Selected: ${selected.filename}`);
    console.log(`            Duration: ${selected.duration}s`);
    console.log(`            Effectiveness: ${(selected.metadata.effectiveness.completionRate * 100).toFixed(0)}%`);

    return selected;
  }

  // ============================================================
  // FILTERING STEPS
  // ============================================================

  /**
   * Step 1: Filter by language
   */
  _filterByLanguage(language) {
    const fillers = this.fillerIndex.byLanguage[language] || [];

    // If no exact match, try fallback
    if (fillers.length === 0 && language !== 'English') {
      // Try Hinglish as fallback for Indian languages
      if (['Marathi', 'Hindi', 'Tamil', 'Telugu', 'Kannada'].includes(language)) {
        return this.fillerIndex.byLanguage['Hinglish'] || [];
      }
    }

    return fillers;
  }

  /**
   * Step 2: Filter by principle (referenced but integrated above)
   */
  _filterByPrinciple(candidates, principle) {
    return candidates.filter(f =>
      f.metadata.principles.includes(principle)
    );
  }

  /**
   * Step 3: Filter by profile (referenced but integrated above)
   */
  _filterByProfile(candidates, profile) {
    return candidates.filter(f =>
      f.metadata.clientProfiles.includes(profile)
    );
  }

  /**
   * Step 4: Filter out recently used (referenced but integrated above)
   */
  _filterByVariety(candidates, usedFillers) {
    return candidates.filter(f =>
      !usedFillers.includes(f.filename)
    );
  }

  // ============================================================
  // AUDIO LOADING
  // ============================================================

  /**
   * Load filler audio file into memory
   * Returns: { id, audioData, duration, metadata }
   */
  async loadFillerAudio(filler) {
    try {
      const audioPath = path.join(__dirname, `../../audio/fillers/${filler.filename}`);
      const audioData = await fs.readFile(audioPath);

      return {
        id: filler.filename,
        audioData: audioData,
        duration: filler.duration,
        metadata: filler.metadata
      };

    } catch (error) {
      console.error(`❌ Failed to load filler audio: ${error.message}`);
      return null;
    }
  }

  /**
   * Pre-load multiple fillers into memory
   * Called during IDLE state to optimize latency
   */
  async preloadFillers(count = 5) {
    console.log(`   ⏳ Pre-loading top ${count} fillers...`);

    const topFillers = this.fillers
      .sort((a, b) =>
        (b.metadata.effectiveness.completionRate *
         b.metadata.effectiveness.principleReinforcement) -
        (a.metadata.effectiveness.completionRate *
         a.metadata.effectiveness.principleReinforcement)
      )
      .slice(0, count);

    const preloadedCache = {};

    for (const filler of topFillers) {
      const loaded = await this.loadFillerAudio(filler);
      if (loaded) {
        preloadedCache[filler.filename] = loaded;
      }
    }

    console.log(`   ✅ Pre-loaded ${Object.keys(preloadedCache).length} fillers`);
    return preloadedCache;
  }

  // ============================================================
  // FALLBACK & UTILITIES
  // ============================================================

  /**
   * Create fallback filler if none available
   */
  _createFallbackFiller() {
    return {
      filename: 'fallback_filler.pcm',
      duration: 2.0,
      metadata: {
        languages: ['English'],
        principles: ['LIKING'],
        clientProfiles: ['RELATIONSHIP_SEEKER'],
        tone: 'professional_warm',
        content_summary: 'Generic thinking pause',
        effectiveness: {
          completionRate: 0.5,
          sentimentLift: 0.3,
          principleReinforcement: 0.3
        }
      }
    };
  }

  /**
   * Get filler statistics for logging
   */
  getFillerStats() {
    return {
      totalFillers: this.fillers.length,
      languages: Object.keys(this.fillerIndex.byLanguage),
      principles: Object.keys(this.fillerIndex.byPrinciple),
      profiles: Object.keys(this.fillerIndex.byProfile),
      averageEffectiveness: this.fillers.length > 0
        ? (this.fillers.reduce((sum, f) => sum + f.metadata.effectiveness.completionRate, 0) / this.fillers.length)
        : 0
    };
  }

  /**
   * Reset filler tracking
   */
  reset() {
    // Reset any per-call state if needed
  }
}

module.exports = HedgeEngineV2;
