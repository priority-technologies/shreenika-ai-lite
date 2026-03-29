/**
 * Call Service - Complete Call Management
 * Handles: Call creation, tracking, recording, metrics, history
 */

const calls = {};
const callRecordings = {};
const callMetrics = {};

class CallService {
  // Initiate a new call
  static initiateCall(callData) {
    const callId = `call-${Date.now()}`;

    const call = {
      _id: callId,
      contactId: callData.contactId,
      agentId: callData.agentId,
      phoneNumber: callData.phoneNumber,
      status: 'initiated',
      direction: callData.direction || 'outbound',
      startTime: new Date().toISOString(),
      endTime: null,
      duration: 0,
      transcript: '',
      recording: {
        url: null,
        format: 'mp3',
        size: 0
      },
      outcome: null,
      notes: '',
      metadata: {
        callerId: callData.callerId,
        answeredAt: null,
        disconnectedAt: null
      }
    };

    calls[callId] = call;
    callMetrics[callId] = {
      callId,
      metrics: {
        callDuration: 0,
        speakingTime: 0,
        silenceDuration: 0,
        interruptionCount: 0,
        averageLatency: 0,
        audioQuality: 'normal'
      }
    };

    return call;
  }

  // Update call status
  static updateCallStatus(callId, status) {
    if (!calls[callId]) return null;

    calls[callId].status = status;

    if (status === 'answered') {
      calls[callId].metadata.answeredAt = new Date().toISOString();
    } else if (status === 'ended' || status === 'disconnected') {
      calls[callId].metadata.disconnectedAt = new Date().toISOString();
      calls[callId].endTime = new Date().toISOString();

      const startTime = new Date(calls[callId].startTime);
      const endTime = new Date(calls[callId].endTime);
      calls[callId].duration = Math.floor((endTime - startTime) / 1000);
    }

    return calls[callId];
  }

  // Add transcript to call
  static addTranscript(callId, transcript) {
    if (!calls[callId]) return null;

    calls[callId].transcript = transcript;
    calls[callId].updatedAt = new Date().toISOString();

    return calls[callId];
  }

  // Record call outcome
  static recordOutcome(callId, outcome) {
    if (!calls[callId]) return null;

    calls[callId].outcome = outcome;
    calls[callId].updatedAt = new Date().toISOString();

    return calls[callId];
  }

  // Update call metrics
  static updateMetrics(callId, metrics) {
    if (!callMetrics[callId]) return null;

    callMetrics[callId].metrics = {
      ...callMetrics[callId].metrics,
      ...metrics,
      updatedAt: new Date().toISOString()
    };

    return callMetrics[callId];
  }

  // Get call by ID
  static getCallById(callId) {
    return calls[callId] || null;
  }

  // Get all calls (with filters)
  static getAllCalls(filters = {}) {
    let results = Object.values(calls);

    if (filters.agentId) {
      results = results.filter(c => c.agentId === filters.agentId);
    }
    if (filters.contactId) {
      results = results.filter(c => c.contactId === filters.contactId);
    }
    if (filters.status) {
      results = results.filter(c => c.status === filters.status);
    }
    if (filters.outcome) {
      results = results.filter(c => c.outcome === filters.outcome);
    }

    return results;
  }

  // Get call metrics
  static getCallMetrics(callId) {
    return callMetrics[callId] || null;
  }

  // Get agent call statistics
  static getAgentCallStats(agentId) {
    const agentCalls = Object.values(calls).filter(c => c.agentId === agentId);

    const stats = {
      totalCalls: agentCalls.length,
      completedCalls: agentCalls.filter(c => c.status === 'ended').length,
      failedCalls: agentCalls.filter(c => c.status === 'failed').length,
      averageDuration: agentCalls.length > 0
        ? Math.round(agentCalls.reduce((sum, c) => sum + c.duration, 0) / agentCalls.length)
        : 0,
      successRate: agentCalls.length > 0
        ? Math.round((agentCalls.filter(c => c.outcome === 'success').length / agentCalls.length) * 100)
        : 0
    };

    return stats;
  }

  // Save call recording
  static saveRecording(callId, recordingData) {
    if (!calls[callId]) return null;

    calls[callId].recording = {
      url: recordingData.url,
      format: recordingData.format || 'mp3',
      size: recordingData.size || 0,
      uploadedAt: new Date().toISOString()
    };

    callRecordings[callId] = recordingData;

    return calls[callId];
  }

  // Delete call record
  static deleteCall(callId) {
    delete calls[callId];
    delete callMetrics[callId];
    delete callRecordings[callId];
    return true;
  }

  // Get recent calls
  static getRecentCalls(limit = 10) {
    return Object.values(calls)
      .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
      .slice(0, limit);
  }
}

module.exports = CallService;
