import React, { useState, useEffect } from 'react';
import { Phone, Plus, Loader2, AlertCircle, CheckCircle, ChevronRight, X, Eye, EyeOff } from 'lucide-react';
import { getAgents, addVoipProvider, getVoipProvider } from '../services/api';

interface Agent {
  _id: string;
  name: string;
  title: string;
}

interface VoipProviderData {
  hasProvider: boolean;
  provider: {
    id: string;
    provider: string;
    isVerified: boolean;
  } | null;
}

const VoipIntegrationSettings: React.FC = () => {
  // State
  const [providers, setProviders] = useState<VoipProviderData | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);

  // Form State
  const [selectedAgent, setSelectedAgent] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('Twilio');
  const [formData, setFormData] = useState({
    accountSid: '',
    authToken: '',
    accessToken: '',
    accessKey: '',
    appId: '',
    username: '',
    password: '',
    tokenEndpoint: '',
    dialEndpoint: '',
    did: '',
    endpointUrl: ''
  });

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Password visibility toggles
  const [showAccessToken, setShowAccessToken] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [agentsRes, providersRes] = await Promise.all([
          getAgents(),
          getVoipProvider()
        ]);
        setAgents(Array.isArray(agentsRes) ? agentsRes : []);
        setProviders(providersRes);
      } catch (err) {
        console.error('Failed to fetch VOIP data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Handle form input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Handle provider change
  const handleProviderChange = (provider: string) => {
    setSelectedProvider(provider);
    setError(null);
    // Reset form when switching providers
    setFormData({
      accountSid: '',
      authToken: '',
      accessToken: '',
      accessKey: '',
      appId: '',
      username: '',
      password: '',
      tokenEndpoint: '',
      dialEndpoint: '',
      did: '',
      endpointUrl: ''
    });
  };

  // Handle connect
  const handleConnect = async () => {
    if (!selectedAgent) {
      setError('Please select an agent');
      return;
    }

    if (selectedProvider === 'Twilio') {
      if (!formData.accountSid || !formData.authToken) {
        setError('Please enter Account SID and Auth Token');
        return;
      }
    } else {
      if (!formData.accessToken || !formData.accessKey || !formData.did) {
        setError('Please fill in all required fields (Access Token, Access Key, DID)');
        return;
      }
    }

    try {
      setIsConnecting(true);
      setError(null);

      let payload: any = {
        provider: selectedProvider === 'Twilio' ? 'Twilio' : 'SansPBX',
        agentId: selectedAgent
      };

      if (selectedProvider === 'Twilio') {
        payload.accountSid = formData.accountSid;
        payload.authToken = formData.authToken;
      } else {
        payload.tokenEndpoint = formData.tokenEndpoint || 'https://clouduat28.sansoftwares.com/pbxadmin/sanpbxapi/gentoken';
        payload.dialEndpoint = formData.dialEndpoint || 'https://clouduat28.sansoftwares.com/pbxadmin/sanpbxapi/dialcall';
        payload.accessToken = formData.accessToken;
        payload.accessKey = formData.accessKey;
        payload.appId = formData.appId;
        payload.username = formData.username;
        payload.password = formData.password;
        payload.did = formData.did;
        payload.endpointUrl = formData.endpointUrl;
      }

      const result = await addVoipProvider(payload);

      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          setIsModalOpen(false);
          setSuccess(false);
          setSelectedAgent('');
          setFormData({
            accountSid: '',
            authToken: '',
            accessToken: '',
            accessKey: '',
            appId: '',
            username: '',
            password: '',
            tokenEndpoint: '',
            dialEndpoint: '',
            did: '',
            endpointUrl: ''
          });
          // Refresh providers
          getVoipProvider().then(p => setProviders(p));
        }, 2000);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect VOIP provider');
    } finally {
      setIsConnecting(false);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setError(null);
    setSelectedAgent('');
    setSelectedProvider('Twilio');
  };

  if (loading) {
    return (
      <div className="p-6 bg-white rounded-lg border border-gray-200">
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Phone className="w-6 h-6 text-blue-600" />
          <div>
            <h2 className="text-xl font-bold text-gray-900">VOIP Integration</h2>
            <p className="text-sm text-gray-500">Connect your VOIP provider to enable calling</p>
          </div>
        </div>
      </div>

      {/* Current Status */}
      {providers?.hasProvider && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <div>
              <p className="font-medium text-green-900">Connected</p>
              <p className="text-sm text-green-700">{providers.provider?.provider || 'Unknown'} provider is active</p>
            </div>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
          >
            Reconnect
          </button>
        </div>
      )}

      {!providers?.hasProvider && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <AlertCircle className="w-5 h-5 text-blue-600" />
            <div>
              <p className="font-medium text-blue-900">No VOIP Provider Connected</p>
              <p className="text-sm text-blue-700">Connect a provider to start making calls</p>
            </div>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Connect VOIP</span>
          </button>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">Connect VOIP Provider</h3>
              <button onClick={closeModal} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Success Message */}
              {success && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center space-x-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <div>
                    <p className="font-medium text-green-900">Success!</p>
                    <p className="text-sm text-green-700">VOIP provider connected and DID assigned to agent</p>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-3">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* Step 1: Agent Selection */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Select Agent <span className="text-red-600">*</span>
                </label>
                <select
                  value={selectedAgent}
                  onChange={(e) => {
                    setSelectedAgent(e.target.value);
                    setError(null);
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Choose an agent...</option>
                  {agents.map(agent => (
                    <option key={agent._id} value={agent._id}>
                      {agent.name} - {agent.title}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">The selected agent will use this VOIP provider for all calls</p>
              </div>

              {/* Step 2: Provider Selection */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">
                  Select Provider <span className="text-red-600">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleProviderChange('Twilio')}
                    className={`p-4 border-2 rounded-lg transition-all font-medium ${
                      selectedProvider === 'Twilio'
                        ? 'border-blue-600 bg-blue-50 text-blue-900'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    Twilio
                  </button>
                  <button
                    onClick={() => handleProviderChange('Others')}
                    className={`p-4 border-2 rounded-lg transition-all font-medium ${
                      selectedProvider === 'Others'
                        ? 'border-blue-600 bg-blue-50 text-blue-900'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    Others
                  </button>
                </div>
              </div>

              {/* Step 3: Provider Credentials */}
              {selectedProvider === 'Twilio' ? (
                <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-semibold text-gray-900">Twilio Credentials</h4>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Account SID <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      name="accountSid"
                      placeholder="AC..."
                      value={formData.accountSid}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Auth Token <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="password"
                      name="authToken"
                      placeholder="••••••••••"
                      value={formData.authToken}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-semibold text-gray-900">Provider Credentials</h4>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Access Token (Accesstoken) <span className="text-red-600">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showAccessToken ? "text" : "password"}
                        name="accessToken"
                        placeholder="Static token from your VOIP provider"
                        value={formData.accessToken}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAccessToken(!showAccessToken)}
                        className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-700"
                      >
                        {showAccessToken ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Static token for authentication (from provider)</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Access Key <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      name="accessKey"
                      placeholder="e.g., Priority Technologies Inc."
                      value={formData.accessKey}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">Access key for API calls (from provider)</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      DID (Phone Number) <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      name="did"
                      placeholder="Enter your phone number"
                      value={formData.did}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">The phone number that will be used as caller ID</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      App ID (Optional)
                    </label>
                    <input
                      type="text"
                      name="appId"
                      placeholder="e.g., 6"
                      value={formData.appId}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Username <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      name="username"
                      placeholder="e.g., your-username"
                      value={formData.username}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">For Basic Auth (from provider)</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Password <span className="text-red-600">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        name="password"
                        placeholder="••••••••••"
                        value={formData.password}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-700"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">For Basic Auth (from provider)</p>
                  </div>

                  <details className="pt-4 border-t border-gray-300">
                    <summary className="cursor-pointer font-medium text-gray-700 hover:text-gray-900">
                      Advanced Options
                    </summary>
                    <div className="space-y-4 mt-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Token Endpoint (Optional)
                        </label>
                        <input
                          type="text"
                          name="tokenEndpoint"
                          placeholder="https://..."
                          value={formData.tokenEndpoint}
                          onChange={handleInputChange}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Dial Endpoint (Optional)
                        </label>
                        <input
                          type="text"
                          name="dialEndpoint"
                          placeholder="https://..."
                          value={formData.dialEndpoint}
                          onChange={handleInputChange}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Endpoint URL (Optional)
                        </label>
                        <input
                          type="text"
                          name="endpointUrl"
                          placeholder="https://..."
                          value={formData.endpointUrl}
                          onChange={handleInputChange}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-xs"
                        />
                      </div>
                    </div>
                  </details>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-3 pt-6 border-t border-gray-200">
                <button
                  onClick={closeModal}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                  disabled={isConnecting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConnect}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center space-x-2 disabled:opacity-50"
                  disabled={isConnecting || !selectedAgent || !selectedProvider}
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Connecting...</span>
                    </>
                  ) : (
                    <>
                      <Phone className="w-4 h-4" />
                      <span>Connect</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VoipIntegrationSettings;
