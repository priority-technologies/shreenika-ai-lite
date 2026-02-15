import { TwilioProvider } from './TwilioProvider.js';
import { GenericProvider } from './GenericProvider.js';
import { SansPBXProvider } from './SansPBXProvider.js';

/**
 * Factory to instantiate correct provider based on VoipProvider config
 * CRITICAL: Validates that all required credentials exist AND performs API validation
 */
export class ProviderFactory {
  /**
   * Create and validate provider asynchronously
   * This method validates credentials both structurally and with actual API calls
   */
  static async createProvider(voipProvider) {
    try {
      if (!voipProvider) {
        throw new Error('VoipProvider is required');
      }

      if (!voipProvider.provider) {
        throw new Error('VoipProvider.provider field is missing');
      }

      const decryptedCreds = voipProvider.getDecryptedCredentials();

      if (!decryptedCreds || Object.keys(decryptedCreds).length === 0) {
        throw new Error(`No credentials found for ${voipProvider.provider} provider`);
      }

      const providerConfig = {
        provider: voipProvider.provider,
        customScript: voipProvider.customScript
      };

      console.log(`🏭 ProviderFactory: Creating ${voipProvider.provider} provider with validation`);

      let provider;

      // CRITICAL: Validate credentials for each provider type
      switch (voipProvider.provider) {
        case 'Twilio': {
          // Validate Twilio credentials structure
          if (!decryptedCreds.accountSid || !decryptedCreds.authToken) {
            const missing = [];
            if (!decryptedCreds.accountSid) missing.push('accountSid');
            if (!decryptedCreds.authToken) missing.push('authToken');
            throw new Error(
              `Twilio provider incomplete. Missing credentials: ${missing.join(', ')}. ` +
              `Please reconnect your Twilio account in Settings > VOIP Integration.`
            );
          }

          provider = new TwilioProvider(decryptedCreds, providerConfig);

          // Validate credentials with actual API call
          await provider.validateCredentials();
          console.log(`✅ ProviderFactory: Twilio provider validated and ready`);
          return provider;
        }

        case 'SansPBX': {
          // Validate SansPBX credentials structure
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

          provider = new SansPBXProvider(decryptedCreds, providerConfig);

          // Validate credentials with actual API call
          await provider.validateCredentials();
          console.log(`✅ ProviderFactory: SansPBX provider validated and ready`);
          return provider;
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

          provider = new GenericProvider(decryptedCreds, providerConfig);
          console.log(`✅ ProviderFactory: ${voipProvider.provider} provider created`);
          return provider;
        }

        default:
          throw new Error(`Unsupported provider: ${voipProvider.provider}`);
      }
    } catch (error) {
      console.error(`❌ ProviderFactory: Failed to create provider:`, error.message);
      throw error;
    }
  }

  /**
   * Synchronous version for backward compatibility
   * Use createProvider() for new code
   */
  static createProviderSync(voipProvider) {
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
        if (!decryptedCreds.accountSid || !decryptedCreds.authToken) {
          throw new Error('Missing Twilio credentials');
        }
        return new TwilioProvider(decryptedCreds, providerConfig);

      case 'SansPBX':
        return new SansPBXProvider(decryptedCreds, providerConfig);

      default:
        return new GenericProvider(decryptedCreds, providerConfig);
    }
  }
}
