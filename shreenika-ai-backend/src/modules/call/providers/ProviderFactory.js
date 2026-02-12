import { TwilioProvider } from './TwilioProvider.js';
import { GenericProvider } from './GenericProvider.js';

/**
 * Factory to instantiate correct provider based on VoipProvider config
 */
export class ProviderFactory {
  static createProvider(voipProvider) {
    if (!voipProvider) {
      throw new Error('VoipProvider is required');
    }

    const decryptedCreds = voipProvider.getDecryptedCredentials();

    const providerConfig = {
      provider: voipProvider.provider,
      customScript: voipProvider.customScript
    };

    switch (voipProvider.provider) {
      case 'Twilio':
        return new TwilioProvider(decryptedCreds, providerConfig);

      case 'Bland AI':
      case 'Vapi':
      case 'Vonage':
      case 'Other':
        return new GenericProvider(decryptedCreds, providerConfig);

      default:
        throw new Error(`Unsupported provider: ${voipProvider.provider}`);
    }
  }
}
