import { BaseProvider } from './BaseProvider.js';

export class GenericProvider extends BaseProvider {
  async initiateCall({ toPhone, fromPhone, webhookUrl, statusCallbackUrl }) {
    try {
      const fetch = (await import('node-fetch')).default;

      const payload = {
        to: toPhone,
        from: fromPhone,
        callback_url: webhookUrl,
        status_callback: statusCallbackUrl,
        custom_script: this.providerConfig.customScript || null
      };

      const response = await fetch(`${this.credentials.endpointUrl}/calls`, {
        method: this.credentials.httpMethod || 'POST',
        headers: {
          'Authorization': `Bearer ${this.credentials.apiKey}:${this.credentials.secretKey}`,
          'Content-Type': 'application/json',
          ...(this.credentials.headers || {})
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Provider API returned ${response.status}`);
      }

      const data = await response.json();

      return {
        callSid: data.call_id || data.id || data.sid,
        status: data.status || 'initiated',
        provider: this.providerConfig.provider || 'Generic',
        providerCallId: data.call_id || data.id
      };
    } catch (error) {
      console.error('Generic provider call initiation failed:', error);
      throw new Error(`Provider error: ${error.message}`);
    }
  }

  async getCallStatus(callSid) {
    try {
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(`${this.credentials.endpointUrl}/calls/${callSid}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.credentials.apiKey}:${this.credentials.secretKey}`,
          ...(this.credentials.headers || {})
        }
      });

      if (!response.ok) throw new Error('Failed to fetch call status');
      const data = await response.json();

      return {
        status: data.status,
        duration: data.duration || 0,
        startTime: data.start_time,
        endTime: data.end_time
      };
    } catch (error) {
      throw new Error(`Failed to get call status: ${error.message}`);
    }
  }

  async endCall(callSid) {
    try {
      const fetch = (await import('node-fetch')).default;
      await fetch(`${this.credentials.endpointUrl}/calls/${callSid}/hangup`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.credentials.apiKey}:${this.credentials.secretKey}`,
          ...(this.credentials.headers || {})
        }
      });
      return true;
    } catch (error) {
      console.error('Failed to end call:', error);
      return false;
    }
  }

  generateVoiceResponse({ callSid, publicBaseUrl }) {
    // Return custom script if provided, otherwise generic JSON response
    if (this.providerConfig.customScript) {
      return this.providerConfig.customScript.replace('{{callSid}}', callSid);
    }

    return JSON.stringify({
      actions: [
        {
          type: 'connect',
          websocket_url: `${publicBaseUrl.replace('https://', 'wss://').replace('http://', 'ws://')}/media-stream/${callSid}`,
          parameters: { callSid }
        }
      ]
    });
  }

  async validateCredentials() {
    try {
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(this.credentials.endpointUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.credentials.apiKey}:${this.credentials.secretKey}`,
          ...(this.credentials.headers || {})
        }
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}
