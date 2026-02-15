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
   * Generate JWT token from SansPBX with retry logic
   */
  async generateToken(retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const fetch = (await import('node-fetch')).default;

        // Create Basic auth header
        const basicAuth = Buffer.from(
          `${this.credentials.username}:${this.credentials.password}`
        ).toString('base64');

        console.log(`🔐 SansPBX: Generating token (attempt ${attempt}/${retries}) from ${this.credentials.tokenEndpoint}`);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const response = await fetch(this.credentials.tokenEndpoint, {
          method: 'POST',
          headers: {
            'Accesstoken': this.credentials.accessToken,
            'Content-Type': 'application/json',
            'Authorization': `Basic ${basicAuth}`
          },
          body: JSON.stringify({
            access_key: this.credentials.accessKey
          }),
          signal: controller.signal
        });

        clearTimeout(timeout);

        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After') || 60;
          console.warn(`⚠️  SansPBX: Rate limit hit, retry after ${retryAfter}s`);
          if (attempt < retries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            continue;
          }
          throw new Error(`SansPBX rate limit reached. Retry after ${retryAfter} seconds.`);
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        // Handle nested response structure
        const actualResponse = data.data || data;

        if (!actualResponse.Apitoken) {
          throw new Error(`No API token in response: ${JSON.stringify(data)}`);
        }

        console.log(`✅ SansPBX: Token generated (attempt ${attempt}), expires at ${actualResponse.expiry_time}`);
        return actualResponse.Apitoken;

      } catch (error) {
        console.error(`❌ SansPBX: Token generation failed (attempt ${attempt}/${retries}): ${error.message}`);

        // Don't retry on validation errors
        if (error.message.includes('No API token')) {
          throw error;
        }

        if (attempt === retries) {
          throw new Error(`Failed to generate SansPBX token after ${retries} attempts: ${error.message}`);
        }

        // Wait before retry (exponential backoff: 1s, 2s, 3s)
        const waitTime = 1000 * attempt;
        console.log(`⏳ SansPBX: Retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  /**
   * Initiate outbound call with timeout handling
   */
  async initiateCall({ toPhone, fromPhone, webhookUrl, statusCallbackUrl }, timeout = 30000) {
    let timeoutHandle;

    try {
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error('SansPBX call initiation timeout (30 seconds)'));
        }, timeout);
      });

      // Step 1: Generate token with timeout
      console.log(`📞 SansPBX: Initiating call (timeout: ${timeout}ms)`);
      const apiToken = await Promise.race([
        this.generateToken(),
        timeoutPromise
      ]);

      // Step 2: Make the call
      const fetch = (await import('node-fetch')).default;

      // Normalize phone numbers
      // SansPBX team confirmed format requirements:
      // - call_to: Full destination number (10 digits for India: prepend 91 if needed)
      // - caller_id: DID format (7 digits only, no country code)
      let normalizedTo = toPhone.replace(/[\D]/g, '');
      let normalizedFrom = fromPhone.replace(/[\D]/g, '');

      // For call_to: Add country code if missing (for 10-digit Indian numbers)
      if (normalizedTo.length === 10) {
        normalizedTo = '91' + normalizedTo;
      }

      // For caller_id (DID): Extract last 7 digits per SansPBX requirements
      // This handles cases like: +911234567890 → 4567890, or 6745647 → 6745647
      if (normalizedFrom.length > 7) {
        normalizedFrom = normalizedFrom.slice(-7);
      }

      console.log(`📞 SansPBX: Initiating call`);
      console.log(`   Input - To: ${toPhone}, From: ${fromPhone}`);
      console.log(`   Normalized - To: ${normalizedTo} (destination)`);
      console.log(`   Normalized - From: ${normalizedFrom} (DID - 7 digits)`);

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

      const controller = new AbortController();
      const fetchTimeout = setTimeout(() => controller.abort(), 30000); // Fetch-specific timeout

      const response = await fetch(this.credentials.dialEndpoint, {
        method: 'POST',
        headers: {
          'Apitoken': apiToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(fetchTimeout);

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || 60;
        throw new Error(`SansPBX rate limit reached. Retry after ${retryAfter} seconds.`);
      }

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Dial call failed with status ${response.status}: ${errorData}`);
      }

      const data = await response.json();

      console.log(`📥 SansPBX: Dial response:`, JSON.stringify(data, null, 2));

      // Handle nested response structure - SansPBX wraps response in a 'data' field
      const actualResponse = data.data || data;

      // Check for success indicators in response
      // SansPBX may return different status values
      if (actualResponse.status && actualResponse.status !== 'success') {
        throw new Error(`API returned status: ${actualResponse.status}`);
      }

      // If we have a call ID, the call was initiated
      // SansPBX returns: callid (lowercase)
      if (!actualResponse.call_id && !actualResponse.id && !actualResponse.Callid && !actualResponse.callid) {
        throw new Error(`No call ID in response: ${JSON.stringify(data)}`);
      }

      console.log(`✅ SansPBX: Call initiated successfully`);

      // Extract call ID from response (SansPBX uses 'callid' in lowercase)
      const callId = actualResponse.callid || actualResponse.call_id || actualResponse.id || actualResponse.Callid || `sanspbx_${Date.now()}`;

      return {
        callSid: callId,
        status: 'initiated',
        provider: 'SansPBX',
        providerCallId: callId,
        metadata: {
          validationTimestamp: new Date().toISOString(),
          appId: this.credentials.appId
        }
      };
    } catch (error) {
      console.error(`❌ SansPBX: Call initiation failed: ${error.message}`);
      throw new Error(`SansPBX call initiation failed: ${error.message}`);
    } finally {
      // Clean up timeout
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
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
   * Validate all SansPBX credentials
   */
  async validateCredentials() {
    try {
      console.log(`🔐 SansPBX: Validating credentials`);

      // Check all required fields exist
      const required = ['tokenEndpoint', 'dialEndpoint', 'accessToken', 'accessKey', 'appId', 'username', 'password'];
      const missing = required.filter(field => !this.credentials[field]);

      if (missing.length > 0) {
        throw new Error(`Missing SansPBX credentials: ${missing.join(', ')}`);
      }

      // Test with actual token generation
      const token = await this.generateToken();

      if (!token) {
        throw new Error('Token generation returned empty token');
      }

      console.log(`✅ SansPBX: Credentials validated successfully`);
      return true;
    } catch (error) {
      console.error(`❌ SansPBX: Credential validation failed: ${error.message}`);
      throw new Error(`Invalid SansPBX credentials: ${error.message}`);
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
