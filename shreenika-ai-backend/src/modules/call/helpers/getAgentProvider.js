import { VoipNumber, VoipProvider } from '../../voip/voip.model.js';

/**
 * Get the VOIP provider assigned to a specific agent
 * @param {ObjectId} agentId
 * @returns {Promise<VoipProvider | null>}
 */
export const getAgentProvider = async (agentId) => {
  try {
    // Find VoipNumber assigned to this agent
    const voipNumber = await VoipNumber.findOne({
      assignedAgentId: agentId,
      status: 'active'
    }).populate('providerId');

    if (!voipNumber || !voipNumber.providerId) {
      return null;
    }

    // Return the provider (already populated)
    return voipNumber.providerId;
  } catch (error) {
    console.error('Error getting agent provider:', error);
    return null;
  }
};

/**
 * Get the phone number (DID) assigned to a specific agent
 * @param {ObjectId} agentId
 * @returns {Promise<string | null>}
 */
export const getAgentPhoneNumber = async (agentId) => {
  try {
    const voipNumber = await VoipNumber.findOne({
      assignedAgentId: agentId,
      status: 'active'
    });

    return voipNumber ? voipNumber.phoneNumber : null;
  } catch (error) {
    console.error('Error getting agent phone number:', error);
    return null;
  }
};

/**
 * Get agent's VOIP provider with fallback to system-wide Twilio env vars
 * For backward compatibility with existing deployments
 * @param {ObjectId} agentId
 * @returns {Promise<VoipProvider | Object | null>}
 */
export const getAgentProviderOrFallback = async (agentId) => {
  // Try to get agent-specific provider
  const provider = await getAgentProvider(agentId);

  if (provider) {
    return provider;
  }

  // Fallback: Check if system-wide Twilio credentials exist
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    console.warn(`⚠️ Agent ${agentId} has no VOIP provider, using system-wide Twilio credentials`);

    // Create a temporary provider object
    return {
      provider: 'Twilio',
      getDecryptedCredentials: () => ({
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN
      }),
      customScript: null
    };
  }

  return null; // No provider available
};
