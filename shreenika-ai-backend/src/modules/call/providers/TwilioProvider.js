import Twilio from 'twilio';
import { BaseProvider } from './BaseProvider.js';

export class TwilioProvider extends BaseProvider {
  constructor(credentials, providerConfig) {
    super(credentials, providerConfig);
    this.credentialsValidated = false;

    // Validate credentials format
    if (!credentials.accountSid || !credentials.authToken) {
      throw new Error('Missing Twilio credentials: accountSid and authToken required');
    }

    this.client = new Twilio(credentials.accountSid, credentials.authToken);
  }

  /**
   * Validate Twilio credentials by making an API call
   */
  async validateCredentials() {
    try {
      console.log('🔐 Twilio: Validating credentials');

      // Test credentials with actual API call
      await this.client.api.accounts(this.credentials.accountSid).fetch();

      console.log('✅ Twilio: Credentials validated successfully');
      this.credentialsValidated = true;
      return true;
    } catch (error) {
      console.error('❌ Twilio: Credential validation failed:', error.message);

      if (error.code === 20003) {
        throw new Error('Twilio authentication failed - invalid Account SID or Auth Token');
      } else if (error.code === 20004) {
        throw new Error('Twilio account not found');
      } else {
        throw new Error(`Invalid Twilio credentials: ${error.message}`);
      }
    }
  }

  /**
   * Initiate outbound call with comprehensive error handling
   */
  async initiateCall({ toPhone, fromPhone, webhookUrl, statusCallbackUrl }) {
    try {
      // Validate credentials before making call
      if (!this.credentialsValidated) {
        await this.validateCredentials();
      }

      // Validate phone numbers
      if (!toPhone || !fromPhone) {
        throw new Error('Missing required phone numbers: toPhone and fromPhone');
      }

      // Validate webhook URL
      if (!webhookUrl) {
        throw new Error('Missing webhookUrl for voice callback');
      }

      console.log(`📞 Twilio: Initiating call from ${fromPhone} to ${toPhone}`);
      console.log(`   Webhook URL: ${webhookUrl}`);
      console.log(`   Status callback: ${statusCallbackUrl || 'none'}`);
      console.log(`   AMD: Enabled`);
      console.log(`   Recording: Enabled`);

      const callParams = {
        to: toPhone,
        from: fromPhone,
        url: webhookUrl,
        statusCallback: statusCallbackUrl,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallbackMethod: 'POST',
        timeout: 60, // Ring timeout in seconds
        record: true, // Enable recording for transcription
        recordingChannels: 'mono', // Mono recording
        recordingStatusCallback: `${process.env.PUBLIC_BASE_URL}/twilio/recording-status`,
        recordingStatusCallbackMethod: 'POST',
        machineDetection: 'Enable', // Enable Answering Machine Detection (AMD)
        asyncAmdStatusCallback: `${process.env.PUBLIC_BASE_URL}/twilio/amd-status`,
        asyncAmdStatusCallbackMethod: 'POST'
      };

      const call = await this.client.calls.create(callParams);

      console.log(`✅ Twilio: Call initiated successfully`);
      console.log(`   Call SID: ${call.sid}`);
      console.log(`   Status: ${call.status}`);
      console.log(`   Price: ${call.price || 'calculating'}`);

      return {
        callSid: call.sid,
        status: call.status,
        provider: 'Twilio',
        providerCallId: call.sid,
        metadata: {
          validationTimestamp: new Date().toISOString(),
          accountSid: this.credentials.accountSid
        }
      };
    } catch (error) {
      // Detailed error categorization based on Twilio error codes
      const errorMessage = this.categorizeTwilioError(error, toPhone, fromPhone);
      console.error(`❌ Twilio: Call initiation failed: ${errorMessage}`);
      throw new Error(errorMessage);
    }
  }

  /**
   * Categorize Twilio errors with actionable messages
   */
  categorizeTwilioError(error, toPhone, fromPhone) {
    const code = error.code;
    const message = error.message;

    // Authentication errors
    if (code === 20003) {
      return 'Twilio authentication failed - check Account SID and Auth Token';
    }

    // Invalid phone numbers
    if (code === 21211) {
      return `Invalid 'To' phone number: ${toPhone}. Use E.164 format (e.g., +15551234567)`;
    }
    if (code === 21212) {
      return `Invalid 'From' phone number: ${fromPhone}. Use E.164 format or valid Twilio number`;
    }
    if (code === 21214) {
      return `'From' number ${fromPhone} is not owned by your Twilio account. Add it in Twilio console.`;
    }
    if (code === 21215) {
      return `'To' number ${toPhone} is not verified. Add it to verified numbers in Twilio console.`;
    }

    // Account/billing errors
    if (code === 21610) {
      return 'Twilio account is suspended or needs payment. Contact Twilio support.';
    }
    if (code === 21612) {
      return 'Twilio account has insufficient funds. Add payment method.';
    }

    // Network/timeout errors
    if (code === 'ENOTFOUND' || message.includes('getaddrinfo')) {
      return 'Network error connecting to Twilio. Check internet connection.';
    }
    if (message.includes('timeout')) {
      return 'Twilio API timeout. Try again in a few moments.';
    }

    // Generic error with code
    if (code) {
      return `Twilio error (Code ${code}): ${message}`;
    }

    // Generic error without code
    return `Twilio call failed: ${message}`;
  }

  /**
   * Get call status with error handling
   */
  async getCallStatus(callSid) {
    try {
      if (!callSid) {
        throw new Error('Missing callSid parameter');
      }

      console.log(`📊 Twilio: Fetching call status for ${callSid}`);

      const call = await this.client.calls(callSid).fetch();

      const result = {
        status: call.status,
        duration: call.duration,
        startTime: call.startTime,
        endTime: call.endTime,
        direction: call.direction,
        answeredBy: call.answeredBy
      };

      console.log(`✅ Twilio: Call status fetched - ${call.status}`);

      return result;
    } catch (error) {
      if (error.code === 20404) {
        throw new Error(`Call not found: ${callSid}`);
      }
      throw new Error(`Failed to get call status: ${error.message}`);
    }
  }

  /**
   * End call with error handling
   */
  async endCall(callSid) {
    try {
      if (!callSid) {
        throw new Error('Missing callSid parameter');
      }

      console.log(`🛑 Twilio: Ending call ${callSid}`);

      await this.client.calls(callSid).update({ status: 'completed' });

      console.log(`✅ Twilio: Call ended successfully`);

      return true;
    } catch (error) {
      console.error(`❌ Twilio: Failed to end call: ${error.message}`);
      return false;
    }
  }

  /**
   * Generate TwiML voice response
   */
  generateVoiceResponse({ callSid, publicBaseUrl }) {
    const wsUrl = publicBaseUrl.replace('https://', 'wss://').replace('http://', 'ws://');
    return `
      <Response>
        <Connect>
          <Stream url="${wsUrl}/media-stream/${callSid}">
            <Parameter name="callSid" value="${callSid}" />
          </Stream>
        </Connect>
      </Response>
    `;
  }
}
