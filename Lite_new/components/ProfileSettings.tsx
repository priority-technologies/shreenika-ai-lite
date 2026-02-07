
import React, { useState, useEffect } from 'react';
import { User, Shield, HelpCircle, Phone, Plus, CreditCard, Lock, FileText, ArrowLeft, Loader2, CheckCircle, ChevronDown, Download, Package, Check, Zap, HardDrive, Smartphone, CheckCircle2, RefreshCw, AlertCircle, Key, Copy, Trash2, Eye, EyeOff, Code } from 'lucide-react';
import { FAQ_ITEMS } from '../constants';
import {
  getVoipProvider,
  addVoipProvider,
  getVoipNumbers,
  syncVoipNumbers,
  assignNumberToAgent,
  unassignNumber,
  releaseNumber,
  getAvailableNumbers,
  purchaseNumber,
  getAgents,
  getBillingStatus,
  getCurrentUsage,
  updatePlan,
  purchaseAddOn,
  generateApiKey,
  listApiKeys,
  revokeApiKey
} from '../services/api';

interface VoipNumber {
  id: string;
  number: string;
  friendlyName?: string;
  region: string;
  country: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
  assignedAgent: {
    id: string;
    name: string;
  } | null;
  monthlyCost: number;
  source: 'purchased' | 'imported';
}

interface VoipProviderData {
  hasProvider: boolean;
  provider: {
    id: string;
    provider: string;
    isVerified: boolean;
    accountSid?: string;
    lastSyncedAt?: string;
  } | null;
}

interface Agent {
  _id: string;
  name: string;
  title: string;
}

const ProfileSettings: React.FC = () => {
  const [activeTab, setActiveTab] = useState('Profile');
  const [user] = useState(() => {
     const u = localStorage.getItem('voxai_user');
     return u ? JSON.parse(u) : { name: 'User', email: 'user@example.com', role: 'user' };
  });

  // VOIP Section State
  const [voipView, setVoipView] = useState<'main' | 'purchase' | 'import' | 'details'>('main');
  const [voipProvider, setVoipProvider] = useState<VoipProviderData | null>(null);
  const [myNumbers, setMyNumbers] = useState<VoipNumber[]>([]);
  const [availableNumbers, setAvailableNumbers] = useState<any[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedNumber, setSelectedNumber] = useState<VoipNumber | null>(null);
  const [showAssignConfirm, setShowAssignConfirm] = useState(false);
  const [agentToAssign, setAgentToAssign] = useState<string>('');
  const [isLoadingVoip, setIsLoadingVoip] = useState(false);
  const [voipError, setVoipError] = useState<string | null>(null);

  const [importData, setImportData] = useState({ provider: 'Twilio', accountSid: '', authToken: '', apiKey: '', secretKey: '' });
  const [isImporting, setIsImporting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Subscription State (Real Data)
  const [subscription, setSubscription] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [selectedPlan, setSelectedPlan] = useState<'Starter' | 'Pro' | 'Enterprise'>('Starter');
  const [selectedAddons, setSelectedAddons] = useState({ extraDocs: false, extraAgent: false });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);

  // API Key State
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [isLoadingApiKeys, setIsLoadingApiKeys] = useState(false);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);

  // Load VOIP data on mount and when tab changes to VOIP
  useEffect(() => {
    if (activeTab === 'VOIP') {
      loadVoipData();
    }
  }, [activeTab]);

  const loadVoipData = async () => {
    setIsLoadingVoip(true);
    setVoipError(null);
    try {
      const [providerData, numbersData, agentsData] = await Promise.all([
        getVoipProvider(),
        getVoipNumbers(),
        getAgents()
      ]);

      setVoipProvider(providerData);
      setMyNumbers(numbersData.numbers || []);
      setAgents(agentsData.agents || agentsData || []);
    } catch (error: any) {
      console.error('Failed to load VOIP data:', error);
      setVoipError(error.message || 'Failed to load VOIP data');
    } finally {
      setIsLoadingVoip(false);
    }
  };

  const handleSyncNumbers = async () => {
    setIsSyncing(true);
    try {
      await syncVoipNumbers();
      await loadVoipData(); // Reload data after sync
      alert('Numbers synced successfully!');
    } catch (error: any) {
      alert(error.message || 'Failed to sync numbers');
    } finally {
      setIsSyncing(false);
    }
  };

  const plans = [
     { id: 'Starter', activationFee: 0, features: ['1 AI Agent', '0 Documents', 'Pay-as-you-go calls', 'Standard Support'] },
     { id: 'Pro', activationFee: 20, features: ['5 AI Agents', '25 Documents', 'Knowledge Base', 'Priority Support', 'Add-ons Available'] },
     { id: 'Enterprise', activationFee: null, features: ['Unlimited Agents', 'Unlimited Documents', 'Advanced Training', 'Dedicated Account Manager', 'SLA'] },
  ];

  // Load subscription data when Subscription tab is active
  useEffect(() => {
    if (activeTab === 'Subscription') {
      loadSubscriptionData();
    }
  }, [activeTab]);

  const loadSubscriptionData = async () => {
    setIsLoadingSubscription(true);
    setSubscriptionError(null);
    try {
      const [subData, usageData] = await Promise.all([
        getBillingStatus(),
        getCurrentUsage()
      ]);
      setSubscription(subData);
      setUsage(usageData);
      if (subData?.plan) {
        setSelectedPlan(subData.plan);
      }
    } catch (error: any) {
      console.error('Failed to load subscription data:', error);
      setSubscriptionError(error.message || 'Failed to load subscription data');
    } finally {
      setIsLoadingSubscription(false);
    }
  };

  // Load API keys when API tab is active
  useEffect(() => {
    if (activeTab === 'API') {
      loadApiKeys();
    }
  }, [activeTab]);

  const loadApiKeys = async () => {
    setIsLoadingApiKeys(true);
    try {
      const keys = await listApiKeys();
      setApiKeys(Array.isArray(keys) ? keys : []);
    } catch (error: any) {
      console.error('Failed to load API keys:', error);
    } finally {
      setIsLoadingApiKeys(false);
    }
  };

  const handleGenerateKey = async () => {
    setIsGeneratingKey(true);
    try {
      const result = await generateApiKey(newKeyName || undefined);
      setGeneratedKey(result.key);
      setNewKeyName('');
      await loadApiKeys();
    } catch (error: any) {
      alert(error.message || 'Failed to generate API key');
    } finally {
      setIsGeneratingKey(false);
    }
  };

  const handleRevokeKey = async (id: string) => {
    if (!window.confirm('Are you sure you want to revoke this API key? Any integrations using it will stop working.')) return;
    try {
      await revokeApiKey(id);
      await loadApiKeys();
    } catch (error: any) {
      alert(error.message || 'Failed to revoke API key');
    }
  };

  const handleCopyKey = (text: string) => {
    navigator.clipboard.writeText(text);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  };

  const API_BASE = import.meta.env.VITE_API_BASE_URL || "https://shreenika-ai-backend-507468019722.asia-south1.run.app";

  const apiEndpoints = [
    { method: 'GET', path: '/api/v1/agents', desc: 'List all agents' },
    { method: 'GET', path: '/api/v1/agents/:id', desc: 'Get agent by ID' },
    { method: 'POST', path: '/api/v1/calls/outbound', desc: 'Make outbound call' },
    { method: 'GET', path: '/api/v1/calls', desc: 'List call history' },
    { method: 'GET', path: '/api/v1/contacts', desc: 'List contacts' },
    { method: 'POST', path: '/api/v1/contacts', desc: 'Create contact' },
    { method: 'PUT', path: '/api/v1/contacts/:id', desc: 'Update contact' },
    { method: 'DELETE', path: '/api/v1/contacts/:id', desc: 'Delete contact' },
    { method: 'GET', path: '/api/v1/knowledge', desc: 'List knowledge docs' },
    { method: 'GET', path: '/api/v1/usage', desc: 'Get usage stats' },
    { method: 'GET', path: '/api/v1/billing', desc: 'Get billing status' },
  ];

  const calculateSubscriptionTotal = () => {
    const plan = plans.find(p => p.id === selectedPlan);
    let total = plan?.activationFee || 0;
    if (selectedAddons.extraDocs && selectedPlan === 'Pro') total += 1;
    if (selectedAddons.extraAgent && selectedPlan === 'Pro') total += 20;
    return total;
  };

  const handleUpdateSubscription = async () => {
    setIsProcessing(true);
    try {
      if (subscription && selectedPlan !== subscription.plan) {
        const response = await updatePlan(selectedPlan);

        if (response.requiresPayment && response.checkoutUrl) {
          window.location.href = response.checkoutUrl;
          return;
        }

        if (response.requiresContact) {
          setIsProcessing(false);
          alert(`${response.message}\n\nPlease contact: ${response.contactEmail}`);
          return;
        }
      }

      if (selectedPlan === 'Pro') {
        if (selectedAddons.extraDocs) await purchaseAddOn('extra_documents', 1);
        if (selectedAddons.extraAgent) await purchaseAddOn('extra_agent', 1);
      }

      await loadSubscriptionData();
      setIsProcessing(false);
      alert('Subscription updated successfully!');
    } catch (error: any) {
      console.error('Subscription update failed:', error);
      setIsProcessing(false);
      alert('Update failed: ' + (error.message || 'Unknown error'));
    }
  };

  const handleSelectNumber = (num: VoipNumber) => {
    setSelectedNumber(num);
    setAgentToAssign(num.assignedAgent?.id || '');
    setVoipView('details');
  };

  const handleLoadAvailableNumbers = async () => {
    try {
      const data = await getAvailableNumbers('US');
      setAvailableNumbers(data.numbers || []);
    } catch (error: any) {
      alert(error.message || 'Failed to load available numbers');
    }
  };

  const handlePurchase = async (phoneNumber: string) => {
    try {
      await purchaseNumber(phoneNumber);
      alert(`Successfully purchased ${phoneNumber}!`);
      await loadVoipData(); // Reload data
      setVoipView('main');
    } catch (error: any) {
      alert(error.message || 'Failed to purchase number');
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsImporting(true);
    setVoipError(null);

    try {
      const payload: any = {
        provider: importData.provider,
      };

      // Add appropriate credentials based on provider
      if (importData.provider === 'Twilio') {
        payload.accountSid = importData.accountSid;
        payload.authToken = importData.authToken;
      } else {
        payload.apiKey = importData.apiKey;
        payload.secretKey = importData.secretKey;
      }

      await addVoipProvider(payload);

      // Reload VOIP data
      await loadVoipData();

      setImportData({ provider: 'Twilio', accountSid: '', authToken: '', apiKey: '', secretKey: '' });
      alert('Provider connected and numbers imported successfully!');
      setVoipView('main');
    } catch (error: any) {
      console.error('Import error:', error);
      setVoipError(error.message || 'Failed to import provider');
      alert(error.message || 'Failed to import provider');
    } finally {
      setIsImporting(false);
    }
  };

  const handleTriggerAssignment = () => {
    if (agentToAssign && agentToAssign !== selectedNumber?.assignedAgent?.id) {
        setShowAssignConfirm(true);
    }
  };

  const handleFinalizeAssignment = async () => {
    if (!selectedNumber || !agentToAssign) return;

    try {
      await assignNumberToAgent(selectedNumber.id, agentToAssign);
      await loadVoipData(); // Reload data
      setShowAssignConfirm(false);
      setVoipView('main');
      alert('Number assigned successfully!');
    } catch (error: any) {
      alert(error.message || 'Failed to assign number');
    }
  };

  const handleReleaseNumber = async () => {
    if (!selectedNumber) return;

    if (window.confirm(`Are you sure you want to release the number ${selectedNumber.number}? This action cannot be undone.`)) {
      try {
        await releaseNumber(selectedNumber.id);
        await loadVoipData(); // Reload data
        setVoipView('main');
        setSelectedNumber(null);
        alert('Number released successfully!');
      } catch (error: any) {
        alert(error.message || 'Failed to release number');
      }
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500">Manage your account, integrations, and legal information.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[600px] flex flex-col md:flex-row">
        {/* Sidebar Tabs */}
        <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50 p-4 space-y-1">
           {[
              { id: 'Profile', icon: User, label: 'My Profile' },
              { id: 'VOIP', icon: Phone, label: 'VOIP Integration' },
              { id: 'Subscription', icon: CreditCard, label: 'Subscription Plan' },
              { id: 'API', icon: Key, label: 'API Integration' },
              { id: 'Legal', icon: Shield, label: 'Privacy & Terms' },
              { id: 'FAQ', icon: HelpCircle, label: 'FAQs' },
           ].map(tab => (
              <button
                 key={tab.id}
                 onClick={() => setActiveTab(tab.id)}
                 className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'
                 }`}
              >
                 <tab.icon className="w-4 h-4" />
                 <span>{tab.label}</span>
              </button>
           ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 p-8 overflow-y-auto">
           
           {/* --- PROFILE --- */}
           {activeTab === 'Profile' && (
              <div className="max-w-lg space-y-6">
                 <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-4">My Profile</h2>
                 <div className="flex items-center space-x-6">
                    <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-2xl font-bold">
                       {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                       <button className="text-sm text-blue-600 font-medium hover:underline">Change Avatar</button>
                    </div>
                 </div>
                 <div className="grid grid-cols-1 gap-4">
                    <div>
                       <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                       <input type="text" value={user.name} readOnly className="w-full border border-slate-300 rounded-lg p-2.5 bg-slate-50 text-slate-500" />
                    </div>
                    <div>
                       <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                       <input type="email" value={user.email} readOnly className="w-full border border-slate-300 rounded-lg p-2.5 bg-slate-50 text-slate-500" />
                    </div>
                    <div>
                       <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                       <input type="text" value={user.role} readOnly className="w-full border border-slate-300 rounded-lg p-2.5 bg-slate-50 text-slate-500 capitalize" />
                    </div>
                 </div>
                 <button className="bg-slate-900 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-800">
                    Update Profile
                 </button>
              </div>
           )}

           {/* --- VOIP --- */}
           {activeTab === 'VOIP' && (
              <div className="space-y-6">
                 {isLoadingVoip ? (
                    <div className="flex items-center justify-center py-12">
                       <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                       <span className="ml-3 text-slate-600">Loading VOIP data...</span>
                    </div>
                 ) : (
                    <>
                       {/* Main View */}
                       {voipView === 'main' && (
                          <div className="animate-fadeIn">
                             <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                                <h2 className="text-xl font-bold text-slate-900">VOIP Integration</h2>
                                <div className="flex space-x-2">
                                   {voipProvider?.hasProvider && (
                                      <button
                                         onClick={handleSyncNumbers}
                                         disabled={isSyncing}
                                         className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-200 flex items-center disabled:opacity-50"
                                      >
                                         {isSyncing ? (
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                         ) : (
                                            <RefreshCw className="w-4 h-4 mr-2" />
                                         )}
                                         Sync
                                      </button>
                                   )}
                                   <button
                                     onClick={() => { setVoipView('import'); }}
                                     className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center"
                                   >
                                      <Plus className="w-4 h-4 mr-2" /> {voipProvider?.hasProvider ? 'Reconnect' : 'Connect'} Provider
                                   </button>
                                </div>
                             </div>

                             {voipError && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
                                   <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                                   <div>
                                      <h3 className="text-sm font-bold text-red-900">Error</h3>
                                      <p className="text-sm text-red-700 mt-1">{voipError}</p>
                                   </div>
                                </div>
                             )}

                             {voipProvider?.hasProvider ? (
                                <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex items-start space-x-3 mt-6">
                                   <CheckCircle2 className="w-5 h-5 text-blue-600 mt-0.5" />
                                   <div>
                                      <h3 className="text-sm font-bold text-blue-900">Active Provider: {voipProvider.provider?.provider}</h3>
                                      <p className="text-sm text-blue-700 mt-1">
                                         Your account is connected. {voipProvider.provider?.accountSid && `SID: ${voipProvider.provider.accountSid}`}
                                      </p>
                                   </div>
                                </div>
                             ) : (
                                <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-4 flex items-start space-x-3 mt-6">
                                   <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                                   <div>
                                      <h3 className="text-sm font-bold text-yellow-900">No VOIP Provider Connected</h3>
                                      <p className="text-sm text-yellow-700 mt-1">Connect your Twilio or other VOIP provider to start managing phone numbers.</p>
                                   </div>
                                </div>
                             )}

                             <div className="flex justify-between items-center pt-6">
                                <h3 className="text-sm font-bold text-slate-900">My Numbers ({myNumbers.length})</h3>
                             </div>

                             {myNumbers.length === 0 ? (
                                <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center">
                                   <Phone className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                                   <p className="text-slate-600 font-medium">No phone numbers yet</p>
                                   <p className="text-sm text-slate-500 mt-1">Connect a VOIP provider to import your numbers</p>
                                </div>
                             ) : (
                                <div className="border border-slate-200 rounded-lg overflow-hidden mt-2">
                                   <table className="min-w-full divide-y divide-slate-200">
                                      <thead className="bg-slate-50">
                                         <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Number</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Region</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Assigned Agent</th>
                                         </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 bg-white">
                                         {myNumbers.map(num => (
                                            <tr key={num.id} onClick={() => handleSelectNumber(num)} className="cursor-pointer hover:bg-slate-50">
                                               <td className="px-6 py-4 text-sm font-medium text-slate-900">{num.number}</td>
                                               <td className="px-6 py-4 text-sm text-slate-500">{num.region}</td>
                                               <td className="px-6 py-4 text-sm">
                                                 {num.assignedAgent ? (
                                                     <span className="font-medium text-slate-700">{num.assignedAgent.name}</span>
                                                 ) : (
                                                     <span className="text-slate-400">Unassigned</span>
                                                 )}
                                               </td>
                                            </tr>
                                         ))}
                                      </tbody>
                                   </table>
                                </div>
                             )}
                          </div>
                       )}
                    </>
                 )}
                 {/* Purchase View - Disabled for now, focus on import */}
                 {voipView === 'purchase' && (
                    <div className="animate-fadeIn">
                       <div className="flex items-center border-b border-slate-100 pb-4">
                          <button onClick={() => setVoipView('main')} className="p-2 rounded-full hover:bg-slate-100 mr-3"><ArrowLeft className="w-5 h-5 text-slate-600"/></button>
                          <h2 className="text-xl font-bold text-slate-900">Purchase Numbers</h2>
                       </div>
                       <div className="mt-8 p-8 bg-yellow-50 rounded-lg border border-yellow-200 text-center">
                          <Phone className="w-12 h-12 text-yellow-600 mx-auto mb-3" />
                          <h4 className="font-bold text-slate-900 mb-2">Number Purchasing Coming Soon</h4>
                          <p className="text-sm text-slate-600 mb-4">For now, please import your existing VOIP provider to use your phone numbers.</p>
                          <button onClick={() => setVoipView('import')} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                             Import Provider Instead
                          </button>
                       </div>
                    </div>
                 )}
                 {/* Import View */}
                 {voipView === 'import' && (
                    <div className="animate-fadeIn max-w-lg">
                       <div className="flex items-center border-b border-slate-100 pb-4 mb-6">
                          <button onClick={() => setVoipView('main')} className="p-2 rounded-full hover:bg-slate-100 mr-3"><ArrowLeft className="w-5 h-5 text-slate-600"/></button>
                          <h2 className="text-xl font-bold text-slate-900">Connect VOIP Provider</h2>
                       </div>

                       <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6">
                          <p className="text-sm text-blue-900">
                             <strong>Note:</strong> Connecting your VOIP provider will automatically import all your existing phone numbers.
                          </p>
                       </div>

                       <form onSubmit={handleImportSubmit} className="space-y-4">
                          <div>
                             <label className="block text-sm font-medium text-slate-700 mb-1">Provider</label>
                             <div className="relative">
                                <select
                                   value={importData.provider}
                                   onChange={e => setImportData({...importData, provider: e.target.value})}
                                   className="w-full border border-slate-300 rounded-lg p-2.5 bg-white outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                                >
                                   <option>Twilio</option>
                                   <option>Bland AI</option>
                                   <option>Vapi</option>
                                   <option>Vonage</option>
                                   <option>Other</option>
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                             </div>
                          </div>

                          {importData.provider === 'Twilio' ? (
                             <>
                                <div>
                                   <label className="block text-sm font-medium text-slate-700 mb-1">Account SID</label>
                                   <input
                                      required
                                      type="text"
                                      value={importData.accountSid}
                                      onChange={e => setImportData({...importData, accountSid: e.target.value})}
                                      placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxx"
                                      className="w-full font-mono text-sm border border-slate-300 rounded-lg p-2.5 bg-white outline-none focus:ring-2 focus:ring-blue-500"
                                   />
                                </div>
                                <div>
                                   <label className="block text-sm font-medium text-slate-700 mb-1">Auth Token</label>
                                   <input
                                      required
                                      type="password"
                                      value={importData.authToken}
                                      onChange={e => setImportData({...importData, authToken: e.target.value})}
                                      placeholder="••••••••••••••••••••••••••••"
                                      className="w-full font-mono text-sm border border-slate-300 rounded-lg p-2.5 bg-white outline-none focus:ring-2 focus:ring-blue-500"
                                   />
                                </div>
                             </>
                          ) : (
                             <>
                                <div>
                                   <label className="block text-sm font-medium text-slate-700 mb-1">API Key</label>
                                   <input
                                      required
                                      type="text"
                                      value={importData.apiKey}
                                      onChange={e => setImportData({...importData, apiKey: e.target.value})}
                                      placeholder="Enter your API key"
                                      className="w-full font-mono text-sm border border-slate-300 rounded-lg p-2.5 bg-white outline-none focus:ring-2 focus:ring-blue-500"
                                   />
                                </div>
                                <div>
                                   <label className="block text-sm font-medium text-slate-700 mb-1">Secret Key</label>
                                   <input
                                      required
                                      type="password"
                                      value={importData.secretKey}
                                      onChange={e => setImportData({...importData, secretKey: e.target.value})}
                                      placeholder="••••••••••••••••••••••••••••"
                                      className="w-full font-mono text-sm border border-slate-300 rounded-lg p-2.5 bg-white outline-none focus:ring-2 focus:ring-blue-500"
                                   />
                                </div>
                             </>
                          )}

                          <div className="pt-4">
                             <button
                                type="submit"
                                disabled={isImporting}
                                className="w-full bg-slate-900 text-white font-medium py-3 rounded-lg flex items-center justify-center hover:bg-slate-800 disabled:opacity-60"
                             >
                                {isImporting ? (
                                   <>
                                      <Loader2 className="w-5 h-5 animate-spin mr-2"/>
                                      Connecting & Importing...
                                   </>
                                ) : (
                                   'Connect & Import Numbers'
                                )}
                             </button>
                          </div>
                       </form>
                    </div>
                 )}
                 {/* Details View */}
                 {voipView === 'details' && selectedNumber && (
                    <div className="animate-fadeIn">
                       <div className="flex items-center border-b border-slate-100 pb-4 mb-6">
                           <button onClick={() => setVoipView('main')} className="p-2 rounded-full hover:bg-slate-100 mr-3">
                              <ArrowLeft className="w-5 h-5 text-slate-600"/>
                           </button>
                           <div>
                              <h2 className="text-xl font-bold text-slate-900">{selectedNumber.number}</h2>
                              <p className="text-sm text-slate-500">{selectedNumber.region} • {selectedNumber.country}</p>
                           </div>
                       </div>

                       <div className="max-w-md space-y-8">
                           {/* Number Details */}
                           <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                              <h3 className="text-sm font-bold text-slate-700 mb-2">Capabilities</h3>
                              <div className="flex space-x-2">
                                 {selectedNumber.capabilities.voice && (
                                    <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded">Voice</span>
                                 )}
                                 {selectedNumber.capabilities.sms && (
                                    <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded">SMS</span>
                                 )}
                                 {selectedNumber.capabilities.mms && (
                                    <span className="bg-purple-100 text-purple-700 text-xs px-2 py-1 rounded">MMS</span>
                                 )}
                              </div>
                              <p className="text-xs text-slate-500 mt-3">
                                 Monthly Cost: ${selectedNumber.monthlyCost.toFixed(2)}
                              </p>
                           </div>

                           {/* Assignment Section */}
                           <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                              <h3 className="text-base font-bold text-slate-800 mb-4">Assign to Agent</h3>
                              <label className="block text-sm font-medium text-slate-700 mb-1">Select an available agent</label>
                              <div className="relative">
                                  <select
                                      value={agentToAssign}
                                      onChange={(e) => setAgentToAssign(e.target.value)}
                                      className="w-full border border-slate-300 rounded-lg p-2.5 bg-white outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                                  >
                                      <option value="" disabled>-- Select Agent --</option>
                                      {agents
                                          .filter(agent =>
                                              !myNumbers.some(num => num.assignedAgent?.id === agent._id) ||
                                              agent._id === selectedNumber.assignedAgent?.id
                                          )
                                          .map(agent => (
                                              <option key={agent._id} value={agent._id}>
                                                  {agent.name} - {agent.title}
                                              </option>
                                          ))
                                      }
                                  </select>
                                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                              </div>

                              {selectedNumber.assignedAgent && (
                                 <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                                    <p className="text-xs text-blue-700">
                                       Currently assigned to: <strong>{selectedNumber.assignedAgent.name}</strong>
                                    </p>
                                 </div>
                              )}

                              <button
                                  onClick={handleTriggerAssignment}
                                  disabled={!agentToAssign || agentToAssign === selectedNumber.assignedAgent?.id}
                                  className="mt-4 w-full bg-slate-900 text-white font-medium py-2.5 rounded-lg hover:bg-slate-800 disabled:opacity-50"
                              >
                                  {selectedNumber.assignedAgent ? 'Re-assign Agent' : 'Assign Agent'}
                              </button>
                           </div>

                           {/* Danger Zone */}
                           <div className="border-t border-slate-200 pt-6">
                              <h3 className="text-base font-bold text-red-600">Danger Zone</h3>
                              <p className="text-sm text-slate-500 mt-1 mb-4">Releasing a number is permanent and cannot be undone.</p>
                              <button
                                  onClick={handleReleaseNumber}
                                  className="w-full text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 hover:border-red-300 font-medium py-2.5 rounded-lg"
                              >
                                  Release Number
                              </button>
                           </div>
                       </div>
                    </div>
                 )}
              </div>
           )}

           {/* --- SUBSCRIPTION --- */}
           {activeTab === 'Subscription' && (
              <div className="animate-fadeIn">
                 <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-4">Manage Subscription</h2>
                 <p className="text-slate-500 mt-4">Upgrade your plan to unlock more agents and features.</p>
                 
                 {/* Current Plan Info */}
                 {subscription && (
                   <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6">
                     <div className="flex justify-between items-center">
                       <div>
                         <p className="text-sm text-blue-700">Current Plan</p>
                         <p className="text-lg font-bold text-blue-900">{subscription.plan}</p>
                       </div>
                       <div className="text-right">
                         <p className="text-xs text-blue-600">Agent Usage</p>
                         <p className="text-sm font-bold text-blue-900">{usage?.agentCount || 0} / {usage?.limits?.agents || 1}</p>
                       </div>
                     </div>
                   </div>
                 )}

                 <div className="mt-4">
                    {/* Plan Selection */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                       {plans.map(plan => (
                          <div
                             key={plan.id}
                             onClick={() => setSelectedPlan(plan.id as 'Starter' | 'Pro' | 'Enterprise')}
                             className={`relative rounded-2xl p-6 cursor-pointer transition-all ${
                                selectedPlan === plan.id
                                   ? 'bg-white border-2 border-blue-600 shadow-xl scale-105 z-10'
                                   : 'bg-white border border-slate-200 hover:border-blue-300 opacity-80 hover:opacity-100'
                             }`}
                          >
                             {selectedPlan === plan.id && (
                                <div className="absolute top-0 right-0 transform translate-x-2 -translate-y-2">
                                   <div className="bg-blue-600 text-white rounded-full p-1 shadow-md">
                                      <Check className="w-4 h-4" />
                                   </div>
                                </div>
                             )}
                             <h3 className="text-lg font-bold text-slate-900 mb-2">{plan.id}</h3>
                             <div className="flex items-baseline mb-6">
                                {plan.activationFee === null ? (
                                  <span className="text-xl font-bold text-slate-900">Contact Sales</span>
                                ) : (
                                  <>
                                    <span className="text-3xl font-bold text-slate-900">${plan.activationFee}</span>
                                    <span className="text-slate-500 ml-1">one-time</span>
                                  </>
                                )}
                             </div>
                             <ul className="space-y-3 mb-6">
                                {plan.features.map((feat, i) => (
                                   <li key={i} className="flex items-center text-sm text-slate-600">
                                      <CheckCircle2 className="w-4 h-4 text-green-500 mr-2 shrink-0" />
                                      {feat}
                                   </li>
                                ))}
                             </ul>
                          </div>
                       ))}
                    </div>

                    {/* Add-ons (Only for Pro plan) */}
                    {selectedPlan === 'Pro' && (
                      <div className="max-w-3xl mx-auto">
                         <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center">
                            <Zap className="w-5 h-5 mr-2 text-yellow-500" />
                            Available Add-ons
                         </h3>
                         <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                            <div className="p-4 flex items-center justify-between">
                               <div className="flex items-center space-x-4">
                                  <div className="p-2 bg-indigo-50 rounded text-indigo-600">
                                     <HardDrive className="w-6 h-6" />
                                  </div>
                                  <div>
                                     <h4 className="font-bold text-slate-900">Extra Documents (10 docs)</h4>
                                     <p className="text-sm text-slate-500">Add 10 more documents to your knowledge base.</p>
                                  </div>
                               </div>
                               <div className="flex items-center space-x-4">
                                  <span className="font-bold text-slate-900">$1</span>
                                  <button
                                     onClick={() => setSelectedAddons(prev => ({...prev, extraDocs: !prev.extraDocs}))}
                                     className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${selectedAddons.extraDocs ? 'bg-blue-600' : 'bg-slate-200'}`}
                                  >
                                     <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${selectedAddons.extraDocs ? 'translate-x-5' : 'translate-x-0'}`} />
                                  </button>
                               </div>
                            </div>

                            <div className="p-4 flex items-center justify-between">
                               <div className="flex items-center space-x-4">
                                  <div className="p-2 bg-green-50 rounded text-green-600">
                                     <Smartphone className="w-6 h-6" />
                                  </div>
                                  <div>
                                     <h4 className="font-bold text-slate-900">Extra AI Agent Slot</h4>
                                     <p className="text-sm text-slate-500">Add 1 more agent (max 2 extra agents).</p>
                                  </div>
                               </div>
                               <div className="flex items-center space-x-4">
                                  <span className="font-bold text-slate-900">$20</span>
                                  <button
                                     onClick={() => setSelectedAddons(prev => ({...prev, extraAgent: !prev.extraAgent}))}
                                     className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${selectedAddons.extraAgent ? 'bg-blue-600' : 'bg-slate-200'}`}
                                  >
                                     <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${selectedAddons.extraAgent ? 'translate-x-5' : 'translate-x-0'}`} />
                                  </button>
                               </div>
                            </div>
                         </div>
                      </div>
                    )}

                    {/* Enterprise note */}
                    {selectedPlan === 'Enterprise' && (
                      <div className="max-w-3xl mx-auto bg-blue-50 border border-blue-200 rounded-xl p-6">
                        <h4 className="font-bold text-slate-900 mb-2">Enterprise Plan</h4>
                        <p className="text-sm text-slate-600">
                          Contact our sales team to discuss your requirements and get a custom quote tailored to your business needs.
                        </p>
                      </div>
                    )}
                 </div>

                 <div className="bg-slate-100 border-t border-slate-200 p-6 flex justify-between items-center rounded-b-lg -mx-8 -mb-8 mt-12">
                    <div>
                       <p className="text-sm font-medium text-slate-500">
                         {selectedPlan === 'Enterprise' ? 'Contact Sales' : 'Activation Fee + Add-ons'}
                       </p>
                       <p className="text-3xl font-bold text-slate-900">
                         {selectedPlan === 'Enterprise' ? 'Custom' : `$${calculateSubscriptionTotal().toFixed(2)}`}
                       </p>
                    </div>
                    <button
                       onClick={handleUpdateSubscription}
                       disabled={isProcessing || selectedPlan === 'Enterprise'}
                       className="px-8 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 flex items-center disabled:opacity-70"
                    >
                       {isProcessing ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Shield className="w-5 h-5 mr-2" />}
                       {selectedPlan === 'Enterprise' ? 'Contact Sales' : 'Confirm Changes'}
                    </button>
                 </div>
              </div>
           )}

           {/* --- API INTEGRATION --- */}
           {activeTab === 'API' && (
              <div className="animate-fadeIn space-y-8">
                 <div>
                    <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-4">API Integration</h2>
                    <p className="text-slate-500 mt-4">Connect your CRM, ERP, or any external system using REST APIs.</p>
                 </div>

                 {/* Generate New Key */}
                 <div className="bg-white border border-slate-200 rounded-xl p-6">
                    <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center">
                       <Key className="w-5 h-5 mr-2 text-blue-600" />
                       Generate API Key
                    </h3>
                    <div className="flex space-x-3">
                       <input
                          type="text"
                          value={newKeyName}
                          onChange={(e) => setNewKeyName(e.target.value)}
                          placeholder="Key name (e.g., My CRM Integration)"
                          className="flex-1 border border-slate-300 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                       />
                       <button
                          onClick={handleGenerateKey}
                          disabled={isGeneratingKey}
                          className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center"
                       >
                          {isGeneratingKey ? (
                             <><Loader2 className="w-4 h-4 animate-spin mr-2" />Generating...</>
                          ) : (
                             <><Plus className="w-4 h-4 mr-2" />Generate Key</>
                          )}
                       </button>
                    </div>

                    {/* Newly Generated Key (shown once) */}
                    {generatedKey && (
                       <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
                          <div className="flex items-start space-x-3">
                             <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                             <div className="flex-1">
                                <p className="text-sm font-bold text-green-900 mb-2">API Key Generated Successfully</p>
                                <p className="text-xs text-green-700 mb-3">Copy this key now. It will not be shown again.</p>
                                <div className="flex items-center space-x-2">
                                   <code className="flex-1 bg-white border border-green-300 rounded px-3 py-2 text-xs font-mono text-slate-800 break-all">
                                      {generatedKey}
                                   </code>
                                   <button
                                      onClick={() => handleCopyKey(generatedKey)}
                                      className="bg-green-600 text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-green-700 flex items-center shrink-0"
                                   >
                                      {keyCopied ? <><Check className="w-3 h-3 mr-1" />Copied</> : <><Copy className="w-3 h-3 mr-1" />Copy</>}
                                   </button>
                                </div>
                             </div>
                          </div>
                       </div>
                    )}
                 </div>

                 {/* Active API Keys */}
                 <div className="bg-white border border-slate-200 rounded-xl p-6">
                    <h3 className="text-base font-bold text-slate-900 mb-4">Your API Keys</h3>
                    {isLoadingApiKeys ? (
                       <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                          <span className="ml-3 text-slate-500 text-sm">Loading keys...</span>
                       </div>
                    ) : apiKeys.length === 0 ? (
                       <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-lg">
                          <Key className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                          <p className="text-slate-500 text-sm">No API keys yet. Generate one to get started.</p>
                       </div>
                    ) : (
                       <div className="space-y-3">
                          {apiKeys.map((key: any) => (
                             <div
                                key={key._id}
                                className={`flex items-center justify-between p-4 rounded-lg border ${
                                   key.isActive ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-60'
                                }`}
                             >
                                <div>
                                   <div className="flex items-center space-x-2">
                                      <span className="text-sm font-bold text-slate-900">{key.name}</span>
                                      {!key.isActive && (
                                         <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Revoked</span>
                                      )}
                                   </div>
                                   <code className="text-xs text-slate-500 font-mono mt-1 block">{key.prefix}...••••••••</code>
                                   <p className="text-xs text-slate-400 mt-1">
                                      Created {new Date(key.createdAt).toLocaleDateString()}
                                      {key.lastUsedAt && ` • Last used ${new Date(key.lastUsedAt).toLocaleDateString()}`}
                                   </p>
                                </div>
                                {key.isActive && (
                                   <button
                                      onClick={() => handleRevokeKey(key._id)}
                                      className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-lg"
                                      title="Revoke Key"
                                   >
                                      <Trash2 className="w-4 h-4" />
                                   </button>
                                )}
                             </div>
                          ))}
                       </div>
                    )}
                 </div>

                 {/* API Endpoints Reference */}
                 <div className="bg-white border border-slate-200 rounded-xl p-6">
                    <h3 className="text-base font-bold text-slate-900 mb-2 flex items-center">
                       <Code className="w-5 h-5 mr-2 text-indigo-600" />
                       API Endpoints
                    </h3>
                    <p className="text-sm text-slate-500 mb-4">
                       Base URL: <code className="bg-slate-100 px-2 py-0.5 rounded text-xs font-mono text-slate-700">{API_BASE}</code>
                    </p>

                    <div className="bg-slate-50 rounded-lg p-4 mb-4">
                       <p className="text-xs text-slate-600 mb-2 font-medium">Authentication Header:</p>
                       <code className="text-xs font-mono text-slate-800 bg-white px-3 py-1.5 rounded border border-slate-200 block">
                          x-api-key: sk_live_your_api_key_here
                       </code>
                    </div>

                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                       <table className="min-w-full divide-y divide-slate-200">
                          <thead className="bg-slate-50">
                             <tr>
                                <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase">Method</th>
                                <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase">Endpoint</th>
                                <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase">Description</th>
                             </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                             {apiEndpoints.map((ep, idx) => (
                                <tr key={idx} className="hover:bg-slate-50">
                                   <td className="px-4 py-2.5">
                                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                                         ep.method === 'GET' ? 'bg-green-100 text-green-700' :
                                         ep.method === 'POST' ? 'bg-blue-100 text-blue-700' :
                                         ep.method === 'PUT' ? 'bg-yellow-100 text-yellow-700' :
                                         'bg-red-100 text-red-700'
                                      }`}>
                                         {ep.method}
                                      </span>
                                   </td>
                                   <td className="px-4 py-2.5">
                                      <code className="text-xs font-mono text-slate-700">{ep.path}</code>
                                   </td>
                                   <td className="px-4 py-2.5 text-xs text-slate-600">{ep.desc}</td>
                                </tr>
                             ))}
                          </tbody>
                       </table>
                    </div>

                    {/* Example Request */}
                    <div className="mt-4">
                       <p className="text-xs text-slate-600 mb-2 font-medium">Example: Create a contact from your CRM</p>
                       <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
                          <pre className="text-xs text-green-400 font-mono whitespace-pre">{`curl -X POST ${API_BASE}/api/v1/contacts \\
  -H "x-api-key: sk_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "+1234567890",
    "company": { "name": "Acme Inc" }
  }'`}</pre>
                       </div>
                    </div>
                 </div>
              </div>
           )}

           {/* --- LEGAL --- */}
           {activeTab === 'Legal' && (
              <div className="max-w-2xl space-y-8">
                 <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-4">Privacy & Terms</h2>
                 
                 <div className="space-y-4">
                    <div className="flex items-start space-x-4 p-4 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                       <div className="p-2 bg-slate-100 rounded text-slate-600">
                          <FileText className="w-6 h-6" />
                       </div>
                       <div>
                          <h3 className="font-bold text-slate-900">Terms of Service</h3>
                          <p className="text-sm text-slate-500 mt-1">Read the terms and conditions for using Shreenika AI.</p>
                       </div>
                    </div>
                    <div className="flex items-start space-x-4 p-4 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                       <div className="p-2 bg-slate-100 rounded text-slate-600">
                          <Lock className="w-6 h-6" />
                       </div>
                       <div>
                          <h3 className="font-bold text-slate-900">Privacy Policy</h3>
                          <p className="text-sm text-slate-500 mt-1">How we handle your data and call recordings.</p>
                       </div>
                    </div>
                 </div>
                 
                 <div className="text-xs text-slate-400">
                    Last updated: November 10, 2025
                 </div>
              </div>
           )}

           {/* --- FAQ --- */}
           {activeTab === 'FAQ' && (
              <div className="max-w-3xl space-y-6">
                 <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-4">Frequently Asked Questions</h2>
                 <div className="space-y-4">
                    {FAQ_ITEMS.map((item, idx) => (
                       <div key={idx} className="bg-slate-50 rounded-lg p-5 border border-slate-100">
                          <h3 className="font-bold text-slate-900 text-sm mb-2">{item.q}</h3>
                          <p className="text-slate-600 text-sm leading-relaxed">{item.a}</p>
                       </div>
                    ))}
                 </div>
              </div>
           )}

        </div>
      </div>
      
      {/* Confirmation Modal */}
      {showAssignConfirm && selectedNumber && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-8 text-center">
                <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-8 h-8 text-yellow-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Confirm Assignment</h3>
                <p className="text-slate-500 mb-8 px-4">
                    Assigning <strong>{selectedNumber?.number}</strong> to <strong>{agentToAssign}</strong> is a permanent action and cannot be changed later. Are you sure you want to proceed?
                </p>
                <div className="flex justify-center space-x-4">
                    <button onClick={() => setShowAssignConfirm(false)} className="flex-1 px-6 py-3 border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-50">Cancel</button>
                    <button onClick={handleFinalizeAssignment} className="flex-1 px-6 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700">Confirm</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default ProfileSettings;
