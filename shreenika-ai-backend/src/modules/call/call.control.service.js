/**
 * Call Control Service
 * Enforces call settings: duration limits, silence detection, voicemail handling
 * Priority: 40% of Agent Voice System
 */

import Call from './call.model.js';
import { io } from '../../server.js';

export class CallControlService {
  constructor(callId, agentId, callSettings = {}) {
    this.callId = callId;
    this.agentId = agentId;
    this.callSettings = callSettings;
    this.startTime = Date.now();
    this.silenceStartTime = null;
    this.silenceDuration = 0;
    this.isActive = true;

    // Default settings
    this.maxCallDuration = callSettings.maxCallDuration || 3600; // 1 hour
    this.silenceDetectionMs = callSettings.silenceDetectionMs || 15000; // 15 seconds
    this.voicemailDetection = callSettings.voicemailDetection !== false; // default true
    this.voicemailAction = callSettings.voicemailAction || 'hang-up'; // 'hang-up', 'leave-message', 'transfer'
    this.voicemailMessage = callSettings.voicemailMessage || '';

    console.log(`📞 CallControl: Initialized for call ${callId}`);
    console.log(`   Max Duration: ${this.maxCallDuration}s`);
    console.log(`   Silence Detection: ${this.silenceDetectionMs}ms`);
    console.log(`   Voicemail Detection: ${this.voicemailDetection}`);
  }

  /**
   * Check if call duration exceeded
   */
  isDurationExceeded() {
    const elapsedMs = Date.now() - this.startTime;
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    const exceeded = elapsedSeconds > this.maxCallDuration;

    if (exceeded && this.isActive) {
      console.log(`⏱️  CallControl: Max duration (${this.maxCallDuration}s) exceeded. Elapsed: ${elapsedSeconds}s`);
    }

    return exceeded;
  }

  /**
   * Get remaining call time in seconds
   */
  getRemainingTime() {
    const elapsedMs = Date.now() - this.startTime;
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    const remaining = Math.max(0, this.maxCallDuration - elapsedSeconds);
    return remaining;
  }

  /**
   * Monitor silence - call this on each audio chunk
   * audioLevel: 0-100 (0=silent, 100=loud)
   */
  updateSilenceDetection(audioLevel) {
    const SILENCE_THRESHOLD = 10; // Audio level below 10 = silence

    if (audioLevel < SILENCE_THRESHOLD) {
      // Audio is silent
      if (this.silenceStartTime === null) {
        this.silenceStartTime = Date.now();
      }

      this.silenceDuration = Date.now() - this.silenceStartTime;

      // Check if silence exceeded threshold
      if (this.silenceDuration > this.silenceDetectionMs) {
        console.log(`🔇 CallControl: Silence detected for ${this.silenceDuration}ms (threshold: ${this.silenceDetectionMs}ms)`);
        return {
          silenceDetected: true,
          silenceDuration: this.silenceDuration,
          action: 'end-call'
        };
      }
    } else {
      // Audio is not silent - reset
      if (this.silenceStartTime !== null) {
        console.log(`🔊 CallControl: Audio detected after ${this.silenceDuration}ms silence. Silence reset.`);
      }
      this.silenceStartTime = null;
      this.silenceDuration = 0;
    }

    return { silenceDetected: false };
  }

  /**
   * Detect voicemail (robotic voice detection)
   * Uses audio characteristics: flat pitch, monotone, standard duration
   */
  detectVoicemail(transcript, audioMetrics = {}) {
    if (!this.voicemailDetection) return { isVoicemail: false };

    // Heuristic 1: Check for common voicemail phrases
    const voicemailPhrases = [
      'leave a message',
      'voicemail',
      'mailbox',
      'message after',
      'not available',
      'unavailable',
      'call back',
      'try again later',
      'goodbye',
      'thank you for calling'
    ];

    const transcriptLower = (transcript || '').toLowerCase();
    const hasVoicemailPhrase = voicemailPhrases.some(phrase => transcriptLower.includes(phrase));

    // Heuristic 2: Check audio metrics for robotic voice
    const isRoboticVoice = audioMetrics.flatness > 0.8 && audioMetrics.variation < 5;

    // Heuristic 3: If no human speech detected for N seconds = voicemail
    const noHumanSpeech = audioMetrics.humanSpeechDetected === false;

    const isVoicemail = hasVoicemailPhrase || isRoboticVoice || noHumanSpeech;

    if (isVoicemail) {
      console.log(`📧 CallControl: Voicemail detected`);
      console.log(`   Phrase match: ${hasVoicemailPhrase}`);
      console.log(`   Robotic voice: ${isRoboticVoice}`);
      console.log(`   No human speech: ${noHumanSpeech}`);
    }

    return {
      isVoicemail,
      confidence: this.calculateVoicemailConfidence(hasVoicemailPhrase, isRoboticVoice, noHumanSpeech)
    };
  }

  /**
   * Calculate voicemail detection confidence (0-1)
   */
  calculateVoicemailConfidence(phrase, robotic, noSpeech) {
    let confidence = 0;
    if (phrase) confidence += 0.4;
    if (robotic) confidence += 0.3;
    if (noSpeech) confidence += 0.3;
    return Math.min(1, confidence);
  }

  /**
   * Handle voicemail action
   */
  async handleVoicemail(callId) {
    console.log(`🎬 CallControl: Handling voicemail with action: ${this.voicemailAction}`);

    switch (this.voicemailAction) {
      case 'hang-up':
        console.log(`   Action: Hanging up call`);
        await this.endCall(callId, 'voicemail-detected-hangup');
        return { action: 'hang-up', success: true };

      case 'leave-message':
        console.log(`   Action: Playing voicemail message`);
        return {
          action: 'leave-message',
          message: this.voicemailMessage,
          success: true
        };

      case 'transfer':
        console.log(`   Action: Attempting to transfer (placeholder)`);
        return {
          action: 'transfer',
          success: false, // Transfer logic would go here
          error: 'Transfer not yet implemented'
        };

      default:
        return { action: 'unknown', success: false };
    }
  }

  /**
   * Get call status with remaining time and warnings
   */
  getCallStatus() {
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const remaining = this.getRemainingTime();
    const percentUsed = Math.round((elapsed / this.maxCallDuration) * 100);

    // Warning thresholds
    let warning = null;
    if (remaining < 60) warning = 'critical'; // Less than 1 minute
    else if (remaining < 300) warning = 'warning'; // Less than 5 minutes
    else if (remaining < 600) warning = 'info'; // Less than 10 minutes

    return {
      callId: this.callId,
      elapsedSeconds: elapsed,
      remainingSeconds: remaining,
      maxDuration: this.maxCallDuration,
      percentUsed,
      warning,
      silenceDuration: this.silenceDuration,
      isActive: this.isActive
    };
  }

  /**
   * Send remaining time update to user (via WebSocket)
   */
  broadcastCallStatus() {
    const status = this.getCallStatus();

    // Emit to frontend via Socket.IO
    io.to(this.callId).emit('call:status-update', status);

    // Log warnings
    if (status.warning === 'critical') {
      console.log(`⚠️  CRITICAL: Call ending in ${status.remainingSeconds} seconds`);
    } else if (status.warning === 'warning') {
      console.log(`⚠️  WARNING: ${status.remainingSeconds} seconds remaining`);
    }

    return status;
  }

  /**
   * End call and save to database
   */
  async endCall(callId, reason = 'completed') {
    if (!this.isActive) return;

    this.isActive = false;
    const elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);

    console.log(`🛑 CallControl: Ending call ${callId}`);
    console.log(`   Reason: ${reason}`);
    console.log(`   Duration: ${elapsedSeconds}s`);

    try {
      // Update call in database
      await Call.findByIdAndUpdate(
        callId,
        {
          status: 'COMPLETED',
          endReason: reason,
          durationSeconds: elapsedSeconds,
          completedAt: new Date()
        },
        { new: true }
      );

      // Emit event to frontend
      io.to(callId).emit('call:ended', {
        callId,
        reason,
        duration: elapsedSeconds
      });

      console.log(`✅ CallControl: Call ended successfully`);
      return { success: true, duration: elapsedSeconds, reason };
    } catch (error) {
      console.error(`❌ CallControl: Error ending call:`, error.message);
      throw error;
    }
  }

  /**
   * Get recommendations for system prompt injection
   * (Tell Gemini about remaining time to encourage wrap-up)
   */
  getSystemPromptInjection() {
    const remaining = this.getRemainingTime();

    if (remaining < 60) {
      return `IMPORTANT: You have less than 1 minute remaining in this call. Wrap up quickly, summarize the key points, and ask for confirmation before ending.`;
    } else if (remaining < 300) {
      return `REMINDER: You have approximately ${Math.round(remaining / 60)} minutes remaining. Start wrapping up the conversation.`;
    } else if (remaining < 600) {
      return `INFO: You have approximately ${Math.round(remaining / 60)} minutes remaining in this call.`;
    }

    return ''; // No injection needed
  }
}

/**
 * Analyze audio chunk for silence detection
 * Returns audio level 0-100
 */
export function analyzeAudioLevel(audioBuffer) {
  if (!audioBuffer || audioBuffer.length === 0) return 0;

  // Calculate RMS (Root Mean Square) for audio level
  let sum = 0;
  for (let i = 0; i < audioBuffer.length; i++) {
    sum += audioBuffer[i] * audioBuffer[i];
  }

  const rms = Math.sqrt(sum / audioBuffer.length);
  // Normalize to 0-100 scale (adjust thresholds based on your audio)
  const level = Math.min(100, Math.round((rms / 32767) * 100)); // 32767 is max int16 value

  return level;
}

/**
 * Create CallControlService instance for a call
 */
export async function createCallControl(callId, agentId) {
  try {
    // Fetch agent settings
    const Agent = (await import('../agent/agent.model.js')).default;
    const agent = await Agent.findById(agentId);

    if (!agent) {
      console.warn(`⚠️  Agent not found: ${agentId}`);
      return new CallControlService(callId, agentId, {});
    }

    // Use agent's call settings
    const callSettings = agent.callSettings || {};

    return new CallControlService(callId, agentId, callSettings);
  } catch (error) {
    console.error(`❌ Error creating CallControl:`, error.message);
    // Return default instance if error
    return new CallControlService(callId, agentId, {});
  }
}
