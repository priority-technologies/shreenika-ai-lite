import React, { useState, useEffect } from 'react';
import { Plus, AlertCircle, Loader2, Play, Pause, Trash2, Eye } from 'lucide-react';
import {
  getCampaigns,
  createCampaign,
  startCampaign,
  pauseCampaign,
  resumeCampaign,
  deleteCampaign,
  getAgents,
  getContacts,
} from '../services/api';

interface Campaign {
  _id: string;
  campaignName: string;
  agentId: string;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'cancelled';
  leads: any[];
  executionMetrics?: {
    leadsProcessed: number;
    totalDuration: number;
    sentimentDistribution: any;
    agentPerformance: any;
  };
  createdAt: string;
}

interface Agent {
  _id: string;
  name: string;
}

interface Contact {
  _id: string;
  name: string;
  email: string;
  phone: string;
}

const CampaignManager: React.FC = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    campaignName: '',
    agentId: '',
    configurationSheet: '',
    selectedLeadIds: [] as string[],
  });

  // Load campaigns and supporting data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [campaignsResponse, agentsResponse, contactsResponse] = await Promise.all([
        getCampaigns().catch(() => []),
        getAgents().catch(() => []),
        getContacts().catch(() => []),
      ]);

      setCampaigns(Array.isArray(campaignsResponse) ? campaignsResponse : []);
      setAgents(Array.isArray(agentsResponse) ? agentsResponse : (agentsResponse?.agents || []));
      setContacts(Array.isArray(contactsResponse) ? contactsResponse : (contactsResponse?.contacts || []));
    } catch (err: any) {
      console.error('❌ Error loading data:', err);
      setError('Failed to load campaigns and data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.campaignName || !formData.agentId || formData.selectedLeadIds.length === 0) {
      setError('Please fill in all required fields');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      // Convert selected lead IDs to full lead objects
      const leadsData = formData.selectedLeadIds
        .map(leadId => contacts.find(c => c._id === leadId))
        .filter(Boolean)
        .map(contact => ({
          leadId: contact._id,
          name: contact.name,
          phone: contact.phone,
          email: contact.email,
          metadata: {},
          status: 'pending' as const,
          retryCount: 0,
        }));

      await createCampaign({
        agentId: formData.agentId,
        campaignName: formData.campaignName,
        configurationSheet: formData.configurationSheet,
        status: 'draft',
        leads: leadsData,
      });

      // Reset form
      setFormData({
        campaignName: '',
        agentId: '',
        configurationSheet: '',
        selectedLeadIds: [],
      });
      setShowCreateModal(false);

      // Reload campaigns
      await loadData();
    } catch (err: any) {
      console.error('❌ Create campaign error:', err);
      setError(err.message || 'Failed to create campaign');
    } finally {
      setIsCreating(false);
    }
  };

  const handleStartCampaign = async (campaignId: string) => {
    try {
      await startCampaign(campaignId);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to start campaign');
    }
  };

  const handlePauseCampaign = async (campaignId: string) => {
    try {
      await pauseCampaign(campaignId);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to pause campaign');
    }
  };

  const handleResumeCampaign = async (campaignId: string) => {
    try {
      await resumeCampaign(campaignId);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to resume campaign');
    }
  };

  const handleDeleteCampaign = async (campaignId: string) => {
    if (!window.confirm('Are you sure you want to delete this campaign?')) {
      return;
    }

    try {
      await deleteCampaign(campaignId);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete campaign');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
          <p className="text-slate-600">Loading campaigns...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Campaigns</h1>
          <p className="text-slate-500">Manage and execute outbound call campaigns</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Campaign
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}

      {/* Create Campaign Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Create New Campaign</h2>

            <form onSubmit={handleCreateCampaign} className="space-y-4">
              {/* Campaign Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Campaign Name *
                </label>
                <input
                  type="text"
                  value={formData.campaignName}
                  onChange={(e) => setFormData({ ...formData, campaignName: e.target.value })}
                  placeholder="e.g., Q1 Sales Outreach"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isCreating}
                />
              </div>

              {/* Agent Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Select Agent *
                </label>
                <select
                  value={formData.agentId}
                  onChange={(e) => setFormData({ ...formData, agentId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isCreating}
                >
                  <option value="">-- Select an agent --</option>
                  {agents.map((agent) => (
                    <option key={agent._id} value={agent._id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Configuration Sheet */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Configuration Sheet (System Instruction)
                </label>
                <textarea
                  value={formData.configurationSheet}
                  onChange={(e) =>
                    setFormData({ ...formData, configurationSheet: e.target.value })
                  }
                  placeholder="Enter campaign configuration or agent instructions..."
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isCreating}
                />
              </div>

              {/* Lead Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Select Leads * ({formData.selectedLeadIds.length} selected)
                </label>
                <div className="max-h-48 overflow-y-auto border border-slate-300 rounded-lg p-3 space-y-2">
                  {contacts.length === 0 ? (
                    <p className="text-sm text-slate-500">No contacts available</p>
                  ) : (
                    contacts.map((contact) => (
                      <label key={contact._id} className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.selectedLeadIds.includes(contact._id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormData({
                                ...formData,
                                selectedLeadIds: [...formData.selectedLeadIds, contact._id],
                              });
                            } else {
                              setFormData({
                                ...formData,
                                selectedLeadIds: formData.selectedLeadIds.filter(
                                  (id) => id !== contact._id
                                ),
                              });
                            }
                          }}
                          disabled={isCreating}
                        />
                        <span className="text-sm text-slate-700">
                          {contact.name} ({contact.phone})
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={isCreating}
                  className="flex-1 px-4 py-2 text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                      Creating...
                    </>
                  ) : (
                    'Create Campaign'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Campaigns Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {campaigns.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-slate-600">No campaigns yet. Create one to get started!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700">Campaign Name</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700">Agent</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700">Leads</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700">Status</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700">Created</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {campaigns.map((campaign) => {
                  const agent = agents.find((a) => a._id === campaign.agentId);
                  return (
                    <tr key={campaign._id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium text-slate-900">
                        {campaign.campaignName}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {agent?.name || 'Unknown'}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {campaign.leads?.length || 0}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            campaign.status === 'draft'
                              ? 'bg-slate-100 text-slate-700'
                              : campaign.status === 'running'
                              ? 'bg-green-100 text-green-700'
                              : campaign.status === 'paused'
                              ? 'bg-yellow-100 text-yellow-700'
                              : campaign.status === 'completed'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {campaign.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {new Date(campaign.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2 flex justify-end">
                        {campaign.status === 'draft' && (
                          <button
                            onClick={() => handleStartCampaign(campaign._id)}
                            className="inline-flex items-center px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                            title="Start Campaign"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                        )}
                        {campaign.status === 'running' && (
                          <button
                            onClick={() => handlePauseCampaign(campaign._id)}
                            className="inline-flex items-center px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 transition-colors"
                            title="Pause Campaign"
                          >
                            <Pause className="w-4 h-4" />
                          </button>
                        )}
                        {campaign.status === 'paused' && (
                          <button
                            onClick={() => handleResumeCampaign(campaign._id)}
                            className="inline-flex items-center px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                            title="Resume Campaign"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => {}}
                          className="inline-flex items-center px-2 py-1 text-xs bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteCampaign(campaign._id)}
                          className="inline-flex items-center px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                          title="Delete Campaign"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CampaignManager;
