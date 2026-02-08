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

/* =========================
   PHONE / COUNTRY CODE UTILS
========================= */
const parsePhoneWithCountryCode = (phone?: string) => {
  if (!phone) return { countryCode: '', nationalNumber: '' };

  if (phone.startsWith('+')) {
    const match = phone.match(/^(\+\d{1,3})(.*)$/);
    if (match) {
      return {
        countryCode: match[1],
        nationalNumber: match[2]
      };
    }
  }

  return { countryCode: '', nationalNumber: phone };
};

/* =========================
   TYPES
========================= */
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
  const [view, setView] = useState<'users' | 'contacts' | 'calls'>('users');

  const [users, setUsers] = useState<UserData[]>([]);
  const [selectedUser, setSelectedUser] = useState<{ _id: string; email: string } | null>(null);
  const [contacts, setContacts] = useState<ContactData[]>([]);
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [calls, setCalls] = useState<CallData[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [playingCallId, setPlayingCallId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
    await suspendUser(userId);
    await loadUsers();
  };

  const handleActivateUser = async (userId: string) => {
    await activateUser(userId);
    await loadUsers();
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

  const getSentimentIcon = (sentiment?: string) => {
    switch (sentiment) {
      case 'Positive': return <Smile className="w-4 h-4 text-green-500" />;
      case 'Negative': return <Frown className="w-4 h-4 text-red-500" />;
      default: return <Meh className="w-4 h-4 text-yellow-500" />;
    }
  };

  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      <audio ref={audioRef} onEnded={() => setPlayingCallId(null)} className="hidden" />

      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          {view !== 'users' && (
            <button onClick={goBack} className="p-2 rounded-lg hover:bg-slate-100">
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
          )}
          <h1 className="text-2xl font-bold text-slate-900">
            {view === 'users' && 'Lead Management'}
            {view === 'contacts' && `${selectedUser?.email}'s Contacts`}
            {view === 'calls' && `Calls with ${selectedContact?.name || 'Contact'}`}
          </h1>
        </div>

        {view === 'users' && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search users..."
              className="pl-10 pr-4 py-2 border rounded-lg text-sm"
            />
          </div>
        )}
      </div>

      {/* CONTACTS VIEW */}
      {view === 'contacts' && (
        <table className="min-w-full divide-y divide-slate-200 bg-white">
          <tbody>
            {contacts.map(contact => {
              const { countryCode, nationalNumber } = parsePhoneWithCountryCode(contact.phone);
              return (
                <tr key={contact._id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium">
                      {contact.firstName} {contact.lastName}
                    </p>
                    <div className="flex items-center text-xs text-slate-500 mt-1">
                      {contact.phone && (
                        <span className="flex items-center">
                          <Phone className="w-3 h-3 mr-1" />
                          {countryCode && <span className="mr-1 text-slate-400">{countryCode}</span>}
                          {nationalNumber}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => loadContactCalls(contact)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* CALLS VIEW */}
      {view === 'calls' && selectedContact && (
        <div className="bg-white rounded-xl p-6">
          {(() => {
            const { countryCode, nationalNumber } = parsePhoneWithCountryCode(selectedContact.phone);
            return (
              <div className="flex items-center text-sm text-slate-600">
                <Phone className="w-4 h-4 mr-1" />
                {countryCode && <span className="mr-1 text-slate-400">{countryCode}</span>}
                {nationalNumber}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default LeadManagement;
