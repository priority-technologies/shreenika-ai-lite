import React, { useState, useEffect } from 'react';
import { Plus, Settings, Trash2, Eye, EyeOff, Play } from 'lucide-react';
import axios from 'axios';
import WebhookModal from './WebhookModal';
import WebhookLogsModal from './WebhookLogsModal';

interface Webhook {
  _id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  lastTriggeredAt?: string;
  lastSuccessAt?: string;
  successCount: number;
  failureCount: number;
  auth?: {
    type: string;
    configured: boolean;
  };
}

export default function IntegrationsPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [showLogs, setShowLogs] = useState<string | null>(null);
  const [error, setError] = useState('');

  const token = localStorage.getItem('token');
  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  const fetchWebhooks = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${baseURL}/webhooks`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setWebhooks(response.data.webhooks);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load webhooks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWebhooks();
  }, []);

  const handleDelete = async (webhookId: string) => {
    if (!confirm('Are you sure you want to delete this webhook?')) return;

    try {
      await axios.delete(`${baseURL}/webhooks/${webhookId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setWebhooks(webhooks.filter((w) => w._id !== webhookId));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete webhook');
    }
  };

  const handleToggleStatus = async (webhook: Webhook) => {
    try {
      const response = await axios.patch(`${baseURL}/webhooks/${webhook._id}/toggle`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setWebhooks(webhooks.map((w) => (w._id === webhook._id ? response.data.webhook : w)));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update webhook');
    }
  };

  const handleTest = async (webhookId: string) => {
    try {
      const response = await axios.post(`${baseURL}/webhooks/${webhookId}/test`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      alert(`Test sent! Status: ${response.data.result.statusCode}`);
    } catch (err: any) {
      alert(`Test failed: ${err.response?.data?.error || err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Integrations</h1>
          <p className="text-slate-600">Manage webhooks to sync data with your CRM or custom systems</p>
        </div>

        {/* Create Button */}
        <button
          onClick={() => {
            setEditingWebhook(null);
            setShowModal(true);
          }}
          className="mb-6 flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
        >
          <Plus size={20} />
          New Webhook
        </button>

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Webhooks List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-slate-600">Loading webhooks...</p>
          </div>
        ) : webhooks.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
            <Settings size={48} className="mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No webhooks yet</h3>
            <p className="text-slate-600 mb-6">
              Create your first webhook to start syncing data with external systems
            </p>
            <button
              onClick={() => {
                setEditingWebhook(null);
                setShowModal(true);
              }}
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              <Plus size={20} />
              Create Webhook
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {webhooks.map((webhook) => (
              <div key={webhook._id} className="bg-white rounded-lg border border-slate-200 p-6 hover:shadow-md transition">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-slate-900">{webhook.name}</h3>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          webhook.isActive
                            ? 'bg-green-100 text-green-700'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {webhook.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 mb-3 break-all">{webhook.url}</p>
                    <div className="flex gap-4 flex-wrap">
                      <div>
                        <p className="text-xs text-slate-500">Events</p>
                        <div className="flex gap-2 mt-1">
                          {webhook.events.map((event) => (
                            <span key={event} className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded">
                              {event}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Stats</p>
                        <p className="text-sm text-slate-700 mt-1">
                          ✅ {webhook.successCount} | ❌ {webhook.failureCount}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleTest(webhook._id)}
                      title="Test webhook"
                      className="p-2 text-slate-600 hover:bg-slate-100 rounded transition"
                    >
                      <Play size={18} />
                    </button>
                    <button
                      onClick={() => setShowLogs(webhook._id)}
                      title="View logs"
                      className="p-2 text-slate-600 hover:bg-slate-100 rounded transition"
                    >
                      <Eye size={18} />
                    </button>
                    <button
                      onClick={() => handleToggleStatus(webhook)}
                      title={webhook.isActive ? 'Deactivate' : 'Activate'}
                      className="p-2 text-slate-600 hover:bg-slate-100 rounded transition"
                    >
                      {webhook.isActive ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                    <button
                      onClick={() => setEditingWebhook(webhook)}
                      title="Edit webhook"
                      className="p-2 text-slate-600 hover:bg-slate-100 rounded transition"
                    >
                      <Settings size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(webhook._id)}
                      title="Delete webhook"
                      className="p-2 text-red-600 hover:bg-red-50 rounded transition"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showModal && (
        <WebhookModal
          webhook={editingWebhook}
          onClose={() => {
            setShowModal(false);
            setEditingWebhook(null);
          }}
          onSave={() => {
            setShowModal(false);
            setEditingWebhook(null);
            fetchWebhooks();
          }}
        />
      )}

      {showLogs && (
        <WebhookLogsModal
          webhookId={showLogs}
          onClose={() => setShowLogs(null)}
        />
      )}
    </div>
  );
}
