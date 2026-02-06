
import React, { useState } from 'react';
import { 
  Users, 
  DollarSign, 
  Activity, 
  CheckCircle, 
  XCircle, 
  Search, 
  CreditCard, 
  Download,
  Settings,
  TrendingUp,
  Shield,
  Key,
  Mic,
  Save,
  LogIn,
  Ban,
  Plus,
  X,
  Sliders,
  Volume2
} from 'lucide-react';
import { MOCK_CLIENTS, MOCK_TRANSACTIONS, VOICE_OPTIONS } from '../constants';

const SuperAdmin: React.FC = () => {
  const [activeTab, setActiveTab] = useState('Dashboard');
  
  // Mock State for Pricing Engine
  const [profitMargin, setProfitMargin] = useState(30); 
  const [baseRate, setBaseRate] = useState(0.05); 
  
  // Mock State for Global Config
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({
     openai: 'sk-........................',
     anthropic: '',
     twilio_sid: 'AC.......................',
     twilio_token: '.........................',
     stripe_public: 'pk_live_................',
     vapi_private: '........................'
  });

  // Local State for Voices
  const [voices, setVoices] = useState(VOICE_OPTIONS.map(v => ({
     ...v, 
     isActive: true,
     settings: {
        stability: 0.5,
        temperature: 0.7,
        loudness: 1.0,
        emotions: 0.5
     }
  })));

  // --- MODAL STATES ---
  const [showAddProviderModal, setShowAddProviderModal] = useState(false);
  const [newProvider, setNewProvider] = useState({ name: '', key: '', type: 'LLM' });

  const [showAddVoiceModal, setShowAddVoiceModal] = useState(false);
  const [newVoice, setNewVoice] = useState({ name: '', gender: 'Female', provider: 'ElevenLabs', voiceId: '' });

  const [editingVoiceId, setEditingVoiceId] = useState<string | null>(null);

  // --- HANDLERS ---

  const handleLoginAsClient = (client: any) => {
     if (window.confirm(`Are you sure you want to login as ${client.companyName}? You will be signed out of Admin.`)) {
        const mockUser = {
           name: client.companyName,
           email: client.email,
           role: 'user', 
           plan: client.plan
        };
        localStorage.setItem('voxai_user', JSON.stringify(mockUser));
        window.location.href = '/dashboard';
     }
  };

  const handleAddProvider = (e: React.FormEvent) => {
     e.preventDefault();
     if(newProvider.name && newProvider.key) {
        const keyName = newProvider.name.toLowerCase().replace(/\s+/g, '_');
        setApiKeys(prev => ({ ...prev, [keyName]: newProvider.key }));
        setShowAddProviderModal(false);
        setNewProvider({ name: '', key: '', type: 'LLM' });
     }
  };

  const handleAddVoice = (e: React.FormEvent) => {
     e.preventDefault();
     if(newVoice.name && newVoice.voiceId) {
        const voiceObj = {
           id: newVoice.voiceId, 
           name: `${newVoice.name} (${newVoice.provider})`,
           gender: newVoice.gender,
           isActive: true,
           settings: { stability: 0.5, temperature: 0.7, loudness: 1.0, emotions: 0.5 }
        };
        setVoices(prev => [...prev, voiceObj]);
        setShowAddVoiceModal(false);
        setNewVoice({ name: '', gender: 'Female', provider: 'ElevenLabs', voiceId: '' });
     }
  };

  const updateVoiceSetting = (setting: string, value: number) => {
     if(!editingVoiceId) return;
     setVoices(prev => prev.map(v => {
        if(v.id === editingVoiceId) {
           return { ...v, settings: { ...v.settings, [setting]: value } };
        }
        return v;
     }));
  };

  const currentEditingVoice = voices.find(v => v.id === editingVoiceId);

  return (
    <div className="space-y-8 animate-fadeIn pb-20 relative">
      
      {/* Header & Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Super Admin Console</h1>
          <p className="text-slate-500">Platform Control Center • Priority Technologies Inc.</p>
        </div>
        
        <div className="bg-white p-1 rounded-lg border border-slate-200 shadow-sm flex">
           {['Dashboard', 'Clients', 'Pricing', 'Configuration'].map(tab => (
              <button
                 key={tab}
                 onClick={() => setActiveTab(tab)}
                 className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                    activeTab === tab 
                       ? 'bg-slate-900 text-white shadow-sm' 
                       : 'text-slate-600 hover:bg-slate-50'
                 }`}
              >
                 {tab}
              </button>
           ))}
        </div>
      </div>

      {/* --- DASHBOARD TAB --- */}
      {activeTab === 'Dashboard' && (
         <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                  <div>
                     <p className="text-sm font-medium text-slate-500 mb-1">Total Revenue</p>
                     <h3 className="text-3xl font-bold text-slate-900">$6,000.00</h3>
                     <p className="text-xs text-green-600 mt-1 flex items-center"><Activity className="w-3 h-3 mr-1" /> +12% this month</p>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg text-blue-700">
                     <DollarSign className="w-6 h-6" />
                  </div>
               </div>
               <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                  <div>
                     <p className="text-sm font-medium text-slate-500 mb-1">Active Clients</p>
                     <h3 className="text-3xl font-bold text-slate-900">24</h3>
                     <p className="text-xs text-slate-400 mt-1">Total 28 Registered</p>
                  </div>
                  <div className="p-3 bg-orange-50 rounded-lg text-orange-600">
                     <Users className="w-6 h-6" />
                  </div>
               </div>
               <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                  <div>
                     <p className="text-sm font-medium text-slate-500 mb-1">Pending Payments</p>
                     <h3 className="text-3xl font-bold text-slate-900">$1,250</h3>
                     <p className="text-xs text-red-500 mt-1">5 invoices overdue</p>
                  </div>
                  <div className="p-3 bg-red-50 rounded-lg text-red-600">
                     <CreditCard className="w-6 h-6" />
                  </div>
               </div>
            </div>

            {/* Recent Transactions */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
               <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                  <h2 className="font-bold text-slate-800">Recent Transactions</h2>
                  <button className="text-slate-500 hover:text-slate-800 flex items-center text-sm">
                     <Download className="w-4 h-4 mr-1" /> Export CSV
                  </button>
               </div>
               <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                     <thead className="bg-slate-50">
                        <tr>
                           <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                           <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Client</th>
                           <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Method</th>
                           <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                           <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100">
                        {MOCK_TRANSACTIONS.map(tx => (
                           <tr key={tx.id} className="hover:bg-slate-50">
                              <td className="px-6 py-4 text-sm text-slate-600">{tx.date}</td>
                              <td className="px-6 py-4 text-sm font-medium text-slate-900">{tx.clientName}</td>
                              <td className="px-6 py-4 text-sm text-slate-600">{tx.method}</td>
                              <td className="px-6 py-4 text-sm font-bold text-slate-900">${tx.amount.toLocaleString()}</td>
                              <td className="px-6 py-4">
                                 <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                    tx.status === 'Success' ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'
                                 }`}>
                                    {tx.status}
                                 </span>
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </div>
         </div>
      )}

      {/* --- CLIENT MANAGEMENT TAB --- */}
      {activeTab === 'Clients' && (
         <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
               <h2 className="font-bold text-slate-800">Client Management</h2>
               <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="text" placeholder="Search companies..." className="pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none w-64" />
               </div>
            </div>
            <div className="overflow-x-auto">
               <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-white">
                     <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Company Details</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Plan</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Revenue</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                     {MOCK_CLIENTS.map(client => (
                        <tr key={client.id} className="hover:bg-slate-50">
                           <td className="px-6 py-4">
                              <div className="text-sm font-bold text-slate-900">{client.companyName}</div>
                              <div className="text-xs text-slate-500">{client.email}</div>
                              <div className="text-[10px] text-slate-400 mt-0.5">ID: {client.id}</div>
                           </td>
                           <td className="px-6 py-4">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                 {client.plan}
                              </span>
                           </td>
                           <td className="px-6 py-4 text-sm font-medium text-slate-700">${client.totalSpent.toLocaleString()}</td>
                           <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                 client.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              }`}>
                                 {client.status === 'Active' ? <CheckCircle className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                                 {client.status}
                              </span>
                           </td>
                           <td className="px-6 py-4 text-right flex justify-end space-x-2">
                              <button 
                                 onClick={() => handleLoginAsClient(client)}
                                 className="text-slate-500 hover:text-blue-600 p-2 rounded hover:bg-blue-50 transition-colors" 
                                 title="Login as User"
                              >
                                 <LogIn className="w-4 h-4" />
                              </button>
                              <button className="text-slate-500 hover:text-orange-600 p-2 rounded hover:bg-orange-50 transition-colors" title="Add Credits">
                                 <DollarSign className="w-4 h-4" />
                              </button>
                              <button className="text-slate-500 hover:text-red-600 p-2 rounded hover:bg-red-50 transition-colors" title="Suspend Account">
                                 <Ban className="w-4 h-4" />
                              </button>
                           </td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
         </div>
      )}

      {/* --- PRICING ENGINE TAB --- */}
      {activeTab === 'Pricing' && (
         <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Markup Controller */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
               <div className="flex items-center space-x-2 mb-6">
                  <div className="p-2 bg-green-100 text-green-700 rounded-lg">
                     <TrendingUp className="w-5 h-5" />
                  </div>
                  <h2 className="text-lg font-bold text-slate-900">Profit Margins</h2>
               </div>
               
               <div className="space-y-6">
                  <div>
                     <label className="block text-sm font-medium text-slate-700 mb-2">Global Markup Percentage</label>
                     <div className="flex items-center space-x-4">
                        <input 
                           type="range" 
                           min="0" max="100" 
                           value={profitMargin} 
                           onChange={(e) => setProfitMargin(parseInt(e.target.value))}
                           className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-green-600"
                        />
                        <span className="text-xl font-bold text-green-700 w-16 text-right">{profitMargin}%</span>
                     </div>
                     <p className="text-xs text-slate-500 mt-2">Applied to all usage-based billing (STT, TTS, LLM).</p>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                     <div className="flex justify-between text-sm mb-2">
                        <span className="text-slate-500">Base Cost (Provider):</span>
                        <span className="font-mono text-slate-700">${baseRate}/min</span>
                     </div>
                     <div className="flex justify-between text-sm mb-2">
                        <span className="text-slate-500">Client Price:</span>
                        <span className="font-mono font-bold text-slate-900">${(baseRate * (1 + profitMargin/100)).toFixed(3)}/min</span>
                     </div>
                     <div className="border-t border-slate-200 my-2 pt-2 flex justify-between text-sm">
                        <span className="text-green-600 font-bold">Your Profit:</span>
                        <span className="font-mono font-bold text-green-600">+${(baseRate * (profitMargin/100)).toFixed(3)}/min</span>
                     </div>
                  </div>

                  <button className="w-full bg-slate-900 text-white py-2 rounded-lg font-medium hover:bg-slate-800 transition-colors">
                     Update Pricing Rules
                  </button>
               </div>
            </div>

            {/* Plan Configuration */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 lg:col-span-2">
               <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-2">
                     <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                        <Shield className="w-5 h-5" />
                     </div>
                     <h2 className="text-lg font-bold text-slate-900">Subscription Plans</h2>
                  </div>
                  <button className="text-sm text-blue-600 font-bold hover:underline">+ Add Plan</button>
               </div>

               <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                     <thead>
                        <tr>
                           <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase">Plan Name</th>
                           <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase">Monthly Price</th>
                           <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase">Limits</th>
                           <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500 uppercase">Edit</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100">
                        {[
                           { name: 'Starter', price: 29, limits: '1 Agent, 1k mins' },
                           { name: 'Pro', price: 99, limits: '5 Agents, 5k mins' },
                           { name: 'Enterprise', price: 299, limits: 'Unlimited' },
                        ].map(plan => (
                           <tr key={plan.name}>
                              <td className="px-4 py-3 text-sm font-bold text-slate-900">{plan.name}</td>
                              <td className="px-4 py-3">
                                 <input type="number" defaultValue={plan.price} className="w-20 border border-slate-300 rounded px-2 py-1 text-sm text-slate-900" />
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-500">{plan.limits}</td>
                              <td className="px-4 py-3 text-right">
                                 <button className="text-blue-600 hover:text-blue-800 font-medium text-xs">Edit</button>
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </div>
         </div>
      )}

      {/* --- CONFIGURATION TAB --- */}
      {activeTab === 'Configuration' && (
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* API Keys */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
               <div className="flex justify-between items-center mb-6">
                  <div className="flex items-center space-x-2">
                     <div className="p-2 bg-purple-100 text-purple-700 rounded-lg">
                        <Key className="w-5 h-5" />
                     </div>
                     <h2 className="text-lg font-bold text-slate-900">Master API Keys</h2>
                  </div>
                  <button 
                     onClick={() => setShowAddProviderModal(true)}
                     className="bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-800 transition-colors flex items-center shadow-sm"
                  >
                     <Plus className="w-3 h-3 mr-1.5" /> Add Provider
                  </button>
               </div>
               
               <div className="space-y-4">
                  {Object.entries(apiKeys).map(([key, val]) => (
                     <div key={key}>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{key.replace('_', ' ')}</label>
                        <div className="relative">
                           <input 
                              type="password" 
                              value={val}
                              readOnly 
                              className="w-full border border-slate-300 rounded-lg py-2 pl-3 pr-10 text-sm font-mono text-slate-700 bg-slate-50"
                           />
                           <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500">
                              <CheckCircle className="w-4 h-4" />
                           </div>
                        </div>
                     </div>
                  ))}
                  <div className="pt-4 flex justify-end">
                     <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center">
                        <Save className="w-4 h-4 mr-2" /> Save Keys
                     </button>
                  </div>
               </div>
            </div>

            {/* Voice Marketplace */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
               <div className="flex justify-between items-center mb-6">
                  <div className="flex items-center space-x-2">
                     <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
                        <Mic className="w-5 h-5" />
                     </div>
                     <h2 className="text-lg font-bold text-slate-900">Voice Marketplace</h2>
                  </div>
                  <button 
                     onClick={() => setShowAddVoiceModal(true)}
                     className="bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-800 transition-colors flex items-center shadow-sm"
                  >
                     <Plus className="w-3 h-3 mr-1.5" /> Add Voice
                  </button>
               </div>
               
               <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                  <p className="text-sm text-slate-500">Configure voices available to your clients.</p>
                  
                  {voices.map(voice => (
                     <div key={voice.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                        <div className="flex items-center space-x-3">
                           <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs">
                              {voice.name.charAt(0)}
                           </div>
                           <div>
                              <p className="text-sm font-bold text-slate-900">{voice.name}</p>
                              <p className="text-xs text-slate-500">{voice.gender} • Vapi.ai</p>
                           </div>
                        </div>
                        
                        <div className="flex items-center space-x-3">
                           <button 
                              onClick={() => setEditingVoiceId(voice.id)}
                              className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-200 rounded-md transition-colors"
                           >
                              <Settings className="w-4 h-4" />
                           </button>
                           
                           {/* Simulated Toggle */}
                           <div className="relative inline-block w-10 align-middle select-none transition duration-200 ease-in">
                              <div className="absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer right-0 border-green-400"></div>
                              <div className="block overflow-hidden h-5 rounded-full bg-green-400 cursor-pointer"></div>
                           </div>
                        </div>
                     </div>
                  ))}
               </div>
            </div>
         </div>
      )}

      {/* --- ADD PROVIDER MODAL --- */}
      {showAddProviderModal && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 animate-fadeIn">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
               <div className="flex justify-between items-center mb-6">
                  <h3 className="font-bold text-lg text-slate-900">Add Third Party Provider</h3>
                  <button onClick={() => setShowAddProviderModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
               </div>
               <form onSubmit={handleAddProvider} className="space-y-4">
                  <div>
                     <label className="block text-xs font-medium text-slate-700 mb-1">Provider Name</label>
                     <input required type="text" placeholder="e.g. Deepgram" className="w-full border border-slate-300 rounded-lg p-2.5 text-sm" 
                        value={newProvider.name} onChange={e => setNewProvider({...newProvider, name: e.target.value})} />
                  </div>
                  <div>
                     <label className="block text-xs font-medium text-slate-700 mb-1">API Type</label>
                     <select className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                        value={newProvider.type} onChange={e => setNewProvider({...newProvider, type: e.target.value})}>
                        <option>LLM (Model)</option>
                        <option>STT (Transcriber)</option>
                        <option>TTS (Voice)</option>
                        <option>VOIP (Telephony)</option>
                        <option>Payment Gateway</option>
                     </select>
                  </div>
                  <div>
                     <label className="block text-xs font-medium text-slate-700 mb-1">API Key / Secret</label>
                     <input required type="text" placeholder="sk-..." className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-mono" 
                        value={newProvider.key} onChange={e => setNewProvider({...newProvider, key: e.target.value})} />
                  </div>
                  <div className="pt-4">
                     <button type="submit" className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700">Add Provider</button>
                  </div>
               </form>
            </div>
         </div>
      )}

      {/* --- ADD VOICE MODAL --- */}
      {showAddVoiceModal && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 animate-fadeIn">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
               <div className="flex justify-between items-center mb-6">
                  <h3 className="font-bold text-lg text-slate-900">Add New Voice</h3>
                  <button onClick={() => setShowAddVoiceModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
               </div>
               <form onSubmit={handleAddVoice} className="space-y-4">
                  <div>
                     <label className="block text-xs font-medium text-slate-700 mb-1">Voice Name</label>
                     <input required type="text" placeholder="e.g. Marcus" className="w-full border border-slate-300 rounded-lg p-2.5 text-sm" 
                        value={newVoice.name} onChange={e => setNewVoice({...newVoice, name: e.target.value})} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Provider</label>
                        <select className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                           value={newVoice.provider} onChange={e => setNewVoice({...newVoice, provider: e.target.value})}>
                           <option>ElevenLabs</option>
                           <option>Vapi</option>
                           <option>PlayHT</option>
                           <option>Azure</option>
                        </select>
                     </div>
                     <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Gender</label>
                        <select className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                           value={newVoice.gender} onChange={e => setNewVoice({...newVoice, gender: e.target.value})}>
                           <option>Female</option>
                           <option>Male</option>
                        </select>
                     </div>
                  </div>
                  <div>
                     <label className="block text-xs font-medium text-slate-700 mb-1">Voice ID (API)</label>
                     <input required type="text" placeholder="e.g. 21m00Tcm4TlvDq8ikWAM" className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-mono" 
                        value={newVoice.voiceId} onChange={e => setNewVoice({...newVoice, voiceId: e.target.value})} />
                  </div>
                  <div className="pt-4">
                     <button type="submit" className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700">Register Voice</button>
                  </div>
               </form>
            </div>
         </div>
      )}

      {/* --- VOICE SETTINGS (FINE TUNE) MODAL --- */}
      {editingVoiceId && currentEditingVoice && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
               <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                  <div className="flex items-center space-x-3">
                     <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600">
                        <Sliders className="w-5 h-5" />
                     </div>
                     <div>
                        <h3 className="font-bold text-lg text-slate-900">Voice Settings</h3>
                        <p className="text-xs text-slate-500">Fine-tune {currentEditingVoice.name}</p>
                     </div>
                  </div>
                  <button onClick={() => setEditingVoiceId(null)} className="text-slate-400 hover:text-slate-600"><X className="w-6 h-6"/></button>
               </div>
               
               <div className="space-y-6">
                  {/* Temperature */}
                  <div>
                     <div className="flex justify-between mb-2">
                        <label className="text-sm font-medium text-slate-700">Temperature (Variability)</label>
                        <span className="text-xs font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-600">{currentEditingVoice.settings?.temperature}</span>
                     </div>
                     <input 
                        type="range" min="0" max="1" step="0.05"
                        value={currentEditingVoice.settings?.temperature}
                        onChange={(e) => updateVoiceSetting('temperature', parseFloat(e.target.value))}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                     />
                     <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                        <span>Predictable</span>
                        <span>Creative</span>
                     </div>
                  </div>

                  {/* Stability */}
                  <div>
                     <div className="flex justify-between mb-2">
                        <label className="text-sm font-medium text-slate-700">Stability</label>
                        <span className="text-xs font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-600">{currentEditingVoice.settings?.stability}</span>
                     </div>
                     <input 
                        type="range" min="0" max="1" step="0.05"
                        value={currentEditingVoice.settings?.stability}
                        onChange={(e) => updateVoiceSetting('stability', parseFloat(e.target.value))}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                     />
                     <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                        <span>Expressive</span>
                        <span>Consistent</span>
                     </div>
                  </div>

                  {/* Loudness */}
                  <div>
                     <div className="flex justify-between mb-2">
                        <label className="text-sm font-medium text-slate-700 flex items-center">
                           <Volume2 className="w-3 h-3 mr-1"/> Loudness / Speaker Boost
                        </label>
                        <span className="text-xs font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-600">{currentEditingVoice.settings?.loudness}</span>
                     </div>
                     <input 
                        type="range" min="0" max="1" step="0.1"
                        value={currentEditingVoice.settings?.loudness}
                        onChange={(e) => updateVoiceSetting('loudness', parseFloat(e.target.value))}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                     />
                  </div>

                  {/* Emotions */}
                  <div>
                     <div className="flex justify-between mb-2">
                        <label className="text-sm font-medium text-slate-700">Emotions / Similarity</label>
                        <span className="text-xs font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-600">{currentEditingVoice.settings?.emotions}</span>
                     </div>
                     <input 
                        type="range" min="0" max="1" step="0.05"
                        value={currentEditingVoice.settings?.emotions}
                        onChange={(e) => updateVoiceSetting('emotions', parseFloat(e.target.value))}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                     />
                     <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                        <span>Low</span>
                        <span>High</span>
                     </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex justify-end">
                     <button 
                        onClick={() => setEditingVoiceId(null)}
                        className="bg-slate-900 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors flex items-center"
                     >
                        <Save className="w-4 h-4 mr-2" /> Save Settings
                     </button>
                  </div>
               </div>
            </div>
         </div>
      )}

    </div>
  );
};

export default SuperAdmin;
