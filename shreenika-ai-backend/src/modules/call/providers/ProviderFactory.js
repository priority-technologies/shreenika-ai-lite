import { TwilioProvider } from './TwilioProvider.js';
import { GenericProvider } from './GenericProvider.js';
import { SansPBXProvider } from './SansPBXProvider.js';

/**
 * Factory to instantiate correct provider based on VoipProvider config
 * CRITICAL: Validates that all required credentials exist before creating provider
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

    // CRITICAL: Validate credentials for each provider type
    switch (voipProvider.provider) {
      case 'Twilio': {
        // Validate Twilio credentials
        if (!decryptedCreds.accountSid || !decryptedCreds.authToken) {
          const missing = [];
          if (!decryptedCreds.accountSid) missing.push('accountSid');
          if (!decryptedCreds.authToken) missing.push('authToken');
          throw new Error(
            `Twilio provider incomplete. Missing credentials: ${missing.join(', ')}. ` +
            `Please reconnect your Twilio account in Settings > VOIP Integration.`
          );
        }
        console.log(`✅ Twilio credentials validated`);
        return new TwilioProvider(decryptedCreds, providerConfig);
      }

      case 'SansPBX': {
        // Validate SansPBX credentials
        const requiredFields = [
          'tokenEndpoint', 'dialEndpoint', 'accessToken', 'accessKey',
          'username', 'password', 'appId'
        ];
        const missing = requiredFields.filter(field => !decryptedCreds[field]);

        if (missing.length > 0) {
          console.error(`❌ SansPBX credentials incomplete. Missing: ${missing.join(', ')}`);
          throw new Error(
            `SansPBX provider incomplete. Missing credentials: ${missing.join(', ')}. ` +
            `Please reconnect your SansPBX account in Settings > VOIP Integration and ensure all fields are filled.`
          );
        }

        console.log(`✅ SansPBX credentials validated`);
        return new SansPBXProvider(decryptedCreds, providerConfig);
      }

      case 'Bland AI':
      case 'Vapi':
      case 'Vonage':
      case 'Other': {
        // Validate generic provider credentials
        if (!decryptedCreds.apiKey || !decryptedCreds.secretKey) {
          const missing = [];
          if (!decryptedCreds.apiKey) missing.push('apiKey');
          if (!decryptedCreds.secretKey) missing.push('secretKey');
          throw new Error(
            `${voipProvider.provider} provider incomplete. Missing credentials: ${missing.join(', ')}. ` +
            `Please reconnect in Settings > VOIP Integration.`
          );
        }
        console.log(`✅ ${voipProvider.provider} credentials validated`);
        return new GenericProvider(decryptedCreds, providerConfig);
      }

      default:
        throw new Error(`Unsupported provider: ${voipProvider.provider}`);
    }
  }
}
