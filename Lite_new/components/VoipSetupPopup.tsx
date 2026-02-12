import React, { useState } from 'react';
import { Phone, X, ChevronDown, ChevronUp, Loader2, AlertCircle } from 'lucide-react';
import { setupVoipForRegistration } from '../services/api';

interface VoipSetupPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSkip: () => void;
  onComplete: () => void;
}

const VoipSetupPopup: React.FC<VoipSetupPopupProps> = ({ isOpen, onClose, onSkip, onComplete }) => {
  const [provider, setProvider] = useState<'Twilio' | 'Others' | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    accountSid: '',
    authToken: '',
    apiKey: '',
    secretKey: '',
    did: '',
    endpointUrl: '',
    customScript: ''
  });

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const payload: any = { provider };

      if (provider === 'Twilio') {
        if (!formData.accountSid || !formData.authToken) {
          setError('Account SID and Auth Token are required');
          setIsSubmitting(false);
          return;
        }
        payload.accountSid = formData.accountSid;
        payload.authToken = formData.authToken;
      } else {
        if (!formData.apiKey || !formData.secretKey || !formData.endpointUrl) {
          setError('API Key, Secret Key, and Endpoint URL are required');
          setIsSubmitting(false);
          return;
        }
        payload.apiKey = formData.apiKey;
        payload.secretKey = formData.secretKey;
        payload.endpointUrl = formData.endpointUrl;
      }

      if (showAdvanced && formData.customScript) {
        payload.customScript = formData.customScript;
      }

      const response = await setupVoipForRegistration(payload);

      if (response.success) {
        alert(`✅ Success! ${response.dids?.length || 0} DIDs imported and auto-assigned to your agent.`);
        onComplete();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to setup VOIP provider');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-8 relative max-h-[90vh] overflow-y-auto">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Phone className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-3xl font-bold text-slate-900">Setup VOIP Provider</h2>
          <p className="text-slate-500 mt-2">Connect your telephony provider to enable calls (Optional)</p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* Provider Selection */}
        {!provider ? (
          <div className="space-y-6">
            <p className="text-sm text-slate-600 font-medium">Choose your VOIP provider:</p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setProvider('Twilio')}
                className="p-6 border-2 border-slate-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all duration-200 text-left"
              >
                <h3 className="text-lg font-bold text-slate-900">Twilio</h3>
                <p className="text-sm text-slate-500 mt-1">Industry standard, most reliable</p>
              </button>
              <button
                onClick={() => setProvider('Others')}
                className="p-6 border-2 border-slate-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all duration-200 text-left"
              >
                <h3 className="text-lg font-bold text-slate-900">Others</h3>
                <p className="text-sm text-slate-500 mt-1">BlandAI, Vapi, Vonage, custom</p>
              </button>
            </div>
          </div>
        ) : null}

        {/* Twilio Form */}
        {provider === 'Twilio' && (
          <div className="space-y-5">
            <button
              onClick={() => setProvider(null)}
              className="text-sm text-blue-600 hover:text-blue-700 underline font-medium"
            >
              ← Change Provider
            </button>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Account SID</label>
              <input
                type="text"
                value={formData.accountSid}
                onChange={(e) => setFormData({ ...formData, accountSid: e.target.value })}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full border border-slate-300 rounded-lg p-3 font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Auth Token</label>
              <input
                type="password"
                value={formData.authToken}
                onChange={(e) => setFormData({ ...formData, authToken: e.target.value })}
                placeholder="••••••••••••••••"
                className="w-full border border-slate-300 rounded-lg p-3 font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        )}

        {/* Others Form */}
        {provider === 'Others' && (
          <div className="space-y-5">
            <button
              onClick={() => setProvider(null)}
              className="text-sm text-blue-600 hover:text-blue-700 underline font-medium"
            >
              ← Change Provider
            </button>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">API Key</label>
              <input
                type="text"
                value={formData.apiKey}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                placeholder="Your API Key"
                className="w-full border border-slate-300 rounded-lg p-3 font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Token Key / Secret Key</label>
              <input
                type="password"
                value={formData.secretKey}
                onChange={(e) => setFormData({ ...formData, secretKey: e.target.value })}
                placeholder="••••••••••••••••"
                className="w-full border border-slate-300 rounded-lg p-3 font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Endpoint URL</label>
              <input
                type="text"
                value={formData.endpointUrl}
                onChange={(e) => setFormData({ ...formData, endpointUrl: e.target.value })}
                placeholder="https://api.yourprovider.com/v1"
                className="w-full border border-slate-300 rounded-lg p-3 font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Advanced Options */}
            <div className="border-t border-slate-200 pt-5">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Advanced Options
              </button>
              {showAdvanced && (
                <div className="mt-4 space-y-4 bg-slate-50 p-4 rounded-lg">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Custom Script (IVR Logic)</label>
                    <textarea
                      value={formData.customScript}
                      onChange={(e) => setFormData({ ...formData, customScript: e.target.value })}
                      placeholder="// Custom IVR logic (e.g., TwiML, XML, JSON)"
                      className="w-full border border-slate-300 rounded-lg p-3 font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent h-24"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {provider ? (
          <div className="flex justify-between gap-4 mt-8 pt-6 border-t border-slate-200">
            <button
              onClick={onSkip}
              className="px-6 py-3 border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
            >
              Skip for Now
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-8 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Connect & Continue'
              )}
            </button>
          </div>
        ) : (
          <div className="text-center mt-8 pt-6 border-t border-slate-200">
            <button
              onClick={onSkip}
              className="text-sm text-slate-500 hover:text-slate-700 underline"
            >
              Skip VOIP setup (you can configure it later in Settings)
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default VoipSetupPopup;
