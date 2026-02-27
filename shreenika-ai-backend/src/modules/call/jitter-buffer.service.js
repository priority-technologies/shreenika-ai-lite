/**
 * Jitter Buffer Service
 * Gap 10: Handle network delays and out-of-order audio packets
 *
 * Buffers incoming audio to smooth out network jitter
 * Detects and handles lost/late packets
 */

export class JitterBuffer {
  constructor(maxBufferSize = 20, targetLatency = 50) {
    this.maxBufferSize = maxBufferSize; // Max number of frames to buffer
    this.targetLatency = targetLatency; // Target buffer latency in ms
    this.buffer = []; // Array of {sequence, timestamp, data, timeDiff}
    this.lastSequence = -1;
    this.outputBuffer = [];
    this.statistics = {
      packetslost: 0,
      packetsReceived: 0,
      packetsLate: 0,
      currentLatency: 0,
      bufferFill: 0,
      avgJitter: 0,
      jitterHistory: []
    };
    this.startTime = Date.now();
    this.lastDeliveryTime = this.startTime;
  }

  /**
   * Add packet to jitter buffer
   * @param {object} packet - { sequence: number, data: Buffer, timestamp: number }
   * @returns {Buffer|null} - Ready-to-output audio or null if buffering
   */
  addPacket(packet) {
    const now = Date.now();
    this.statistics.packetsReceived++;

    // Check for out-of-order or duplicate packets
    if (packet.sequence <= this.lastSequence) {
      console.warn(`⚠️ JitterBuffer: Out-of-order packet. Expected > ${this.lastSequence}, got ${packet.sequence}`);
      this.statistics.packetsLate++;
      return null; // Discard old/duplicate packet
    }

    // Check for missing packets
    const expectedSequence = this.lastSequence + 1;
    if (packet.sequence > expectedSequence) {
      const missedCount = packet.sequence - expectedSequence;
      console.warn(`⚠️ JitterBuffer: ${missedCount} packet(s) lost. Expected ${expectedSequence}, got ${packet.sequence}`);
      this.statistics.packetslost += missedCount;

      // Pad with silent frames for missing packets
      for (let i = 0; i < missedCount; i++) {
        this.buffer.push({
          sequence: expectedSequence + i,
          data: Buffer.alloc(packet.data.length), // Silent frame
          timestamp: packet.timestamp - (missedCount - i) * 20, // Estimate timing
          timeDiff: 0,
          isLost: true
        });
      }
    }

    // Calculate time difference from last packet
    const timeDiff = now - this.lastDeliveryTime;
    this.lastDeliveryTime = now;

    // Store packet in buffer
    this.buffer.push({
      sequence: packet.sequence,
      data: packet.data,
      timestamp: packet.timestamp || now,
      timeDiff,
      isLost: false
    });

    this.lastSequence = packet.sequence;

    // Track jitter (variation in inter-packet time)
    const expectedInterval = 20; // 20ms per packet at 16kHz
    const jitter = Math.abs(timeDiff - expectedInterval);
    this.statistics.jitterHistory.push(jitter);
    if (this.statistics.jitterHistory.length > 100) {
      this.statistics.jitterHistory.shift();
    }
    this.statistics.avgJitter = this.statistics.jitterHistory.reduce((a, b) => a + b, 0) / this.statistics.jitterHistory.length;

    // Update buffer statistics
    this.statistics.bufferFill = this.buffer.length;
    this.statistics.currentLatency = this.buffer.length * expectedInterval;

    // Return buffered audio if buffer is full enough
    if (this.buffer.length >= Math.max(3, Math.ceil(this.targetLatency / expectedInterval))) {
      return this.getNextPacket();
    }

    return null; // Keep buffering
  }

  /**
   * Get the next packet from buffer (FIFO)
   * @returns {Buffer|null} - Next audio frame or null if buffer empty
   */
  getNextPacket() {
    if (this.buffer.length === 0) {
      return null;
    }

    // Remove oldest packet from buffer
    const packet = this.buffer.shift();
    this.statistics.bufferFill = this.buffer.length;

    if (packet.isLost) {
      console.warn(`⚠️ JitterBuffer: Returning silent frame for lost packet ${packet.sequence}`);
    }

    return packet.data;
  }

  /**
   * Adaptive buffer sizing based on jitter
   * Increase buffer if jitter is high, decrease if low
   */
  adaptBufferSize() {
    const avgJitter = this.statistics.avgJitter;

    if (avgJitter > 30) {
      // High jitter - increase buffer
      this.maxBufferSize = Math.min(this.maxBufferSize + 1, 40);
      console.log(`⚠️ High jitter (${avgJitter.toFixed(1)}ms) - increased buffer to ${this.maxBufferSize} frames`);
    } else if (avgJitter < 10 && this.maxBufferSize > 10) {
      // Low jitter - can decrease buffer
      this.maxBufferSize = Math.max(this.maxBufferSize - 1, 10);
      console.log(`✅ Low jitter (${avgJitter.toFixed(1)}ms) - decreased buffer to ${this.maxBufferSize} frames`);
    }
  }

  /**
   * Get jitter buffer status
   * @returns {object} - Buffer statistics
   */
  getStatus() {
    return {
      packetsReceived: this.statistics.packetsReceived,
      packetsLost: this.statistics.packetslost,
      packetsLate: this.statistics.packetsLate,
      lossRate: (this.statistics.packetslost / Math.max(1, this.statistics.packetsReceived) * 100).toFixed(2) + '%',
      currentLatency: this.statistics.currentLatency + 'ms',
      targetLatency: this.targetLatency + 'ms',
      bufferFill: this.statistics.bufferFill,
      maxBufferSize: this.maxBufferSize,
      avgJitter: this.statistics.avgJitter.toFixed(2) + 'ms',
      uptime: (Date.now() - this.startTime) / 1000 + 's'
    };
  }

  /**
   * Flush remaining packets
   * @returns {Buffer[]} - All remaining audio frames
   */
  flush() {
    const remaining = [];
    while (this.buffer.length > 0) {
      remaining.push(this.getNextPacket());
    }
    console.log(`✅ JitterBuffer flushed: ${remaining.length} frames remaining`);
    return remaining.filter(f => f !== null);
  }

  /**
   * Reset jitter buffer
   */
  reset() {
    this.buffer = [];
    this.lastSequence = -1;
    this.lastDeliveryTime = Date.now();
    this.statistics = {
      packetslost: 0,
      packetsReceived: 0,
      packetsLate: 0,
      currentLatency: 0,
      bufferFill: 0,
      avgJitter: 0,
      jitterHistory: []
    };
  }
}

export default JitterBuffer;
