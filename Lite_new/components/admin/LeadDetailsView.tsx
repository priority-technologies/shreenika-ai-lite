import React, { useState, useEffect } from 'react';
import { ArrowLeft, ChevronDown, Phone, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { apiFetch } from '../../services/api';

interface Call {
  _id: string;
  startTime?: string;
  endTime?: string;
  duration?: number;
  status?: string;
  recording?: string;
  overview?: string;
  summary?: string;
  transcript?: string;
}

interface LeadDetail {
  _id: string;
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  calls?: Call[];
}

interface LeadDetailsViewProps {
  navigate: (path: string) => void;
  leadId: string;
}

const LeadDetailsView: React.FC<LeadDetailsViewProps> = ({ navigate, leadId }) => {
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedCall, setExpandedCall] = useState<string | null>(null);

  useEffect(() => {
    fetchLeadDetails();
  }, [leadId]);

  const fetchLeadDetails = async () => {
    try {
      setLoading(true);
      const data = await apiFetch(`/admin/leads/${leadId}`);
      if (data.lead) {
        setLead(data.lead);
      }
    } catch (err) {
      console.error('Failed to fetch lead details:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-slate-600">Loading lead details...</p>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/admin/users')}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h1 className="text-3xl font-bold text-slate-900">Lead Not Found</h1>
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
          <h1 className="text-3xl font-bold text-slate-900">{lead.name}</h1>
          <p className="text-slate-600 mt-1">Lead ID: {lead._id.slice(0, 12)}...</p>
        </div>
      </div>

      {/* Lead Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white rounded-lg border border-slate-200 p-6">
        <div>
          <p className="text-sm text-slate-600">Phone</p>
          <p className="text-lg font-semibold text-slate-900">{lead.phone || 'N/A'}</p>
        </div>
        <div>
          <p className="text-sm text-slate-600">Email</p>
          <p className="text-lg font-semibold text-slate-900">{lead.email || 'N/A'}</p>
        </div>
        <div>
          <p className="text-sm text-slate-600">Company</p>
          <p className="text-lg font-semibold text-slate-900">{lead.company || 'N/A'}</p>
        </div>
      </div>

      {/* Calls Section */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
        <h2 className="text-xl font-bold text-slate-900">
          Calls ({lead.calls?.length || 0})
        </h2>

        {!lead.calls || lead.calls.length === 0 ? (
          <p className="text-slate-600">No calls found for this lead</p>
        ) : (
          <div className="space-y-3">
            {lead.calls.map((call) => (
              <div
                key={call._id}
                className="border border-slate-200 rounded-lg overflow-hidden"
              >
                {/* Call Header (Collapsible) */}
                <button
                  onClick={() =>
                    setExpandedCall(
                      expandedCall === call._id ? null : call._id
                    )
                  }
                  className="w-full p-4 hover:bg-slate-50 flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center space-x-4 flex-1 text-left">
                    {call.status === 'Completed' ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-amber-600" />
                    )}
                    <div>
                      <p className="font-semibold text-slate-900">
                        Call {call._id.slice(0, 8)}...
                      </p>
                      <div className="flex items-center space-x-4 text-sm text-slate-600 mt-1">
                        {call.startTime && (
                          <div className="flex items-center space-x-1">
                            <Clock className="w-4 h-4" />
                            <span>
                              {new Date(call.startTime).toLocaleString()}
                            </span>
                          </div>
                        )}
                        {call.duration && (
                          <span>{call.duration}s</span>
                        )}
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            call.status === 'Completed'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {call.status || 'Unknown'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <ChevronDown
                    className={`w-5 h-5 text-slate-600 transition-transform ${
                      expandedCall === call._id ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {/* Call Details (Expandable) */}
                {expandedCall === call._id && (
                  <div className="border-t border-slate-200 bg-slate-50 p-4 space-y-4">
                    {call.recording && (
                      <div className="space-y-2">
                        <h4 className="font-semibold text-slate-700">
                          Recording
                        </h4>
                        <audio
                          controls
                          className="w-full"
                          src={call.recording}
                        />
                      </div>
                    )}

                    {call.overview && (
                      <div className="space-y-2">
                        <h4 className="font-semibold text-slate-700">
                          Overview
                        </h4>
                        <p className="text-slate-600 text-sm">
                          {call.overview}
                        </p>
                      </div>
                    )}

                    {call.summary && (
                      <div className="space-y-2">
                        <h4 className="font-semibold text-slate-700">
                          Summary
                        </h4>
                        <p className="text-slate-600 text-sm">
                          {call.summary}
                        </p>
                      </div>
                    )}

                    {call.transcript && (
                      <div className="space-y-2">
                        <h4 className="font-semibold text-slate-700">
                          Transcript
                        </h4>
                        <div className="bg-white p-3 rounded border border-slate-300 max-h-64 overflow-y-auto">
                          <p className="text-slate-600 text-sm font-mono whitespace-pre-wrap">
                            {call.transcript}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LeadDetailsView;
