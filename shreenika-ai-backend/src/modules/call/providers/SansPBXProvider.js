import { BaseProvider } from './BaseProvider.js';

/**
 * SansPBX Provider - Handles San Software's VOIP API
 * Two-step authentication: Generate token, then dial call
 *
 * Credentials structure:
 * - tokenEndpoint: URL for token generation (e.g., https://clouduat28.sansoftwares.com/pbxadmin/sanpbxapi/gentoken)
 * - dialEndpoint: URL for making calls (e.g., https://clouduat28.sansoftwares.com/pbxadmin/sanpbxapi/dialcall)
 * - accessToken: Static access token for token generation
 * - accessKey: Access key for token generation
 * - appId: Application ID for dial calls
 * - username: Basic auth username
 * - password: Basic auth password
 */
export class SansPBXProvider extends BaseProvider {
  /**
   * Generate JWT token from SansPBX
   */
  async generateToken() {
    try {
      const fetch = (await import('node-fetch')).default;

      // Create Basic auth header
      const basicAuth = Buffer.from(
        `${this.credentials.username}:${this.credentials.password}`
      ).toString('base64');

      console.log(`🔐 SansPBX: Generating token from ${this.credentials.tokenEndpoint}`);

      const response = await fetch(this.credentials.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Accesstoken': this.credentials.accessToken,
          'Content-Type': 'application/json',
          'Authorization': `Basic ${basicAuth}`
        },
        body: JSON.stringify({
          access_key: this.credentials.accessKey
        })
      });

      if (!response.ok) {
        throw new Error(`Token generation failed with status ${response.status}`);
      }

      const data = await response.json();

      if (!data.Apitoken) {
        throw new Error('No API token in response');
      }

      console.log(`✅ SansPBX: Token generated, expires at ${data.expiry_time}`);
      return data.Apitoken;
    } catch (error) {
      console.error(`❌ SansPBX: Token generation error: ${error.message}`);
      throw new Error(`Failed to generate SansPBX token: ${error.message}`);
    }
  }

  /**
   * Initiate outbound call
   */
  async initiateCall({ toPhone, fromPhone, webhookUrl, statusCallbackUrl }) {
    try {
      // Step 1: Generate token
      const apiToken = await this.generateToken();

      // Step 2: Make the call
      const fetch = (await import('node-fetch')).default;

      // Normalize phone numbers
      // SansPBX expects numbers in format: 911234567890 (country code + 10 digits)
      let normalizedTo = toPhone.replace(/[\D]/g, '');
      let normalizedFrom = fromPhone.replace(/[\D]/g, '');

      // Add country code if missing (for 10-digit Indian numbers)
      if (normalizedTo.length === 10) {
        normalizedTo = '91' + normalizedTo;
      }
      if (normalizedFrom.length === 10) {
        normalizedFrom = '91' + normalizedFrom;
      }

      console.log(`📞 SansPBX: Initiating call`);
      console.log(`   Input - To: ${toPhone}, From: ${fromPhone}`);
      console.log(`   Normalized - To: ${normalizedTo}, From: ${normalizedFrom}`);
      console.log(`   Payload - call_to: ${normalizedTo}, caller_id: ${normalizedFrom}`);

      const payload = {
        appid: this.credentials.appId || 6,
        call_to: normalizedTo,
        caller_id: normalizedFrom,
        custom_field: {
          callback_url: webhookUrl,
          status_callback: statusCallbackUrl,
          record_id: `call_${Date.now()}`
        }
      };

      const response = await fetch(this.credentials.dialEndpoint, {
        method: 'POST',
        headers: {
          'Apitoken': apiToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Dial call failed with status ${response.status}: ${errorData}`);
      }

      const data = await response.json();

      console.log(`📥 SansPBX: Dial response:`, JSON.stringify(data, null, 2));

      // Check for success indicators in response
      // SansPBX may return different status values
      if (data.status && data.status !== 'success') {
        throw new Error(`API returned status: ${data.status}`);
      }

      // If we have a call_id, the call was initiated
      if (!data.call_id && !data.id && !data.Callid) {
        throw new Error(`No call ID in response: ${JSON.stringify(data)}`);
      }

      console.log(`✅ SansPBX: Call initiated successfully`);

      return {
        callSid: data.call_id || data.id || data.Callid || `sanspbx_${Date.now()}`,
        status: 'initiated',
        provider: 'SansPBX',
        providerCallId: data.call_id || data.id || data.Callid
      };
    } catch (error) {
      console.error(`❌ SansPBX: Call initiation failed: ${error.message}`);
      throw new Error(`SansPBX call initiation failed: ${error.message}`);
    }
  }

  /**
   * Get call status
   */
  async getCallStatus(callSid) {
    try {
      const fetch = (await import('node-fetch')).default;
      const apiToken = await this.generateToken();

      const response = await fetch(`${this.credentials.dialEndpoint}/${callSid}`, {
        method: 'GET',
        headers: {
          'Apitoken': apiToken,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch call status');
      }

      const data = await response.json();

      return {
        status: data.status || 'unknown',
        duration: data.duration || 0,
        startTime: data.start_time,
        endTime: data.end_time
      };
    } catch (error) {
      console.error(`❌ SansPBX: Get call status error: ${error.message}`);
      throw new Error(`Failed to get call status: ${error.message}`);
    }
  }

  /**
   * End call
   */
  async endCall(callSid) {
    try {
      const fetch = (await import('node-fetch')).default;
      const apiToken = await this.generateToken();

      await fetch(`${this.credentials.dialEndpoint}/${callSid}/hangup`, {
        method: 'POST',
        headers: {
          'Apitoken': apiToken,
          'Content-Type': 'application/json'
        }
      });

      console.log(`✅ SansPBX: Call ended: ${callSid}`);
      return true;
    } catch (error) {
      console.error(`❌ SansPBX: End call error: ${error.message}`);
      return false;
    }
  }

  /**
   * Validate credentials
   */
  async validateCredentials() {
    try {
      await this.generateToken();
      return true;
    } catch (error) {
      console.error(`❌ SansPBX: Credential validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Generate voice response
   */
  generateVoiceResponse({ callSid, publicBaseUrl }) {
    // SansPBX uses custom script if provided
    if (this.providerConfig.customScript) {
      return this.providerConfig.customScript.replace('{{callSid}}', callSid);
    }

    // Default JSON response
    return JSON.stringify({
      actions: [
        {
          type: 'connect_websocket',
          url: `${publicBaseUrl.replace('https://', 'wss://').replace('http://', 'ws://')}/media-stream/${callSid}`,
          parameters: { callSid }
        }
      ]
    });
  }
}
