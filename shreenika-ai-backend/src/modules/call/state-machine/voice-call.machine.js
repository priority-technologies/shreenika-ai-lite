/**
 * Voice Call State Machine (xState)
 *
 * Orchestrates the complete call flow:
 * INIT → WELCOME → LISTENING → HUMAN_SPEAKING → PROCESSING_REQUEST → RESPONDING → RESPONSE_COMPLETE → CALL_ENDING → ENDED
 *
 * Responsibilities:
 * - Manage conversation states
 * - Control filler playback timing
 * - Handle interruption sensitivity
 * - Track call metrics (duration, sentiment, principles applied)
 * - Coordinate Gemini session lifecycle
 */

import { createMachine, assign, sendTo } from 'xstate';
import { stateActions } from './state.actions.js';
import { stateGuards } from './state.guards.js';
import { stateServices } from './state.services.js';

export const voiceCallMachine = createMachine(
  {
    /** @xstate-layout */
    id: 'voiceCallMachine',
    initial: 'INIT',

    context: {
      // Call metadata
      callId: null,
      agentId: null,
      leadPhone: null,
      leadName: null,

      // Audio buffers
      humanAudioBuffer: [],
      geminiAudioBuffer: [],

      // Playback state
      fillerPlaying: false,
      isPlayingWelcome: false,

      // Timing
      callStartTime: null,
      callDuration: 0,
      maxCallDuration: 600, // 10 minutes
      silenceThreshold: 0.008,
      endOnSilenceDuration: 5000, // 5 seconds
      lastAudioTime: null,

      // Settings
      interruptionSensitivity: 0.5, // 0-1.0
      voiceConfig: null,
      agentConfig: null,

      // State tracking
      currentSentiment: null,
      detectedObjection: null,
      selectedPrinciples: [],
      welcomeMessage: null,
      geminiSession: null,
      voiceService: null,

      // Metrics
      metrics: {
        cacheHit: false,
        totalChunksReceived: 0,
        totalChunksSent: 0,
        interruptionsCount: 0,
        fillerDurationMs: 0,
        geminiDurationMs: 0,
        sentimentChanges: [],
        principlesApplied: []
      },

      // Error tracking
      lastError: null,
      errorCount: 0
    },

    states: {
      // ========== INIT STATE ==========
      INIT: {
        entry: ['logStateEntry', 'initializeCallContext'],
        on: {
          SETUP_COMPLETE: {
            target: 'WELCOME',
            cond: 'setupSuccessful',
            actions: ['logTransition']
          },
          SETUP_FAILED: {
            target: 'ENDED',
            actions: ['logError', 'incrementErrorCount']
          }
        },
        after: {
          10000: {
            target: 'ENDED',
            actions: ['logSetupTimeout']
          }
        }
      },

      // ========== WELCOME STATE ==========
      WELCOME: {
        entry: ['logStateEntry', 'playWelcomeMessage'],
        on: {
          WELCOME_FINISHED: {
            target: 'LISTENING',
            actions: ['logTransition']
          }
        },
        after: {
          5000: {
            target: 'LISTENING',
            actions: ['logWelcomeTimeout']
          }
        }
      },

      // ========== LISTENING STATE ==========
      LISTENING: {
        entry: ['logStateEntry', 'resetAudioBuffer', 'startAudioCapture'],
        on: {
          HUMAN_AUDIO_DETECTED: {
            target: 'HUMAN_SPEAKING',
            cond: 'hasAudio',
            actions: ['logTransition']
          },
          CALL_TIMEOUT: {
            target: 'CALL_ENDING',
            cond: 'maxDurationExceeded',
            actions: ['logTimeoutReason']
          },
          MANUAL_HANGUP: {
            target: 'CALL_ENDING',
            actions: ['logManualHangup']
          }
        }
      },

      // ========== HUMAN_SPEAKING STATE ==========
      HUMAN_SPEAKING: {
        entry: ['logStateEntry', 'startRecordingAudio'],
        on: {
          AUDIO_CHUNK: {
            actions: ['addAudioChunk', 'updateLastAudioTime']
          },
          SILENCE_DETECTED: {
            target: 'PROCESSING_REQUEST',
            cond: 'silenceThresholdMet',
            actions: [
              'stopRecordingAudio',
              'analyzeSentimentAndObjection',
              'selectPsychologicalPrinciples',
              'logTransition'
            ]
          },
          MANUAL_HANGUP: {
            target: 'CALL_ENDING',
            actions: ['logManualHangup']
          }
        },
        after: {
          30000: {
            target: 'CALL_ENDING',
            actions: ['logMaxSpeakingDuration']
          }
        }
      },

      // ========== PROCESSING_REQUEST STATE (Filler Playing) ==========
      PROCESSING_REQUEST: {
        entry: ['logStateEntry', 'sendAudioToGemini', 'startFiller', 'recordFillerStartTime'],
        on: {
          GEMINI_RESPONSE_RECEIVED: {
            target: 'RESPONDING',
            cond: 'hasGeminiAudio',
            actions: ['stopFiller', 'calculateFillerDuration', 'logTransition']
          },
          GEMINI_ERROR: {
            target: 'LISTENING',
            actions: ['logGeminiError', 'incrementErrorCount']
          }
        },
        after: {
          15000: {
            target: 'LISTENING',
            actions: ['stopFiller', 'logGeminiTimeout']
          }
        }
      },

      // ========== RESPONDING STATE (Gemini Speaking) ==========
      RESPONDING: {
        entry: [
          'logStateEntry',
          'playGeminiAudio',
          'recordResponsingStartTime',
          'injectPrinciples'
        ],
        on: {
          INTERRUPTION_DETECTED: {
            target: 'LISTENING',
            cond: 'shouldInterruptGemini',
            actions: [
              'stopGemini',
              'logInterruptionDetected',
              'incrementInterruptionCount'
            ]
          },
          GEMINI_FINISHED: {
            target: 'RESPONSE_COMPLETE',
            actions: ['logTransition']
          },
          MANUAL_HANGUP: {
            target: 'CALL_ENDING',
            actions: ['logManualHangup']
          }
        },
        after: {
          60000: {
            target: 'RESPONSE_COMPLETE',
            actions: ['logResponsingTimeout']
          }
        }
      },

      // ========== RESPONSE_COMPLETE STATE ==========
      RESPONSE_COMPLETE: {
        entry: ['logStateEntry', 'stopAllAudio', 'updateMetrics'],
        on: {
          CHECK_CALL_STATUS: [
            {
              target: 'CALL_ENDING',
              cond: 'maxDurationExceeded',
              actions: ['logMaxDurationReached']
            },
            {
              target: 'CALL_ENDING',
              cond: 'endOnSilenceTriggered',
              actions: ['logEndOnSilenceTriggered']
            },
            {
              target: 'LISTENING',
              actions: ['logReturningToListening']
            }
          ]
        },
        after: {
          500: {
            target: 'LISTENING'
          }
        }
      },

      // ========== CALL_ENDING STATE ==========
      CALL_ENDING: {
        entry: [
          'logStateEntry',
          'stopAllAudio',
          'closeGeminiSession',
          'logFinalMetrics',
          'saveCallRecord'
        ],
        type: 'final'
      },

      // ========== ENDED STATE ==========
      ENDED: {
        entry: ['logStateEntry', 'cleanup']
      }
    }
  },
  {
    actions: stateActions,
    guards: stateGuards,
    services: stateServices
  }
);

export default voiceCallMachine;
