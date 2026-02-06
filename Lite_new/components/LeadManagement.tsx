
import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  ArrowLeft,
  Phone,
  Mail,
  Building,
  Calendar,
  PhoneCall,
  PlayCircle,
  PauseCircle,
  Clock,
  MessageSquare,
  Smile,
  Meh,
  Frown,
  Loader2,
  AlertCircle,
  UserCheck,
  UserX,
  ChevronRight,
  Search
} from 'lucide-react';
import {
  getAdminUsers,
  getAdminUserContacts,
  getAdminContactCalls,
  suspendUser,
  activateUser
} from '../services/api';

interface UserData {
  _id: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  stats: {
    contacts: number;
    calls: number;
    agents: number;
  };
  subscription: {
    plan: string;
    status: string;
  } | null;
}

interface ContactData {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: { name?: string };
  status: string;
  createdAt: string;
  callCount: number;
  lastCall?: {
    date: string;
    status: string;
    sentiment: string;
  };
}

interface CallData {
  _id: string;
  direction: string;
  status: string;
  durationSeconds: number;
  recordingUrl?: string;
  transcript?: string;
  summary?: string;
  sentiment?: string;
  agent?: {
    id: string;
    name: string;
    title: string;
  };
  createdAt: string;
}

const LeadManagement: React.FC = () => {
  // View state: 'users' | 'contacts' | 'calls'
  const [view, setView] = useState<'users' | 'contacts' | 'calls'>('users');

  // Data states
  const [users, setUsers] = useState<UserData[]>([]);
  const [selectedUser, setSelectedUser] = useState<{ _id: string; email: string } | null>(null);
  const [contacts, setContacts] = useState<ContactData[]>([]);
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [calls, setCalls] = useState<CallData[]>([]);

  // Loading & error states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search state
  const [searchTerm, setSearchTerm] = useState('');

  // Audio player state
  const [playingCallId, setPlayingCallId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load users on mount
  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getAdminUsers();
      setUsers(data.users || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  const loadUserContacts = async (user: { _id: string; email: string }) => {
    setIsLoading(true);
    setError(null);
    setSelectedUser(user);
    try {
      const data = await getAdminUserContacts(user._id);
      setContacts(data.contacts || []);
      setView('contacts');
    } catch (err: any) {
      setError(err.message || 'Failed to load contacts');
    } finally {
      setIsLoading(false);
    }
  };

  const loadContactCalls = async (contact: ContactData) => {
    if (!selectedUser) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getAdminContactCalls(selectedUser._id, contact._id);
      setSelectedContact(data.contact);
      setCalls(data.calls || []);
      setView('calls');
    } catch (err: any) {
      setError(err.message || 'Failed to load calls');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuspendUser = async (userId: string) => {
    if (!confirm('Are you sure you want to suspend this user?')) return;
    try {
      await suspendUser(userId);
      await loadUsers();
      alert('User suspended successfully');
    } catch (err: any) {
      alert(err.message || 'Failed to suspend user');
    }
  };

  const handleActivateUser = async (userId: string) => {
    try {
      await activateUser(userId);
      await loadUsers();
      alert('User activated successfully');
    } catch (err: any) {
      alert(err.message || 'Failed to activate user');
    }
  };

  const goBack = () => {
    if (view === 'calls') {
      setView('contacts');
      setCalls([]);
      setSelectedContact(null);
    } else if (view === 'contacts') {
      setView('users');
      setContacts([]);
      setSelectedUser(null);
    }
  };

  const toggleAudioPlayback = (callId: string, recordingUrl: string) => {
    if (playingCallId === callId) {
      audioRef.current?.pause();
      setPlayingCallId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.src = recordingUrl;
        audioRef.current.play();
        setPlayingCallId(callId);
      }
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getSentimentIcon = (sentiment?: string) => {
    switch (sentiment) {
      case 'Positive': return <Smile className="w-4 h-4 text-green-500" />;
      case 'Negative': return <Frown className="w-4 h-4 text-red-500" />;
      default: return <Meh className="w-4 h-4 text-yellow-500" />;
    }
  };

  // Filter users by search
  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Loading state
  if (isLoading && view === 'users' && users.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-3 text-slate-600">Loading lead data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Hidden audio element for playback */}
      <audio
        ref={audioRef}
        onEnded={() => setPlayingCallId(null)}
        className="hidden"
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          {view !== 'users' && (
            <button
              onClick={goBack}
              className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {view === 'users' && 'Lead Management'}
              {view === 'contacts' && `${selectedUser?.email}'s Contacts`}
              {view === 'calls' && `Calls with ${selectedContact?.name || 'Contact'}`}
            </h1>
            <p className="text-slate-500">
              {view === 'users' && 'View and manage all registered users and their data.'}
              {view === 'contacts' && `${contacts.length} contact(s) found`}
              {view === 'calls' && `${calls.length} call(s) found`}
            </p>
          </div>
        </div>

        {/* Search (only for users view) */}
        {view === 'users' && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-900">Error</p>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* USERS VIEW */}
      {view === 'users' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Plan</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Stats</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Joined</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredUsers.map(user => (
                <tr key={user._id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-blue-700 font-bold">
                          {user.email.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">{user.email}</p>
                        <p className="text-xs text-slate-500">{user.role}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded ${
                      user.subscription?.plan === 'Pro' ? 'bg-purple-100 text-purple-700' :
                      user.subscription?.plan === 'Enterprise' ? 'bg-indigo-100 text-indigo-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {user.subscription?.plan || 'Starter'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-4 text-xs text-slate-600">
                      <span title="Contacts">
                        <Users className="w-3 h-3 inline mr-1" />
                        {user.stats.contacts}
                      </span>
                      <span title="Calls">
                        <PhoneCall className="w-3 h-3 inline mr-1" />
                        {user.stats.calls}
                      </span>
                      <span title="Agents">
                        <span className="mr-1">🤖</span>
                        {user.stats.agents}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded ${
                      user.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {user.isActive ? 'Active' : 'Suspended'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => loadUserContacts({ _id: user._id, email: user.email })}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="View Contacts"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                      {user.isActive ? (
                        <button
                          onClick={() => handleSuspendUser(user._id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Suspend User"
                        >
                          <UserX className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleActivateUser(user._id)}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Activate User"
                        >
                          <UserCheck className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* CONTACTS VIEW */}
      {view === 'contacts' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : contacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Users className="w-12 h-12 text-slate-300 mb-3" />
              <p className="text-slate-500">No contacts found for this user</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Contact</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Company</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Calls</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Last Call</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {contacts.map(contact => (
                  <tr key={contact._id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {contact.firstName || ''} {contact.lastName || 'Unknown'}
                        </p>
                        <div className="flex items-center space-x-3 mt-1 text-xs text-slate-500">
                          {contact.email && (
                            <span className="flex items-center">
                              <Mail className="w-3 h-3 mr-1" />
                              {contact.email}
                            </span>
                          )}
                          {contact.phone && (
                            <span className="flex items-center">
                              <Phone className="w-3 h-3 mr-1" />
                              {contact.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {contact.company?.name ? (
                        <span className="flex items-center text-sm text-slate-600">
                          <Building className="w-3 h-3 mr-1" />
                          {contact.company.name}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-slate-900">{contact.callCount}</span>
                    </td>
                    <td className="px-6 py-4">
                      {contact.lastCall ? (
                        <div className="text-xs">
                          <p className="text-slate-600">
                            {new Date(contact.lastCall.date).toLocaleDateString()}
                          </p>
                          <div className="flex items-center mt-1">
                            {getSentimentIcon(contact.lastCall.sentiment)}
                            <span className="ml-1 text-slate-500">{contact.lastCall.sentiment}</span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">No calls yet</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded ${
                        contact.status === 'qualified' ? 'bg-green-100 text-green-700' :
                        contact.status === 'contacted' ? 'bg-blue-100 text-blue-700' :
                        contact.status === 'closed' ? 'bg-purple-100 text-purple-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {contact.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => loadContactCalls(contact)}
                        disabled={contact.callCount === 0}
                        className={`p-2 rounded-lg transition-colors ${
                          contact.callCount > 0
                            ? 'text-blue-600 hover:bg-blue-50'
                            : 'text-slate-300 cursor-not-allowed'
                        }`}
                        title="View Calls"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* CALLS VIEW */}
      {view === 'calls' && (
        <div className="space-y-4">
          {/* Contact Info Card */}
          {selectedContact && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{selectedContact.name}</h3>
                  <div className="flex items-center space-x-4 mt-2 text-sm text-slate-600">
                    {selectedContact.phone && (
                      <span className="flex items-center">
                        <Phone className="w-4 h-4 mr-1" />
                        {selectedContact.phone}
                      </span>
                    )}
                    {selectedContact.email && (
                      <span className="flex items-center">
                        <Mail className="w-4 h-4 mr-1" />
                        {selectedContact.email}
                      </span>
                    )}
                    {selectedContact.company && (
                      <span className="flex items-center">
                        <Building className="w-4 h-4 mr-1" />
                        {selectedContact.company}
                      </span>
                    )}
                  </div>
                </div>
                <span className={`px-3 py-1 text-sm font-medium rounded ${
                  selectedContact.status === 'qualified' ? 'bg-green-100 text-green-700' :
                  selectedContact.status === 'contacted' ? 'bg-blue-100 text-blue-700' :
                  'bg-slate-100 text-slate-700'
                }`}>
                  {selectedContact.status}
                </span>
              </div>
            </div>
          )}

          {/* Calls List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : calls.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
              <PhoneCall className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No calls found for this contact</p>
            </div>
          ) : (
            <div className="space-y-4">
              {calls.map(call => (
                <div
                  key={call._id}
                  className="bg-white rounded-xl shadow-sm border border-slate-200 p-6"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-4">
                      {/* Call Direction Icon */}
                      <div className={`p-3 rounded-lg ${
                        call.direction === 'INBOUND' ? 'bg-green-50' : 'bg-blue-50'
                      }`}>
                        <PhoneCall className={`w-5 h-5 ${
                          call.direction === 'INBOUND' ? 'text-green-600' : 'text-blue-600'
                        }`} />
                      </div>

                      <div>
                        <div className="flex items-center space-x-3">
                          <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                            call.direction === 'INBOUND' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {call.direction}
                          </span>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                            call.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                            call.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {call.status}
                          </span>
                          {call.sentiment && (
                            <span className="flex items-center">
                              {getSentimentIcon(call.sentiment)}
                              <span className="ml-1 text-xs text-slate-600">{call.sentiment}</span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center space-x-4 mt-2 text-sm text-slate-600">
                          <span className="flex items-center">
                            <Calendar className="w-3 h-3 mr-1" />
                            {formatDate(call.createdAt)}
                          </span>
                          <span className="flex items-center">
                            <Clock className="w-3 h-3 mr-1" />
                            {formatDuration(call.durationSeconds)}
                          </span>
                          {call.agent && (
                            <span className="flex items-center">
                              <span className="mr-1">🤖</span>
                              {call.agent.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Audio Player Button */}
                    {call.recordingUrl && (
                      <button
                        onClick={() => toggleAudioPlayback(call._id, call.recordingUrl!)}
                        className={`p-3 rounded-lg transition-colors ${
                          playingCallId === call._id
                            ? 'bg-red-100 text-red-600'
                            : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                        }`}
                        title={playingCallId === call._id ? 'Pause' : 'Play Recording'}
                      >
                        {playingCallId === call._id ? (
                          <PauseCircle className="w-6 h-6" />
                        ) : (
                          <PlayCircle className="w-6 h-6" />
                        )}
                      </button>
                    )}
                  </div>

                  {/* Summary */}
                  {call.summary && (
                    <div className="mt-4 p-4 bg-slate-50 rounded-lg">
                      <h4 className="text-xs font-semibold text-slate-700 uppercase mb-2 flex items-center">
                        <MessageSquare className="w-3 h-3 mr-1" />
                        Call Summary
                      </h4>
                      <p className="text-sm text-slate-600">{call.summary}</p>
                    </div>
                  )}

                  {/* Transcript (Collapsible) */}
                  {call.transcript && (
                    <details className="mt-4">
                      <summary className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-700">
                        View Full Transcript
                      </summary>
                      <div className="mt-2 p-4 bg-slate-50 rounded-lg">
                        <pre className="text-xs text-slate-600 whitespace-pre-wrap font-sans">
                          {call.transcript}
                        </pre>
                      </div>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LeadManagement;
