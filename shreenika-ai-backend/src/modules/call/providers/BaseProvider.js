/**
 * Abstract base class for VOIP providers
 * All provider implementations must extend this class
 */
export class BaseProvider {
  constructor(credentials, providerConfig) {
    this.credentials = credentials;
    this.providerConfig = providerConfig;
  }

  /**
   * Initialize outbound call
   * @param {Object} params - { toPhone, fromPhone, webhookUrl, statusCallbackUrl }
   * @returns {Promise<Object>} - { callSid, status, provider }
   */
  async initiateCall(params) {
    throw new Error('initiateCall() must be implemented by subclass');
  }

  /**
   * Get call status
   * @param {string} callSid
   * @returns {Promise<Object>} - { status, duration, ... }
   */
  async getCallStatus(callSid) {
    throw new Error('getCallStatus() must be implemented by subclass');
  }

  /**
   * End active call
   * @param {string} callSid
   * @returns {Promise<boolean>}
   */
  async endCall(callSid) {
    throw new Error('endCall() must be implemented by subclass');
  }

  /**
   * Generate TwiML or equivalent for real-time conversation
   * @param {Object} params - { callSid, agentConfig }
   * @returns {string} - TwiML or provider-specific XML/JSON
   */
  generateVoiceResponse(params) {
    throw new Error('generateVoiceResponse() must be implemented by subclass');
  }

  /**
   * Validate credentials
   * @returns {Promise<boolean>}
   */
  async validateCredentials() {
    throw new Error('validateCredentials() must be implemented by subclass');
  }
}
