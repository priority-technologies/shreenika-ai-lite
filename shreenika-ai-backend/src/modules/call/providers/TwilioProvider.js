import Twilio from 'twilio';
import { BaseProvider } from './BaseProvider.js';

export class TwilioProvider extends BaseProvider {
  constructor(credentials, providerConfig) {
    super(credentials, providerConfig);
    this.client = new Twilio(credentials.accountSid, credentials.authToken);
  }

  async initiateCall({ toPhone, fromPhone, webhookUrl, statusCallbackUrl }) {
    try {
      const call = await this.client.calls.create({
        to: toPhone,
        from: fromPhone,
        url: webhookUrl,
        statusCallback: statusCallbackUrl,
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
        statusCallbackMethod: "POST"
      });

      return {
        callSid: call.sid,
        status: call.status,
        provider: 'Twilio',
        providerCallId: call.sid
      };
    } catch (error) {
      console.error('Twilio call initiation failed:', error);
      throw new Error(`Twilio error: ${error.message}`);
    }
  }

  async getCallStatus(callSid) {
    try {
      const call = await this.client.calls(callSid).fetch();
      return {
        status: call.status,
        duration: call.duration,
        startTime: call.startTime,
        endTime: call.endTime,
        direction: call.direction
      };
    } catch (error) {
      throw new Error(`Failed to get call status: ${error.message}`);
    }
  }

  async endCall(callSid) {
    try {
      await this.client.calls(callSid).update({ status: 'completed' });
      return true;
    } catch (error) {
      console.error('Failed to end call:', error);
      return false;
    }
  }

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

  async validateCredentials() {
    try {
      await this.client.api.accounts(this.credentials.accountSid).fetch();
      return true;
    } catch (error) {
      return false;
    }
  }
}
