
import React, { useState, useEffect } from 'react';
import { User, Shield, HelpCircle, Phone, Plus, CreditCard, Lock, FileText, ArrowLeft, Loader2, CheckCircle, ChevronDown, Download, Package, Check, Zap, HardDrive, Smartphone, CheckCircle2, RefreshCw, AlertCircle, Key, Copy, Trash2, Eye, EyeOff, Code } from 'lucide-react';
import { FAQ_ITEMS } from '../constants';
import VoipIntegrationSettings from './VoipIntegrationSettings';
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
  generateApiKey,
  listApiKeys,
  revokeApiKey,
  getInvoices,
  createRechargeCheckout,
  createAddonCheckout
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

// ── Change Password sub-component ─────────────────────────────────────────────
const ProfileTab: React.FC<{ user: { name: string; email: string; role: string } }> = ({ user }) => {
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwStatus, setPwStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [pwError, setPwError] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwError('New passwords do not match.');
      return;
    }
    if (pwForm.newPassword.length < 6) {
      setPwError('New password must be at least 6 characters.');
      return;
    }
    setPwStatus('loading');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/auth/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to change password');
      setPwStatus('success');
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setPwStatus('idle'), 3000);
    } catch (err: any) {
      setPwError(err.message);
      setPwStatus('error');
    }
  };

  return (
    <div className="max-w-lg space-y-8">
      <div>
        <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-4">My Profile</h2>
        <div className="flex items-center space-x-6 mt-4">
          <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-2xl font-bold">
            {user.name.charAt(0).toUpperCase()}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 mt-4">
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
      </div>

      {/* Change Password */}
      <div>
        <h3 className="text-lg font-semibold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
          <Lock className="w-4 h-4" /> Change Password
        </h3>
        <form onSubmit={handleChangePassword} className="mt-4 space-y-4">
          <div className="relative">
            <label className="block text-sm font-medium text-slate-700 mb-1">Current Password</label>
            <input
              type={showCurrent ? 'text' : 'password'}
              required
              className="w-full border border-slate-300 rounded-lg p-2.5 pr-10"
              value={pwForm.currentPassword}
              onChange={e => setPwForm({ ...pwForm, currentPassword: e.target.value })}
            />
            <button type="button" onClick={() => setShowCurrent(v => !v)} className="absolute right-3 top-8 text-slate-400">
              {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <div className="relative">
            <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
            <input
              type={showNew ? 'text' : 'password'}
              required
              className="w-full border border-slate-300 rounded-lg p-2.5 pr-10"
              value={pwForm.newPassword}
              onChange={e => setPwForm({ ...pwForm, newPassword: e.target.value })}
            />
            <button type="button" onClick={() => setShowNew(v => !v)} className="absolute right-3 top-8 text-slate-400">
              {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Confirm New Password</label>
            <input
              type="password"
              required
              className="w-full border border-slate-300 rounded-lg p-2.5"
              value={pwForm.confirmPassword}
              onChange={e => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
            />
          </div>
          {pwError && <p className="text-sm text-red-600">{pwError}</p>}
          {pwStatus === 'success' && <p className="text-sm text-green-600 flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Password changed successfully.</p>}
          <button
            type="submit"
            disabled={pwStatus === 'loading'}
            className="bg-slate-900 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2"
          >
            {pwStatus === 'loading' && <Loader2 className="w-4 h-4 animate-spin" />}
            Update Password
          </button>
        </form>
      </div>
    </div>
  );
};

const ProfileSettings: React.FC = () => {
  const [activeTab, setActiveTab] = useState('Profile');
  const [user] = useState(() => {
     const u = localStorage.getItem('user');
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

  const [importData, setImportData] = useState({ provider: 'Twilio', accountSid: '', authToken: '', apiKey: '', secretKey: '', did: '', endpointUrl: '' });
  const [isImporting, setIsImporting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Subscription State (Real Data)
  const [subscription, setSubscription] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [selectedPlan, setSelectedPlan] = useState<'Starter' | 'Pro' | 'Enterprise'>('Starter');
  // selectedAddons removed — add-ons system replaced by PLAN_CONFIG
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);

  // Invoice State
  const [invoices, setInvoices] = useState<any[]>([]);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);

  // Recharge / Addon State
  const [rechargeMinutes, setRechargeMinutes] = useState(100);
  const [isRecharging, setIsRecharging] = useState(false);
  const [isAddingDocs, setIsAddingDocs] = useState(false);

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

  const PLAN_CONFIG: Record<string, { monthlyPrice: number; setupFee: number; includedMinutes: number; agentLimit: number; docLimit: number; rechargeRate: number | null; features: string[] }> = {
    Starter:    { monthlyPrice: 2499,  setupFee: 0,     includedMinutes: 400,  agentLimit: 1,  docLimit: 0,   rechargeRate: null, features: ['1 AI Agent', '0 Documents', '400 mins/month', 'Pay-as-you-go calls', 'Standard Support'] },
    Pro:        { monthlyPrice: 7999,  setupFee: 4999,  includedMinutes: 1500, agentLimit: 5,  docLimit: 25,  rechargeRate: 5.50, features: ['5 AI Agents', '25 Documents', '1500 mins/month', 'Knowledge Base', 'Priority Support', 'Buy More Minutes'] },
    Enterprise: { monthlyPrice: 19999, setupFee: 14999, includedMinutes: 5000, agentLimit: 99, docLimit: 990, rechargeRate: 3.99, features: ['Unlimited Agents', '990 Documents', '5000 mins/month', 'Advanced Training', 'Dedicated Account Manager', 'SLA'] },
  };

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
    // Load invoices in parallel (non-blocking)
    setIsLoadingInvoices(true);
    try {
      const invData = await getInvoices();
      setInvoices(Array.isArray(invData) ? invData : invData?.invoices || []);
    } catch {
      setInvoices([]);
    } finally {
      setIsLoadingInvoices(false);
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
      const data = await listApiKeys();
      // Backend returns { apiKey: null|string, masked: null|string }
      setApiKeys(data as any);
    } catch (error: any) {
      console.error('Failed to load API key:', error);
    } finally {
      setIsLoadingApiKeys(false);
    }
  };

  const handleGenerateKey = async () => {
    setIsGeneratingKey(true);
    try {
      const result = await generateApiKey();
      setGeneratedKey(result.apiKey);
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

  const API_BASE = import.meta.env.VITE_API_BASE_URL || "https://shreenika-ai-backend-507468019722.us-central1.run.app";

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

  const handleUpdateSubscription = async () => {
    setIsProcessing(true);
    const minutesBalance = subscription?.minutesBalance ?? 0;
    try {
      // Same plan but 0 minutes — re-activate via Stripe checkout
      if (subscription && selectedPlan === subscription.plan && minutesBalance === 0) {
        const response = await updatePlan(selectedPlan);
        if (response.requiresPayment && response.checkoutUrl) {
          window.location.href = response.checkoutUrl;
          return;
        }
      }

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

      await loadSubscriptionData();
      setIsProcessing(false);
      alert('Subscription updated successfully!');
    } catch (error: any) {
      console.error('Subscription update failed:', error);
      setIsProcessing(false);
      alert('Update failed: ' + (error.message || 'Unknown error'));
    }
  };

  const handleRechargeMinutes = async () => {
    if (rechargeMinutes < 100) { alert('Minimum recharge is 100 minutes.'); return; }
    setIsRecharging(true);
    try {
      const result = await createRechargeCheckout(rechargeMinutes);
      if (result?.checkoutUrl) window.location.href = result.checkoutUrl;
      else alert(result?.message || 'Recharge initiated');
    } catch (err: any) {
      alert(err.message || 'Recharge failed');
    } finally {
      setIsRecharging(false);
    }
  };

  const handleBuyDocAddon = async () => {
    setIsAddingDocs(true);
    try {
      const result = await createAddonCheckout('docs');
      if (result?.checkoutUrl) window.location.href = result.checkoutUrl;
      else alert(result?.message || 'Addon purchase initiated');
    } catch (err: any) {
      alert(err.message || 'Addon purchase failed');
    } finally {
      setIsAddingDocs(false);
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
        if (!importData.accountSid || !importData.authToken) {
          setVoipError('Account SID and Auth Token are required for Twilio');
          setIsImporting(false);
          return;
        }
        payload.accountSid = importData.accountSid;
        payload.authToken = importData.authToken;
      } else if (importData.provider === 'Others') {
        // For "Others": API Key, Secret Key, and DID are required
        if (!importData.apiKey || !importData.secretKey || !importData.did) {
          setVoipError('API Key, Secret Key, and DID (Phone Number) are required for third-party providers');
          setIsImporting(false);
          return;
        }
        payload.apiKey = importData.apiKey;
        payload.secretKey = importData.secretKey;
        payload.did = importData.did;
        payload.provider = 'Others'; // Normalize to 'Others'
        // Endpoint URL is optional
        if (importData.endpointUrl) {
          payload.endpointUrl = importData.endpointUrl;
        }
      }

      await addVoipProvider(payload);

      // Reload VOIP data
      await loadVoipData();

      setImportData({ provider: 'Twilio', accountSid: '', authToken: '', apiKey: '', secretKey: '', did: '', endpointUrl: '' });
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
              <ProfileTab user={user} />
           )}

           {/* --- VOIP --- */}
           {activeTab === 'VOIP' && (
              <VoipIntegrationSettings />
           )}

           {/* --- SUBSCRIPTION --- */}
           {activeTab === 'Subscription' && (
              <div className="animate-fadeIn">
                 <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-4">Manage Subscription</h2>
                 <p className="text-slate-500 mt-4">Upgrade your plan to unlock more agents and features.</p>

                 {isLoadingSubscription && (
                   <div className="flex items-center justify-center py-12">
                     <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                   </div>
                 )}

                 {subscriptionError && (
                   <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center space-x-3">
                     <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                     <p className="text-red-700 text-sm">{subscriptionError}</p>
                   </div>
                 )}

                 {/* Current Plan Info with Minutes Balance */}
                 {subscription && (() => {
                   const minutesBalance = subscription.minutesBalance ?? 0;
                   const minutesIncluded = subscription.minutesIncluded ?? PLAN_CONFIG[subscription.plan]?.includedMinutes ?? 0;
                   const minutesPct = minutesIncluded > 0 ? Math.min(100, (minutesBalance / minutesIncluded) * 100) : 0;
                   const barColor = minutesPct < 20 ? 'bg-red-500' : minutesPct < 50 ? 'bg-yellow-500' : 'bg-indigo-500';
                   return (
                     <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 mb-6 space-y-3">
                       <div className="flex justify-between items-center">
                         <div>
                           <p className="text-xs text-blue-600 font-medium uppercase tracking-wide">Current Plan</p>
                           <p className="text-xl font-bold text-blue-900">{subscription.plan}</p>
                         </div>
                         <div className="text-right">
                           <p className="text-xs text-blue-600">Status</p>
                           <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${subscription.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                             {subscription.status}
                           </span>
                         </div>
                       </div>
                       <div>
                         <div className="flex justify-between text-xs text-blue-700 mb-1">
                           <span>Minutes Balance</span>
                           <span className="font-bold">{minutesBalance.toFixed(0)} / {minutesIncluded} mins</span>
                         </div>
                         <div className="w-full bg-blue-200 rounded-full h-2.5">
                           <div className={`h-2.5 rounded-full transition-all ${barColor}`} style={{ width: `${minutesPct}%` }} />
                         </div>
                         {minutesBalance === 0 && (
                           <p className="text-xs text-red-600 mt-1 font-medium">No minutes remaining — activate your plan to continue.</p>
                         )}
                       </div>
                       <div className="grid grid-cols-3 gap-3 pt-1">
                         <div className="text-center">
                           <p className="text-xs text-blue-600">Agents</p>
                           <p className="text-sm font-bold text-blue-900">{subscription.effectiveLimits?.agents ?? PLAN_CONFIG[subscription.plan]?.agentLimit ?? '-'}</p>
                         </div>
                         <div className="text-center">
                           <p className="text-xs text-blue-600">Documents</p>
                           <p className="text-sm font-bold text-blue-900">{subscription.effectiveLimits?.documents ?? PLAN_CONFIG[subscription.plan]?.docLimit ?? '-'}</p>
                         </div>
                         <div className="text-center">
                           <p className="text-xs text-blue-600">Monthly Rate</p>
                           <p className="text-sm font-bold text-blue-900">₹{PLAN_CONFIG[subscription.plan]?.monthlyPrice?.toLocaleString('en-IN') ?? '-'}</p>
                         </div>
                       </div>
                     </div>
                   );
                 })()}

                 <div className="mt-4">
                    {/* Plan Selection */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                       {(Object.keys(PLAN_CONFIG) as Array<'Starter' | 'Pro' | 'Enterprise'>).map(planId => {
                         const plan = PLAN_CONFIG[planId];
                         return (
                           <div
                             key={planId}
                             onClick={() => setSelectedPlan(planId)}
                             className={`relative rounded-2xl p-6 cursor-pointer transition-all ${
                               selectedPlan === planId
                                 ? 'bg-white border-2 border-blue-600 shadow-xl scale-105 z-10'
                                 : 'bg-white border border-slate-200 hover:border-blue-300 opacity-80 hover:opacity-100'
                             }`}
                           >
                             {selectedPlan === planId && (
                               <div className="absolute top-0 right-0 transform translate-x-2 -translate-y-2">
                                 <div className="bg-blue-600 text-white rounded-full p-1 shadow-md">
                                   <Check className="w-4 h-4" />
                                 </div>
                               </div>
                             )}
                             <h3 className="text-lg font-bold text-slate-900 mb-1">{planId}</h3>
                             <div className="flex items-baseline mb-1">
                               <span className="text-2xl font-bold text-slate-900">₹{plan.monthlyPrice.toLocaleString('en-IN')}</span>
                               <span className="text-slate-500 text-sm ml-1">/mo</span>
                             </div>
                             {plan.setupFee > 0 && (
                               <p className="text-xs text-slate-400 mb-4">+ ₹{plan.setupFee.toLocaleString('en-IN')} one-time setup</p>
                             )}
                             <ul className="space-y-2 mt-4">
                               {plan.features.map((feat, i) => (
                                 <li key={i} className="flex items-center text-sm text-slate-600">
                                   <CheckCircle2 className="w-4 h-4 text-green-500 mr-2 shrink-0" />
                                   {feat}
                                 </li>
                               ))}
                             </ul>
                           </div>
                         );
                       })}
                    </div>

                    {/* Enterprise contact note */}
                    {selectedPlan === 'Enterprise' && (
                      <div className="max-w-3xl mx-auto bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8">
                        <h4 className="font-bold text-slate-900 mb-2">Enterprise Plan</h4>
                        <p className="text-sm text-slate-600">
                          Contact our sales team to discuss your requirements and get a custom quote tailored to your business needs.
                        </p>
                      </div>
                    )}
                 </div>

                 {/* Footer */}
                 <div className="bg-slate-100 border-t border-slate-200 p-6 flex justify-between items-center rounded-b-lg -mx-8 -mb-8 mt-4">
                    <div>
                       <p className="text-sm font-medium text-slate-500">
                         {selectedPlan === 'Enterprise' ? 'Custom Pricing' : 'Monthly Subscription'}
                       </p>
                       <p className="text-3xl font-bold text-slate-900">
                         {selectedPlan === 'Enterprise' ? 'Contact Sales' : `₹${PLAN_CONFIG[selectedPlan].monthlyPrice.toLocaleString('en-IN')}`}
                       </p>
                       {selectedPlan !== 'Enterprise' && PLAN_CONFIG[selectedPlan].setupFee > 0 && (
                         <p className="text-xs text-slate-500">+ ₹{PLAN_CONFIG[selectedPlan].setupFee.toLocaleString('en-IN')} one-time setup fee</p>
                       )}
                    </div>
                    {(() => {
                      const minutesBalance = subscription?.minutesBalance ?? 0;
                      const isSamePlan = selectedPlan === subscription?.plan;
                      const isAlreadyActive = isSamePlan && minutesBalance > 0;
                      const buttonLabel = isAlreadyActive
                        ? 'Already Active'
                        : isSamePlan && minutesBalance === 0
                        ? 'Activate & Pay via Stripe'
                        : 'Confirm & Pay via Stripe';
                      return selectedPlan === 'Enterprise' ? (
                          <a
                            href="mailto:sales@shreenika.ai?subject=Enterprise Plan Enquiry"
                            className="px-8 py-3 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800 shadow-lg flex items-center"
                          >
                            <CreditCard className="w-5 h-5 mr-2" />
                            Contact Sales
                          </a>
                        ) : (
                          <button
                            onClick={handleUpdateSubscription}
                            disabled={isProcessing || isAlreadyActive}
                            className="px-8 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 flex items-center disabled:opacity-70"
                          >
                            {isProcessing ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CreditCard className="w-5 h-5 mr-2" />}
                            {buttonLabel}
                          </button>
                        );
                    })()}
                 </div>

                 {/* Add-ons — only for Pro/Enterprise */}
                 {subscription && subscription.plan !== 'Starter' && (
                   <div className="border-t border-slate-100 pt-6 space-y-4">
                     <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                       <Package className="w-4 h-4" /> Add-ons
                     </h3>

                     {/* Buy Minutes */}
                     <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                       <div className="flex-1">
                         <p className="font-semibold text-slate-900">Buy Extra Minutes</p>
                         <p className="text-sm text-slate-500">
                           ₹{PLAN_CONFIG[subscription.plan]?.rechargeRate?.toFixed(2) || '2.25'}/min — minimum 100 mins
                         </p>
                       </div>
                       <div className="flex items-center gap-2">
                         <input
                           type="number"
                           min={100}
                           step={100}
                           value={rechargeMinutes}
                           onChange={e => setRechargeMinutes(Math.max(100, Number(e.target.value)))}
                           className="border border-slate-300 rounded-lg p-2 w-24 text-sm"
                         />
                         <span className="text-sm text-slate-500">mins</span>
                         <button
                           onClick={handleRechargeMinutes}
                           disabled={isRecharging}
                           className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1"
                         >
                           {isRecharging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                           Buy
                         </button>
                       </div>
                     </div>

                     {/* Buy Documents Addon */}
                     <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                       <div className="flex-1">
                         <p className="font-semibold text-slate-900">Add 10 Documents</p>
                         <p className="text-sm text-slate-500">Expand your knowledge base — ₹830 one-time</p>
                       </div>
                       <button
                         onClick={handleBuyDocAddon}
                         disabled={isAddingDocs}
                         className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1"
                       >
                         {isAddingDocs ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4" />}
                         Purchase
                       </button>
                     </div>
                   </div>
                 )}

                 {/* Invoice History */}
                 <div className="border-t border-slate-100 pt-6">
                   <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                     <FileText className="w-4 h-4" /> Invoice History
                   </h3>
                   {isLoadingInvoices ? (
                     <div className="flex items-center gap-2 text-slate-500 text-sm py-4">
                       <Loader2 className="w-4 h-4 animate-spin" /> Loading invoices...
                     </div>
                   ) : invoices.length === 0 ? (
                     <p className="text-slate-400 text-sm py-4">No invoices yet.</p>
                   ) : (
                     <div className="overflow-x-auto">
                       <table className="w-full text-sm">
                         <thead>
                           <tr className="text-left text-xs font-medium text-slate-500 uppercase border-b border-slate-100">
                             <th className="pb-2 pr-4">Date</th>
                             <th className="pb-2 pr-4">Description</th>
                             <th className="pb-2 pr-4">Amount</th>
                             <th className="pb-2">Status</th>
                           </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-50">
                           {invoices.map((inv: any) => (
                             <tr key={inv._id || inv.id} className="py-2">
                               <td className="py-2 pr-4 text-slate-500">
                                 {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                               </td>
                               <td className="py-2 pr-4 text-slate-700">{inv.description || inv.type || 'Subscription'}</td>
                               <td className="py-2 pr-4 font-medium text-slate-900">
                                 ₹{((inv.amount || 0) / 100).toLocaleString('en-IN')}
                               </td>
                               <td className="py-2">
                                 <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${inv.status === 'paid' ? 'bg-green-100 text-green-700' : inv.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                   {inv.status || 'pending'}
                                 </span>
                               </td>
                             </tr>
                           ))}
                         </tbody>
                       </table>
                     </div>
                   )}
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

                 {/* API Key Management — single key per account */}
                 <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                    <h3 className="text-base font-bold text-slate-900 flex items-center">
                       <Key className="w-5 h-5 mr-2 text-blue-600" />
                       Your API Key
                    </h3>
                    <p className="text-sm text-slate-500">One API key per account. Regenerating will invalidate the previous key.</p>

                    {isLoadingApiKeys ? (
                       <div className="flex items-center gap-2 text-slate-500 text-sm py-2">
                          <Loader2 className="w-4 h-4 animate-spin" /> Loading...
                       </div>
                    ) : (
                       <div className="flex items-center gap-3">
                          <code className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm font-mono text-slate-700 break-all">
                             {(apiKeys as any)?.masked || '— No key generated yet —'}
                          </code>
                          {(apiKeys as any)?.masked && (
                             <button
                                onClick={() => handleCopyKey((apiKeys as any).masked)}
                                className="border border-slate-200 px-3 py-2.5 rounded-lg text-sm hover:bg-slate-50 flex items-center gap-1 shrink-0"
                             >
                                {keyCopied ? <><Check className="w-3 h-3" />Copied</> : <><Copy className="w-3 h-3" />Copy</>}
                             </button>
                          )}
                       </div>
                    )}

                    {/* Newly generated key shown once */}
                    {generatedKey && (
                       <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                          <div className="flex items-start space-x-3">
                             <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                             <div className="flex-1">
                                <p className="text-sm font-bold text-green-900 mb-1">New Key Generated</p>
                                <p className="text-xs text-green-700 mb-3">Copy this key now — it will not be shown again.</p>
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

                    <button
                       onClick={handleGenerateKey}
                       disabled={isGeneratingKey}
                       className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                    >
                       {isGeneratingKey ? <><Loader2 className="w-4 h-4 animate-spin" />Generating...</> : <><RefreshCw className="w-4 h-4" />{(apiKeys as any)?.masked ? 'Regenerate Key' : 'Generate Key'}</>}
                    </button>
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
