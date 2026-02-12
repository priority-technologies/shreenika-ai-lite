import React, { useState, useEffect } from 'react';
import { ArrowLeft, Download, FileText, ChevronDown, Phone } from 'lucide-react';
import { apiFetch } from '../../services/api';
import UserLeadsSection from './UserLeadsSection';

interface Agent {
  _id: string;
  name: string;
}

interface VoipNumber {
  number: string;
  assignedAgentId?: string;
  agentName?: string;
}

interface UserDetail {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  accountType: string;
  agents?: Agent[];
  voipProvider?: string;
  voipNumbers?: VoipNumber[];
  createdAt?: string;
}

interface UserDetailsViewProps {
  navigate: (path: string) => void;
  userId: string;
}

const UserDetailsView: React.FC<UserDetailsViewProps> = ({ navigate, userId }) => {
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [accountType, setAccountType] = useState('Starter');
  const [showAgentsDropdown, setShowAgentsDropdown] = useState(false);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchUserDetails();
  }, [userId]);

  const fetchUserDetails = async () => {
    try {
      setLoading(true);
      const data = await apiFetch(`/admin/users/${userId}`);
      if (data.user) {
        setUser(data.user);
        setAccountType(data.user.accountType || 'Starter');
      }
    } catch (err) {
      console.error('Failed to fetch user details:', err);
      setMessage('Failed to load user details');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleAccountTypeChange = async (newType: string) => {
    if (!user) return;

    try {
      setSaving(true);
      await apiFetch(`/admin/users/${userId}/account-type`, {
        method: 'PUT',
        body: JSON.stringify({ accountType: newType }),
      }, 'core');

      setAccountType(newType);
      setMessage(`✅ Account upgraded to ${newType}`);
      setTimeout(() => setMessage(''), 3000);
      fetchUserDetails();
    } catch (err) {
      console.error('Failed to change account type:', err);
      setMessage('Failed to update account type');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async () => {
    try {
      setSaving(true);
      await apiFetch(`/admin/users/${userId}/export`, { method: 'GET' }, 'core');
      setMessage('✅ Data export started');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error('Failed to export data:', err);
      setMessage('Failed to export data');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-slate-600">Loading user details...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/admin/users')}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h1 className="text-3xl font-bold text-slate-900">User Not Found</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <button
          onClick={() => navigate('/admin/users')}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{user.name}</h1>
          <p className="text-slate-600 mt-1">User ID: {user._id.slice(0, 12)}...</p>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className="p-4 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
          {message}
        </div>
      )}

      {/* User Info Header */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white rounded-lg border border-slate-200 p-6">
        <div>
          <p className="text-sm text-slate-600">Email</p>
          <p className="text-lg font-semibold text-slate-900">{user.email}</p>
        </div>
        <div>
          <p className="text-sm text-slate-600">Phone</p>
          <p className="text-lg font-semibold text-slate-900">{user.phone || 'N/A'}</p>
        </div>
        <div>
          <p className="text-sm text-slate-600">Member Since</p>
          <p className="text-lg font-semibold text-slate-900">
            {user.createdAt
              ? new Date(user.createdAt).toLocaleDateString()
              : 'N/A'}
          </p>
        </div>
      </div>

      {/* Account Overview */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-6">
        <h2 className="text-xl font-bold text-slate-900">Account Overview</h2>

        {/* Account Type Section */}
        <div className="p-4 border border-slate-200 rounded-lg space-y-3">
          <label className="block text-sm font-semibold text-slate-700">Account Type</label>
          <div className="flex items-center space-x-3">
            <select
              value={accountType}
              onChange={(e) => handleAccountTypeChange(e.target.value)}
              disabled={saving}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value="Starter">Starter</option>
              <option value="Pro">Pro</option>
              <option value="Enterprise">Enterprise</option>
            </select>
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                accountType === 'Starter'
                  ? 'bg-blue-100 text-blue-800'
                  : accountType === 'Pro'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-purple-100 text-purple-800'
              }`}
            >
              {accountType}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Changes take effect immediately
          </p>
        </div>

        {/* Agents Section */}
        <div className="p-4 border border-slate-200 rounded-lg space-y-3">
          <button
            onClick={() => setShowAgentsDropdown(!showAgentsDropdown)}
            className="w-full flex items-center justify-between px-4 py-2 hover:bg-slate-50 rounded-lg transition-colors"
          >
            <span className="font-semibold text-slate-700">
              {user.agents?.length || 0} Agents Created
            </span>
            <ChevronDown
              className={`w-5 h-5 transition-transform ${
                showAgentsDropdown ? 'rotate-180' : ''
              }`}
            />
          </button>

          {showAgentsDropdown && user.agents && user.agents.length > 0 && (
            <div className="mt-2 space-y-2 pl-4 border-l-2 border-slate-300">
              {user.agents.map((agent) => (
                <div key={agent._id} className="py-1 text-sm text-slate-600">
                  • {agent.name}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* VOIP Provider Section */}
        {user.voipProvider && (
          <div className="p-4 border border-slate-200 rounded-lg space-y-3">
            <label className="block text-sm font-semibold text-slate-700">
              VOIP Service Provider
            </label>
            <div className="inline-block px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium">
              {user.voipProvider}
            </div>
          </div>
        )}

        {/* VOIP Numbers Section */}
        {user.voipNumbers && user.voipNumbers.length > 0 && (
          <div className="p-4 border border-slate-200 rounded-lg space-y-3">
            <h3 className="font-semibold text-slate-700 flex items-center space-x-2">
              <Phone className="w-5 h-5" />
              <span>VOIP Numbers</span>
            </h3>
            <div className="space-y-2 pl-4 border-l-2 border-slate-300">
              {user.voipNumbers.map((num, idx) => (
                <div key={idx} className="py-1 text-sm text-slate-600">
                  <span className="font-mono font-semibold">{num.number}</span>
                  {num.agentName && (
                    <span className="text-slate-500 ml-2">
                      → Assigned to: {num.agentName}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center space-x-3 pt-4 border-t border-slate-200">
          <button
            onClick={handleDownload}
            disabled={saving}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Download className="w-5 h-5" />
            <span>Download User Data</span>
          </button>

          <button
            onClick={() => {
              setMessage('📋 Invoice feature coming soon');
              setTimeout(() => setMessage(''), 3000);
            }}
            className="flex items-center space-x-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <FileText className="w-5 h-5" />
            <span>Invoices</span>
          </button>
        </div>
      </div>

      {/* Leads Section */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <UserLeadsSection userId={userId} navigate={navigate} />
      </div>
    </div>
  );
};

export default UserDetailsView;
