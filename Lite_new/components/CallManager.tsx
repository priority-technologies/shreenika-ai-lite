import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { Lead, CallLog, AgentConfig, CallStatus } from '../types';
import {
  Phone,
  Play,
  Pause,
  Search,
  Loader2,
  User,
  CheckCircle2,
  XCircle,
  MoreVertical,
  Info,
  FileText,
  Star,
  PhoneMissed,
  Plus,
  CheckSquare,
  Square,
  Download,
  RefreshCw,
  Trash2,
  Archive
} from 'lucide-react';
import { apiFetch, getAgents } from '../services/api';
import { startCall, getCalls, createCampaign, getCampaigns, pauseCampaign, stopCampaign, startCampaign, getCampaignStatus, getCallRecording } from '../services/api';
import { ChevronDown } from 'lucide-react';
interface CallManagerProps {
  leads: Lead[];
  logs: CallLog[];
  setLogs: (logs: CallLog[]) => void;
  agent: AgentConfig;
}

const CallManager: React.FC<CallManagerProps> = ({ leads, logs, setLogs, agent }) => {
  const [selectedLogId, setSelectedLogId] = useState<string | null>(logs.length > 0 ? logs[0].id : null);
  const [activeTab, setActiveTab] = useState('Overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sentimentFilter, setSentimentFilter] = useState('All');
  const [sortOrder, setSortOrder] = useState<'latest' | 'oldest'>('latest');
  
  // Campaign & Lead Selection State
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [isCampaignActive, setIsCampaignActive] = useState(() => {
    // 🔴 TASK 17 FIX: Restore campaign state from localStorage
    const saved = localStorage.getItem('isCampaignActive');
    return saved ? JSON.parse(saved) : false;
  });
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(() => {
    // 🔴 TASK 17 FIX: Restore campaign ID from localStorage
    return localStorage.getItem('activeCampaignId');
  });
  const [campaignProgress, setCampaignProgress] = useState(() => {
    // 🔴 TASK 17 FIX: Restore campaign progress from localStorage
    const saved = localStorage.getItem('campaignProgress');
    return saved ? JSON.parse(saved) : { current: 0, total: 0 };
  });

  // Context Menu State
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  // Audio Player State
  const [isPlaying, setIsPlaying] = useState(false);

  // ── MISSING FIX #4: Recording data from backend ──
  const [recordingPath, setRecordingPath] = useState<string | null>(null);
  const [geminiRecordingPath, setGeminiRecordingPath] = useState<string | null>(null);
  const [loadingRecording, setLoadingRecording] = useState(false);

  // Loading States
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [redialingId, setRedialingId] = useState<string | null>(null);

  // Call execution state
   const [loadingCallId, setLoadingCallId] = useState<string | null>(null);

  // Agent selection for campaigns
  const [agentsList, setAgentsList] = useState<any[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');

  // 🔴 PHASE 5: Campaign configuration
  const [campaignName, setCampaignName] = useState<string>('');
  const [campaignConfig, setCampaignConfig] = useState<string>(''); // Configuration sheet (optional overrides)

  const selectedLog = logs.find(l => l.id === selectedLogId) || null;

  const filteredLogs = logs.filter(log => {
    // 1. SEARCH FILTER - match name or phone
    const matchesSearch = !searchTerm ||
      log.leadName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.phoneNumber?.includes(searchTerm);

    // 2. STATUS FILTER
    const matchesStatus = statusFilter === 'All' || log.status === statusFilter;

    // 3. SENTIMENT FILTER (from AI-detected sentiment field)
    const matchesSentiment = sentimentFilter === 'All' || log.sentiment === sentimentFilter;

    return matchesSearch && matchesStatus && matchesSentiment;
  }).sort((a, b) => {
    // SORT - applied after filtering
    if (sortOrder === 'latest') {
      return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
    } else {
      return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime();
    }
  });

  // Socket.IO connection for real-time call updates
  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || "https://shreenika-ai-backend-507468019722.us-central1.run.app";

    console.log(`📡 Connecting to Socket.IO at ${apiBase}`);

    // Initialize Socket.IO connection
    const socket: Socket = io(apiBase, {
      transports: ['polling'],  // Cloud Run requires polling — WebSocket upgrades fail on Cloud Run HTTP/2
      upgrade: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10
    });

    // Connection events
    socket.on('connect', () => {
      console.log('✅ Socket.IO connected:', socket.id);
    });

    socket.on('disconnect', () => {
      console.log('❌ Socket.IO disconnected');
    });

    socket.on('connect_error', (error) => {
      console.error('❌ Socket.IO connection error:', error);
    });

    // Real-time call updates
    socket.on('INCOMING_CALL', (data) => {
      console.log('📞 Incoming call:', data);
      setIncomingCall({
        phoneNumber: data.phoneNumber,
        callId: data.callId
      });
    });

    socket.on('CALL_STATUS_UPDATE', (data) => {
      console.log('📞 Call status update:', data);
      // Could update call status in real-time here
    });

    socket.on('CAMPAIGN_PROGRESS', (data) => {
      console.log('📢 Campaign progress:', data);
      // Only update if campaign is still active
      if (activeCampaignId && data.campaignId === activeCampaignId) {
        setCampaignProgress(data.progress);

        // Auto-hide band when all calls completed
        if (data.progress.current >= data.progress.total && data.progress.total > 0) {
          console.log('✅ Campaign completed! Auto-hiding band...');
          setIsCampaignActive(false);
          setActiveCampaignId(null);
        }
      }
    });

    // Cleanup on unmount
    return () => {
      console.log('🧹 Disconnecting Socket.IO');
      socket.disconnect();
    };
  }, []);

  // 🔴 TASK 17 FIX: Persist campaign state to localStorage
  // This ensures campaign state survives navigation and page refresh
  useEffect(() => {
    localStorage.setItem('isCampaignActive', JSON.stringify(isCampaignActive));
  }, [isCampaignActive]);

  useEffect(() => {
    if (activeCampaignId) {
      localStorage.setItem('activeCampaignId', activeCampaignId);
    } else {
      localStorage.removeItem('activeCampaignId');
    }
  }, [activeCampaignId]);

  useEffect(() => {
    localStorage.setItem('campaignProgress', JSON.stringify(campaignProgress));
  }, [campaignProgress]);

  // FIX (2026-03-31): Poll campaign status every 10 seconds as a Socket.IO fallback.
  // If the CAMPAIGN_PROGRESS WebSocket event is missed (network hiccup, reconnect),
  // the band would stay active forever. This API poll guarantees the band is removed
  // once the backend reports the campaign as completed/cancelled/failed.
  useEffect(() => {
    if (!isCampaignActive || !activeCampaignId) return;

    const pollInterval = setInterval(async () => {
      try {
        const data = await getCampaignStatus(activeCampaignId);
        const status = data?.status || data?.campaign?.status;
        if (status === 'completed' || status === 'cancelled' || status === 'failed') {
          console.log(`✅ [CAMPAIGN POLL] Campaign ${activeCampaignId} is ${status} — hiding band`);
          setIsCampaignActive(false);
          setActiveCampaignId(null);
          clearInterval(pollInterval);
        } else if (data?.progress) {
          setCampaignProgress(data.progress);
        }
      } catch (err) {
        console.warn('⚠️ Campaign status poll failed (non-fatal):', err);
      }
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(pollInterval);
  }, [isCampaignActive, activeCampaignId]);

  // ── MISSING FIX #4: Fetch recording paths when call is selected ──
  useEffect(() => {
    if (!selectedLogId) {
      setRecordingPath(null);
      setGeminiRecordingPath(null);
      return;
    }

    const fetchRecording = async () => {
      try {
        setLoadingRecording(true);
        const data = await getCallRecording(selectedLogId);
        if (data?.recording) {
          setRecordingPath(data.recording.callerRecordingPath || null);
          setGeminiRecordingPath(data.recording.geminiRecordingPath || null);
        }
      } catch (err) {
        console.warn('⚠️ Failed to fetch recording:', err);
        setRecordingPath(null);
        setGeminiRecordingPath(null);
      } finally {
        setLoadingRecording(false);
      }
    };

    fetchRecording();
  }, [selectedLogId]);

   const selectedLeads = leads.filter((lead) =>
   selectedLeadIds.has(lead.id)
   );
   const handleStartCall = async (lead: any, agentId: string) => {
  try {
    setLoadingCallId(lead.id);

    // Normalize phone to E.164 format
    let phone = (lead.phone || '').replace(/[\s\-\(\)]/g, '');
    if (phone && !phone.startsWith('+')) {
      phone = '+1' + phone; // Default to US country code
    }

    await startCall({
      agentId,
      leadId: lead.id,
      toPhone: phone,
    });

    // refresh call history (logs drive UI)
    await loadCallHistory();

  } catch (err: any) {
    console.error("Call failed", err);
    alert(`Call failed: ${err.message || 'Unknown error'}`);
  } finally {
    setLoadingCallId(null);
  }
};

   const [incomingCall, setIncomingCall] = useState<null | {
   phoneNumber: string;
   callId: string;
   }>(null);

  /* =========================
     LOAD AGENTS LIST
  ========================= */
  useEffect(() => {
    const loadAgents = async () => {
      try {
        const data = await getAgents();
        const list = Array.isArray(data) ? data : (data.agents || []);
        setAgentsList(list);
        // Auto-select first agent
        if (list.length > 0 && !selectedAgentId) {
          setSelectedAgentId(list[0]._id);
        }
      } catch (err) {
        console.error('Failed to load agents:', err);
      }
    };
    loadAgents();
  }, []);

  /* =========================
     LOAD CALL HISTORY WITH FILTERS
  ========================= */
  useEffect(() => {
    loadCallHistory();
  }, [statusFilter, sentimentFilter, sortOrder]);

  const loadCallHistory = async (page = 1) => {
    try {
      setLoadingLogs(true);
      // Build query parameters
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (statusFilter !== 'All') params.append('status', statusFilter);
      if (sentimentFilter !== 'All') params.append('sentiment', sentimentFilter);
      params.append('sort', sortOrder);
      params.append('page', page.toString());
      params.append('limit', '50');

      const endpoint = `/calls?${params.toString()}`;
      const response = await apiFetch(endpoint);
      // Handle both array and object responses (with pagination); normalize _id → id
      const raw = Array.isArray(response) ? response : (response.calls || []);
      const callsList = raw.map((c: any) => ({ ...c, id: c.id || c._id?.toString() }));
      setLogs(callsList);
    } catch (err) {
      console.error('Failed to load call history:', err);
      setLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  };


  /* =========================
     FORMAT HELPERS
  ========================= */
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'N/A';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'N/A';
    const day   = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year  = d.getFullYear();
    const hours = d.getHours();
    const mins  = String(d.getMinutes()).padStart(2, '0');
    const ampm  = hours >= 12 ? 'PM' : 'AM';
    const h12   = hours % 12 || 12;
    return `${day}/${month}/${year}, ${h12}:${mins} ${ampm}`;
  };

  /* =========================
     REDIAL (SINGLE CALL)
  ========================= */
  const handleRedial = async () => {
    if (!selectedLog) return;

    try {
      setRedialingId(selectedLog.id);
      
      await apiFetch(`/calls/${selectedLog.id}/redial`, {
        method: 'POST',
        body: JSON.stringify({
          agentId: agent.id,
          leadId: selectedLog.leadId
        })
      });

      alert(`Redialing ${selectedLog.phoneNumber}...`);
      
      // Refresh call history after a delay to show new call
      setTimeout(loadCallHistory, 2000);
      
    } catch (err: any) {
      console.error('Redial failed:', err);
      alert(err.message || 'Failed to redial');
    } finally {
      setRedialingId(null);
    }
  };

  /* =========================
     DOWNLOAD RECORDING
  ========================= */
  const handleDownloadRecording = () => {
    const url = recordingPath || selectedLog?.recordingUrl;
    if (!url) {
      alert("No recording available for this call.");
      return;
    }
    window.open(url, '_blank');
  };

  /* =========================
     ARCHIVE CALL LOG
  ========================= */
  const handleDeleteLog = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    
    if (!window.confirm("Delete this call log? (Data will be hidden but preserved)")) return;

    try {
      await apiFetch(`/calls/${id}/archive`, {
        method: 'POST'
      });

      const newLogs = logs.filter(l => l.id !== id);
      setLogs(newLogs);
      
      if (selectedLogId === id) {
        setSelectedLogId(newLogs.length > 0 ? newLogs[0].id : null);
      }
      
      setMenuOpenId(null);
    } catch (err: any) {
      alert(err.message || 'Failed to archive call');
    }
  };

  /* =========================
     CAMPAIGN LOGIC (INTENT ONLY)
  ========================= */
  const toggleLeadSelection = (id: string) => {
    console.log('🔧 toggleLeadSelection called with id:', id);
    console.log('Current selectedLeadIds:', Array.from(selectedLeadIds));
    console.log('Total leads:', leads.length);

    const newSelection = new Set(selectedLeadIds);
    if (newSelection.has(id)) {
      console.log('Removing lead:', id);
      newSelection.delete(id);
    } else {
      console.log('Adding lead:', id);
      newSelection.add(id);
    }
    console.log('New selection:', Array.from(newSelection));
    setSelectedLeadIds(newSelection);
  };

  const toggleSelectAll = () => {
    console.log('🔧 toggleSelectAll called');
    console.log('Current size:', selectedLeadIds.size, 'Total leads:', leads.length);

    if (selectedLeadIds.size === leads.length) {
      console.log('Deselecting all');
      setSelectedLeadIds(new Set());
    } else {
      console.log('Selecting all');
      const allIds = leads.map(l => l.id);
      console.log('All lead IDs:', allIds);
      setSelectedLeadIds(new Set(allIds));
    }
  };

  const handleStartCampaign = async () => {
    const leadsToCall = leads.filter(l => selectedLeadIds.has(l.id));

    if (leadsToCall.length === 0) {
      alert("Please select at least one lead");
      return;
    }

    if (!selectedAgentId) {
      alert("Please select an agent first");
      return;
    }

    // 🔴 PHASE 5: Validate campaign name
    if (!campaignName.trim()) {
      alert("Please enter a campaign name");
      return;
    }

    try {
      setIsCampaignActive(true);
      setCampaignProgress({ current: 0, total: leadsToCall.length });

      // 🔴 PHASE 5: Convert leads to proper format for Phase 5 backend
      const leadsData = leadsToCall.map(lead => ({
        leadId: lead.id || '',
        name: `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Unknown',
        email: lead.email || '',
        phone: (lead.phone || '').replace(/[\s\-\(\)]/g, ''),
        company: lead.company?.name || lead.companyName || '',
        metadata: {}
      }));

      // 🔴 PHASE 5: Create campaign with configuration sheet
      const campaignResponse = await createCampaign({
        agentId: selectedAgentId,
        campaignName: campaignName, // ✅ FIX: Match API field name
        configurationSheet: campaignConfig || undefined, // ✅ FIX: Match API field name
        leads: leadsData
      });

      // Store the campaign ID for stop/pause actions
      const newCampaignId = campaignResponse?.campaignId || campaignResponse?._id;
      if (newCampaignId) {
        setActiveCampaignId(newCampaignId);
        console.log(`📱 Campaign created with ID: ${newCampaignId}`);

        // 🔴 CRITICAL FIX: Start the campaign (change status from "draft" to "running")
        // This triggers the campaign-worker to poll Redis and initiate calls
        console.log(`⏳ Starting campaign...`);
        await startCampaign(newCampaignId);

        console.log(`✅ Campaign started!`);
        console.log(`📞 Parallel slots: 5 concurrent calls`);
        console.log(`📊 Total leads: ${leadsToCall.length}`);
      }

      // Reset form
      setIsLeadModalOpen(false);
      setSelectedLeadIds(new Set());
      setCampaignName('');
      setCampaignConfig('');

      alert(`Campaign started! Calling ${leadsToCall.length} leads with 5 parallel slots...`);

      // Reload campaigns list
      await loadCampaigns();

    } catch (err: any) {
      console.error('Campaign start failed:', err);
      alert(err.message || 'Failed to start campaign');
      setIsCampaignActive(false);
      setActiveCampaignId(null);
    }
  };

  /* =========================
     PAUSE CAMPAIGN (soft — resumable)
  ========================= */
  const handlePauseCampaign = async () => {
    if (!activeCampaignId) return;
    try {
      await pauseCampaign(activeCampaignId);
      setIsCampaignActive(false);
      setActiveCampaignId(null);
      setCampaignProgress({ current: 0, total: 0 });
      await loadCallHistory();
    } catch (err: any) {
      alert(err.message || 'Failed to pause campaign');
    }
  };

  /* =========================
     STOP CAMPAIGN (hard — permanent cancel)
  ========================= */
  const handleStopCampaign = async () => {
    if (!activeCampaignId) return;
    if (!window.confirm('Permanently stop this campaign? This cannot be undone.')) return;
    try {
      await stopCampaign(activeCampaignId);
      setIsCampaignActive(false);
      setActiveCampaignId(null);
      setCampaignProgress({ current: 0, total: 0 });
      await loadCallHistory();
    } catch (err: any) {
      alert(err.message || 'Failed to stop campaign');
    }
  };

  /* =========================
     CLOSE BAND (hide UI only — campaign keeps running)
  ========================= */
  const handleCloseBand = () => {
    setIsCampaignActive(false);
  };

  /* =========================
     LOAD CAMPAIGNS
  ========================= */
  const loadCampaigns = async () => {
    try {
      const data = await getCampaigns();
      // Store campaigns data if needed for history display
      console.log('Campaigns loaded:', data);
    } catch (err) {
      console.error('Failed to load campaigns:', err);
    }
  };

  return (
    <div className="flex h-[calc(100vh-6rem)] bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative">
      {incomingCall && (
  <div className="fixed top-6 right-6 z-50 bg-slate-900 text-white px-6 py-4 rounded-xl shadow-xl flex items-center gap-4">
    <div>
      <p className="text-sm opacity-80">Incoming Call</p>
      <p className="font-bold">{incomingCall.phoneNumber}</p>
    </div>

    <button
      onClick={() => {
        // Accept = backend already assigns agent
        setIncomingCall(null);
      }}
      className="bg-green-600 px-4 py-2 rounded-lg text-sm font-bold"
    >
      Accept
    </button>

    <button
      onClick={() => setIncomingCall(null)}
      className="bg-red-600 px-4 py-2 rounded-lg text-sm font-bold"
    >
      Reject
    </button>
  </div>
)}

      
      {/* --- CAMPAIGN PROGRESS OVERLAY --- */}
      {/* 🔴 PHASE 5: Enhanced campaign progress with metrics */}
      {isCampaignActive && (
        <div className="fixed top-0 left-0 right-0 bg-indigo-600 text-white z-50 px-6 py-4 shadow-lg flex items-center justify-between animate-fadeIn">
           <div className="flex items-center space-x-4 flex-1">
              <div className="relative">
                 <div className="w-3 h-3 bg-red-500 rounded-full animate-ping absolute top-0 right-0"></div>
                 <Phone className="w-6 h-6" />
              </div>
              <div>
                 <h3 className="font-bold text-base">🔄 Campaign in Progress - 5 Parallel Slots</h3>
                 <p className="text-xs text-indigo-100">
                    📞 Calling leads... {campaignProgress.current} of {campaignProgress.total} |
                    🎤 Sentiment auto-detected | 📊 Real-time metrics tracking
                 </p>
              </div>
           </div>
           <div className="flex items-center space-x-3">
              <div className="text-right mr-2">
                 <div className="text-xs font-medium opacity-90">Progress</div>
                 <div className="font-bold text-lg">
                   {campaignProgress.current}/{campaignProgress.total}
                 </div>
                 <div className="text-xs opacity-75">
                   {campaignProgress.total > 0 ? Math.round((campaignProgress.current / campaignProgress.total) * 100) : 0}%
                 </div>
              </div>
              {/* Pause — soft pause, can be resumed */}
              <button
                onClick={handlePauseCampaign}
                className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-2 rounded-lg transition-colors font-medium text-sm flex items-center space-x-1.5 shadow-md"
                title="Pause Campaign — active calls finish, no new calls"
              >
                 <Pause className="w-4 h-4" />
                 <span>Pause</span>
              </button>
              {/* Stop — permanent hard cancel */}
              <button
                onClick={handleStopCampaign}
                className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg transition-colors font-medium text-sm flex items-center space-x-1.5 shadow-md"
                title="Stop Campaign — permanently cancel all remaining calls"
              >
                 <XCircle className="w-4 h-4" />
                 <span>Stop</span>
              </button>
              {/* Close — hide band, campaign continues in background */}
              <button
                onClick={handleCloseBand}
                className="bg-indigo-800 hover:bg-indigo-900 text-white px-3 py-2 rounded-lg transition-colors font-medium text-sm flex items-center space-x-1.5 shadow-md"
                title="Close — hide this bar (campaign continues running)"
              >
                 <span>✕ Close</span>
              </button>
           </div>
        </div>
      )}

      {/* --- LEFT SIDEBAR: CONVERSATIONS LIST --- */}
      <div className="w-80 border-r border-slate-200 flex flex-col bg-white">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 space-y-3">
          <div className="flex justify-between items-center">
             <div className="flex items-center space-x-2">
                <h2 className="font-bold text-slate-800">Conversations</h2>
                <span className="bg-slate-200 text-slate-600 text-xs px-2 py-0.5 rounded-full">
                  {logs.length}
                </span>
             </div>
               <p className="text-xs text-slate-500 mt-1">
                  Total calls: {logs.length}
               </p>
             <button 
               onClick={loadCallHistory} 
               disabled={loadingLogs}
               className="text-xs text-blue-600 hover:underline disabled:opacity-50" 
               title="Refresh Call History"
             >
                {loadingLogs ? 'Loading...' : 'Refresh'}
             </button>
          </div>
          
          <button 
             onClick={() => setIsLeadModalOpen(true)}
             disabled={isCampaignActive || leads.length === 0}
             className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white py-2 px-4 rounded-lg flex items-center justify-center space-x-2 transition-colors shadow-sm text-sm font-medium"
          >
             {isCampaignActive ? (
               <>
                 <Loader2 className="w-4 h-4 animate-spin" />
                 <span>Dialing...</span>
               </>
             ) : (
               <>
                 <Plus className="w-4 h-4" />
                 <span>New Campaign</span>
               </>
             )}
          </button>
        </div>

        {/* Search & Filters */}
        <div className="p-3 border-b border-slate-100 space-y-3">
           {/* Search Box */}
           <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search by name or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
           </div>

           {/* Status Filter */}
           <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="All">All</option>
                <option value="COMPLETED">Completed</option>
                <option value="FAILED">Failed</option>
                <option value="NO_ANSWER">No Answer</option>
                <option value="INITIATED">Initiated</option>
              </select>
           </div>

           {/* Sentiment & Sort */}
           <div className="grid grid-cols-2 gap-2">
              {/* Sentiment Filter */}
              <div className="space-y-1">
                 <label className="text-xs font-semibold text-slate-600">Sentiment</label>
                 <select
                   value={sentimentFilter}
                   onChange={(e) => setSentimentFilter(e.target.value)}
                   className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                 >
                   <option value="All">All</option>
                   <option value="Positive">Positive</option>
                   <option value="Negative">Negative</option>
                   <option value="Neutral">Neutral</option>
                 </select>
              </div>

              {/* Sort Order */}
              <div className="space-y-1">
                 <label className="text-xs font-semibold text-slate-600">Sort</label>
                 <select
                   value={sortOrder}
                   onChange={(e) => setSortOrder(e.target.value as 'latest' | 'oldest')}
                   className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                 >
                   <option value="latest">Latest First</option>
                   <option value="oldest">Oldest First</option>
                 </select>
              </div>
           </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
           {loadingLogs ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                Loading call history...
              </div>
           ) : filteredLogs.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                No conversations found.
                {logs.length === 0 && <p className="mt-2">Start a campaign to see call history.</p>}
              </div>
           ) : (
              filteredLogs.map(log => (
                 <div 
                    key={log.id}
                    onClick={() => setSelectedLogId(log.id)}
                    className={`p-4 border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors relative group ${selectedLogId === log.id ? 'bg-indigo-50/60 border-l-4 border-l-indigo-500' : 'border-l-4 border-l-transparent'}`}
                 >
                    <div className="flex items-start justify-between mb-1">
                       <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                             <User className="w-5 h-5" />
                          </div>
                          <div>
                             <h3 className={`text-sm font-semibold ${selectedLogId === log.id ? 'text-indigo-900' : 'text-slate-900'}`}>
                                {log.phoneNumber}
                             </h3>
                             <div className="flex items-center text-xs text-slate-500 space-x-1">
                                {log.status === CallStatus.COMPLETED ? (
                                   <Phone className="w-3 h-3 text-green-500 fill-green-500" />
                                ) : (
                                   <PhoneMissed className="w-3 h-3 text-red-500" />
                                )}
                                <span>{formatDuration(log.durationSeconds || 0)}</span>
                                {log.summary && (
                                 <div className="text-xs text-slate-500 mt-1 line-clamp-2">
                                    {log.summary}
                                 </div>
                                )}
                             </div>
                          </div>
                       </div>
                       <span className="text-[10px] text-slate-400 font-medium">
                          {(() => {
                            const d = new Date((log as any).createdAt || (log as any).answeredAt || '');
                            if (isNaN(d.getTime())) return '—';
                            return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
                          })()}
                       </span>
                    </div>
                    
                    {/* Context Menu Trigger */}
                    <div className="absolute right-2 top-8 opacity-0 group-hover:opacity-100 transition-opacity">
                       <button 
                         onClick={(e) => { 
                           e.stopPropagation(); 
                           setMenuOpenId(menuOpenId === log.id ? null : log.id); 
                         }} 
                         className="p-1 hover:bg-slate-200 rounded"
                       >
                          <MoreVertical className="w-4 h-4 text-slate-400" />
                       </button>
                    </div>

                    {/* Dropdown Menu */}
                    {menuOpenId === log.id && (
                       <>
                         <div 
                           className="fixed inset-0 z-10" 
                           onClick={() => setMenuOpenId(null)}
                         />
                         <div className="absolute right-8 top-8 bg-white shadow-lg rounded-lg border border-slate-100 z-20 w-32 py-1">
                            <button 
                              onClick={(e) => handleDeleteLog(e, log.id)} 
                              className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center"
                            >
                               <Trash2 className="w-3 h-3 mr-2" /> Delete
                            </button>
                         </div>
                       </>
                    )}
                 </div>
              ))
           )}
        </div>
      </div>

      {/* --- RIGHT PANEL: DETAILS VIEW --- */}
      <div className="flex-1 flex flex-col bg-slate-50/30">
        {selectedLog ? (
           <>
              {/* Header */}
              <div className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6">
                 <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500">
                       <User className="w-4 h-4" />
                    </div>
                    <div>
                       <h2 className="text-base font-bold text-slate-900">{selectedLog.phoneNumber}</h2>
                       <p className="text-xs text-slate-500">{selectedLog.leadName}</p>
                    </div>
                 </div>
                 <div className="flex space-x-3">
                    <button 
                      onClick={handleRedial} 
                      disabled={redialingId === selectedLog.id}
                      className="text-slate-400 hover:text-green-600 disabled:opacity-50" 
                      title="Call Again"
                    >
                       {redialingId === selectedLog.id ? (
                         <Loader2 className="w-5 h-5 animate-spin" />
                       ) : (
                         <RefreshCw className="w-5 h-5" />
                       )}
                    </button>
                 </div>
              </div>

              {/* Main Content Scrollable */}
              <div className="flex-1 overflow-y-auto p-6">
                 <div className="max-w-4xl mx-auto space-y-6">
                    
                    {/* Audio Player Card */}
                    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                       <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center space-x-3">
                             <div className={`p-2 rounded-full ${selectedLog.status === CallStatus.COMPLETED ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                {selectedLog.status === CallStatus.COMPLETED ? (
                                  <CheckCircle2 className="w-5 h-5"/>
                                ) : (
                                  <XCircle className="w-5 h-5"/>
                                )}
                             </div>
                             <div>
                                <h3 className="text-sm font-bold text-slate-900">
                                   {selectedLog.status === CallStatus.COMPLETED ? 'Call completed' : 'No answer'}
                                </h3>
                                <div className="flex items-center text-xs text-slate-500 space-x-2">
                                   {agent.avatar && <img src={agent.avatar} className="w-4 h-4 rounded-full" alt={agent.name} />}
                                   <span>{agent.name}</span>
                                </div>
                             </div>
                          </div>
                          <div className="text-xs font-medium text-slate-400">
                             {formatDate(selectedLog.endedAt)}
                          </div>
                       </div>
                       
                       {/* ── MISSING FIX #4: Real HTML5 audio player with play/pause, progress bar, timer, download ── */}
                       {selectedLog.status === CallStatus.COMPLETED && (recordingPath || selectedLog.recordingUrl) && (
                         <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-lg p-4 mb-4 border border-indigo-100">
                           <div className="space-y-3">
                             {/* Audio Player - HTML5 with native controls */}
                             <audio
                               controls
                               className="w-full h-10 rounded"
                               src={recordingPath || selectedLog.recordingUrl}
                             >
                               Your browser does not support the audio element.
                             </audio>

                             {/* Recording Info with Download Button */}
                             <div className="flex items-center justify-between px-2 text-sm">
                               <span className="text-slate-700 font-medium">Call Recording</span>
                               <button
                                 onClick={handleDownloadRecording}
                                 disabled={!recordingPath && !selectedLog.recordingUrl}
                                 className="p-2 text-indigo-600 hover:text-indigo-700 hover:bg-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                 title="Download Recording"
                               >
                                 <Download className="w-4 h-4" />
                               </button>
                             </div>
                           </div>
                         </div>
                       )}

                       {selectedLog.status === CallStatus.COMPLETED && !recordingPath && !selectedLog.recordingUrl && (
                         <div className="text-sm text-slate-500 text-center py-4">
                           Recording not available
                         </div>
                       )}
                    </div>

                    {/* TABS */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                       <div className="border-b border-slate-200">
                          <nav className="flex -mb-px">
                             {['Overview', 'Summary', 'Transcript'].map((tab) => (
                                <button
                                   key={tab}
                                   onClick={() => setActiveTab(tab)}
                                   className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                                      activeTab === tab
                                         ? 'border-indigo-600 text-indigo-600'
                                         : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                                   }`}
                                >
                                   {tab}
                                </button>
                             ))}
                          </nav>
                       </div>

                       <div className="p-6">
                          {/* --- OVERVIEW TAB --- */}
                          {activeTab === 'Overview' && (
                             <div className="space-y-8 animate-fadeIn">
                                {/* Call Information */}
                                <div>
                                   <h4 className="text-sm font-bold text-slate-900 mb-4">Call Information</h4>
                                   <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8">
                                      <div className="flex justify-between items-center py-1 border-b border-slate-50">
                                         <span className="text-sm text-slate-500">Call to</span>
                                         <span className="text-sm font-medium text-slate-900">{selectedLog.phoneNumber}</span>
                                      </div>
                                      <div className="flex justify-between items-center py-1 border-b border-slate-50">
                                         <span className="text-sm text-slate-500">AI Agent</span>
                                         <div className="flex items-center space-x-2">
                                            {agent.avatar && <img src={agent.avatar} className="w-5 h-5 rounded-full" alt={agent.name} />}
                                            <span className="text-sm font-medium text-slate-900">{agent.name}</span>
                                         </div>
                                      </div>
                                      <div className="flex justify-between items-center py-1 border-b border-slate-50">
                                         <span className="text-sm text-slate-500">Duration</span>
                                         <span className="text-sm font-medium text-slate-900">
                                           {formatDuration(selectedLog.durationSeconds || 0)}
                                         </span>
                                      </div>
                                      <div className="flex justify-between items-center py-1 border-b border-slate-50">
                                         <span className="text-sm text-slate-500">Usage</span>
                                         <span className="text-sm font-medium text-slate-900">
                                           {selectedLog.usageCost || '00:00:00'}
                                         </span>
                                      </div>
                                      <div className="flex justify-between items-center py-1 border-b border-slate-50">
                                         <span className="text-sm text-slate-500">Started at</span>
                                         <span className="text-sm font-medium text-slate-900">
                                           {formatDate((selectedLog as any).createdAt || (selectedLog as any).answeredAt)}
                                         </span>
                                      </div>
                                      <div className="flex justify-between items-center py-1 border-b border-slate-50">
                                         <span className="text-sm text-slate-500">Ended at</span>
                                         <span className="text-sm font-medium text-slate-900">
                                           {formatDate(selectedLog.endedAt)}
                                         </span>
                                      </div>
                                   </div>
                                </div>

                                {/* Call Analysis */}
                                <div>
                                   <h4 className="text-sm font-bold text-slate-900 mb-4">Call Analysis</h4>
                                   <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8">
                                      <div className="flex justify-between items-center py-1 border-b border-slate-50">
                                         <span className="text-sm text-slate-500 flex items-center">
                                           Rating <Info className="w-3 h-3 ml-1 text-slate-300"/>
                                         </span>
                                         <div className="flex space-x-0.5">
                                            {[1,2,3,4,5].map(star => (
                                               <Star 
                                                  key={star} 
                                                  className={`w-4 h-4 ${star <= (selectedLog.rating || 0) ? 'text-slate-800 fill-slate-800' : 'text-slate-300'}`} 
                                               />
                                            ))}
                                         </div>
                                      </div>
                                      <div className="flex justify-between items-center py-1 border-b border-slate-50">
                                         <span className="text-sm text-slate-500">Call sentiment</span>
                                         <span className={`text-sm font-medium ${selectedLog.sentiment === 'Positive' ? 'text-green-600' : 'text-slate-900'}`}>
                                            {selectedLog.sentiment || 'Unknown'}
                                         </span>
                                      </div>
                                      <div className="flex justify-between items-center py-1 border-b border-slate-50">
                                         <span className="text-sm text-slate-500">Call status</span>
                                         <div className="flex items-center text-sm font-medium text-green-600">
                                            <div className="w-2 h-2 rounded-full bg-green-500 mr-2"></div>
                                            {selectedLog.dialStatus || 'Call completed'}
                                         </div>
                                      </div>
                                      <div className="flex justify-between items-center py-1 border-b border-slate-50">
                                         <span className="text-sm text-slate-500">End call reason</span>
                                         <div className="flex items-center text-sm font-medium text-green-600">
                                            <div className="w-2 h-2 rounded-full bg-green-500 mr-2"></div>
                                            {selectedLog.endReason || 'The contact ended the call.'}
                                         </div>
                                      </div>
                                   </div>
                                </div>
                             </div>
                          )}

                          {/* --- SUMMARY TAB --- */}
                          {activeTab === 'Summary' && (
                             <div className="animate-fadeIn">
                                <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                                   <h4 className="text-sm font-bold text-indigo-900 mb-2 flex items-center">
                                      <FileText className="w-4 h-4 mr-2" /> AI Summary
                                   </h4>
                                   <p className="text-sm text-indigo-800 leading-relaxed">
                                      {selectedLog.summary || "No summary available for this call."}
                                   </p>
                                </div>
                             </div>
                          )}

                          {/* --- TRANSCRIPT TAB --- */}
                          {activeTab === 'Transcript' && (
                             <div className="animate-fadeIn space-y-4">
                                {selectedLog.transcript ? (
                                   selectedLog.transcript.split('\n').filter(line => {
                                      return line.replace(/^(Agent:|Lead:)/i, '').trim().length > 0;
                                   }).map((line, idx) => {
                                      const isAgent = line.toLowerCase().startsWith('agent:');
                                      const cleanLine = line.replace(/^(Agent:|Lead:)/i, '').trim();

                                      return (
                                         <div key={idx} className={`flex ${isAgent ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[80%] p-3 rounded-lg text-sm ${isAgent ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-slate-100 text-slate-800 rounded-bl-none'}`}>
                                               <div className="text-xs opacity-70 mb-1">
                                                 {isAgent ? agent.name : selectedLog.leadName}
                                               </div>
                                               {cleanLine}
                                            </div>
                                         </div>
                                      );
                                   })
                                ) : (<div className="text-center text-slate-400 py-8">No transcript available.</div>
                            )}
                         </div>
                      )}
                   </div>
                </div>
             </div>
          </div>
       </>
    ) : (
       <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
          <Phone className="w-12 h-12 mb-4 opacity-20" />
          <p>Select a conversation to view details</p>
       </div>
    )}
  </div>

  {/* --- LEAD SELECTION MODAL --- */}
  {isLeadModalOpen && (
     <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh]">
           <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-xl">
              <div>
                 <h3 className="font-bold text-lg text-slate-900">New Campaign</h3>
                 <p className="text-sm text-slate-500">Select leads to start auto-dialing.</p>
              </div>
              <button 
                onClick={() => setIsLeadModalOpen(false)} 
                className="text-slate-400 hover:text-slate-600"
              >
                 <XCircle className="w-6 h-6" />
              </button>
           </div>
           
           <div className="flex-1 overflow-y-auto p-2">
              <table className="min-w-full divide-y divide-slate-100">
                 <thead className="bg-white sticky top-0 z-10">
                    <tr>
                       <th className="px-6 py-3 text-left">
                          <button 
                             onClick={toggleSelectAll} 
                             className="flex items-center text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-indigo-600"
                          >
                             {selectedLeadIds.size === leads.length ? (
                               <CheckSquare className="w-4 h-4 mr-2 text-indigo-600" />
                             ) : (
                               <Square className="w-4 h-4 mr-2" />
                             )}
                             Select All
                          </button>
                       </th>
                       <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                       <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Company</th>
                       <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Phone</th>
                    </tr>
                 </thead>
                 <tbody className="bg-white divide-y divide-slate-100">
                    {leads.length === 0 ? (
                       <tr>
                         <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                           No leads found in Contacts. Please add contacts first.
                         </td>
                       </tr>
                    ) : (
                       leads.map(lead => (
                          <tr
                            key={lead.id}
                            className={`hover:bg-slate-50 ${selectedLeadIds.has(lead.id) ? 'bg-indigo-50/50' : ''}`}
                          >
                             <td className="px-6 py-3">
                                <input
                                  type="checkbox"
                                  checked={selectedLeadIds.has(lead.id)}
                                  onChange={() => toggleLeadSelection(lead.id)}
                                  className="w-4 h-4 cursor-pointer"
                                  aria-label={`Select ${lead.firstName} ${lead.lastName}`}
                                />
                             </td>
                             <td className="px-6 py-3 text-sm font-medium text-slate-900">
                               {lead.firstName} {lead.lastName}
                             </td>
                             <td className="px-6 py-3 text-sm text-slate-500">
                               {lead.company?.name || '-'}
                             </td>
                             <td className="px-6 py-3 text-sm text-slate-500 font-mono">
                               {lead.phone}
                             </td>
                          </tr>
                       ))
                    )}
                 </tbody>
              </table>
           </div>

           {/* Campaign Name & Configuration */}
           <div className="px-6 py-4 border-t border-slate-200 bg-white space-y-4">
              {/* Campaign Name */}
              <div>
                 <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Campaign Name *</label>
                 <input
                    type="text"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    placeholder="e.g., Q1 Sales Outreach"
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                 />
              </div>

              {/* Agent Selection */}
              <div>
                 <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Select Agent for Campaign *</label>
                 <div className="relative">
                    <select
                       value={selectedAgentId}
                       onChange={(e) => setSelectedAgentId(e.target.value)}
                       className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 appearance-none"
                    >
                       <option value="" disabled>-- Select Agent --</option>
                       {agentsList.map((a: any) => (
                          <option key={a._id} value={a._id}>
                             {a.name} - {a.title}
                          </option>
                       ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                 </div>
              </div>

              {/* Configuration Sheet (Optional) */}
              <div>
                 <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Configuration Sheet (Optional)</label>
                 <textarea
                    value={campaignConfig}
                    onChange={(e) => setCampaignConfig(e.target.value)}
                    placeholder="Enter any campaign-specific instructions or overrides..."
                    rows={3}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                 />
                 <p className="text-xs text-slate-400 mt-1">💡 Leave empty to use agent's default settings</p>
              </div>
           </div>

           <div className="p-6 border-t border-slate-200 bg-slate-50 rounded-b-xl flex justify-between items-center">
              <span className="text-sm font-medium text-slate-600">
                 {selectedLeadIds.size} leads selected
              </span>
              <div className="flex space-x-3">
                 <button
                    onClick={() => setIsLeadModalOpen(false)}
                    className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 text-sm hover:bg-white"
                 >
                    Cancel
                 </button>
                 <button
                  onClick={handleStartCampaign}
                    disabled={selectedLeadIds.size === 0 || isCampaignActive || !selectedAgentId}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex items-center"
                 >
                    {isCampaignActive ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Campaign Active...
                      </>
                    ) : (
                      <>
                        <Phone className="w-4 h-4 mr-2" />
                        Start Auto-Dialer
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

export default CallManager;
