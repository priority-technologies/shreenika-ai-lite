import React, { useState, useEffect } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import axios from 'axios';

interface Webhook {
  _id?: string;
  name: string;
  description?: string;
  url: string;
  events: string[];
  headers?: Record<string, string>;
  auth?: {
    type: 'none' | 'basic' | 'bearer' | 'api_key';
    credentials?: {
      username?: string;
      password?: string;
      token?: string;
      apiKey?: string;
      apiKeyHeader?: string;
    };
  };
}

interface Props {
  webhook?: Webhook | null;
  onClose: () => void;
  onSave: () => void;
}

const AVAILABLE_EVENTS = [
  'lead.created',
  'lead.updated',
  'call.completed',
  'agent.assigned',
  'contact.created',
];

export default function WebhookModal({ webhook, onClose, onSave }: Props) {
  const [formData, setFormData] = useState<Webhook>(
    webhook || {
      name: '',
      url: '',
      events: [],
      headers: {},
      auth: { type: 'none' },
    }
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAuthCredentials, setShowAuthCredentials] = useState<Record<string, boolean>>({});

  const token = localStorage.getItem('token');
  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (webhook?._id) {
        await axios.put(`${baseURL}/webhooks/${webhook._id}`, formData, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        await axios.post(`${baseURL}/webhooks`, formData, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      onSave();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save webhook');
    } finally {
      setLoading(false);
    }
  };

  const toggleEvent = (event: string) => {
    setFormData((prev) => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter((e) => e !== event)
        : [...prev.events, event],
    }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 sticky top-0 bg-white">
          <h2 className="text-2xl font-bold text-slate-900">
            {webhook ? 'Edit Webhook' : 'Create New Webhook'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={24} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-2">
              Webhook Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., HubSpot Lead Sync"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-2">
              Description (optional)
            </label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="What does this webhook do?"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={2}
            />
          </div>

          {/* Webhook URL */}
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-2">
              Webhook URL
            </label>
            <input
              type="url"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              placeholder="https://your-crm.com/webhooks/shreenika"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          {/* Events */}
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-3">
              Events to Send
            </label>
            <div className="grid grid-cols-2 gap-3">
              {AVAILABLE_EVENTS.map((event) => (
                <label key={event} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.events.includes(event)}
                    onChange={() => toggleEvent(event)}
                    className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                  />
                  <span className="text-sm text-slate-700">{event}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Authentication */}
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-3">
              Authentication
            </label>
            <select
              value={formData.auth?.type || 'none'}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  auth: { ...formData.auth, type: e.target.value as any },
                })
              }
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="none">None</option>
              <option value="basic">Basic Auth</option>
              <option value="bearer">Bearer Token</option>
              <option value="api_key">API Key</option>
            </select>

            {formData.auth?.type === 'basic' && (
              <div className="mt-4 space-y-3">
                <input
                  type="text"
                  placeholder="Username"
                  defaultValue={formData.auth?.credentials?.username || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      auth: {
                        ...formData.auth,
                        credentials: {
                          ...formData.auth?.credentials,
                          username: e.target.value,
                        },
                      },
                    })
                  }
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
                <div className="relative">
                  <input
                    type={showAuthCredentials['password'] ? 'text' : 'password'}
                    placeholder="Password"
                    defaultValue={formData.auth?.credentials?.password || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        auth: {
                          ...formData.auth,
                          credentials: {
                            ...formData.auth?.credentials,
                            password: e.target.value,
                          },
                        },
                      })
                    }
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowAuthCredentials({
                        ...showAuthCredentials,
                        password: !showAuthCredentials['password'],
                      })
                    }
                    className="absolute right-3 top-2.5 text-slate-400"
                  >
                    {showAuthCredentials['password'] ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            )}

            {formData.auth?.type === 'bearer' && (
              <div className="mt-4 relative">
                <input
                  type={showAuthCredentials['token'] ? 'text' : 'password'}
                  placeholder="Bearer Token"
                  defaultValue={formData.auth?.credentials?.token || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      auth: {
                        ...formData.auth,
                        credentials: {
                          ...formData.auth?.credentials,
                          token: e.target.value,
                        },
                      },
                    })
                  }
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
                <button
                  type="button"
                  onClick={() =>
                    setShowAuthCredentials({
                      ...showAuthCredentials,
                      token: !showAuthCredentials['token'],
                    })
                  }
                  className="absolute right-3 top-2.5 text-slate-400"
                >
                  {showAuthCredentials['token'] ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            )}

            {formData.auth?.type === 'api_key' && (
              <div className="mt-4 space-y-3">
                <input
                  type="text"
                  placeholder="API Key Header Name (e.g., X-API-Key)"
                  defaultValue={formData.auth?.credentials?.apiKeyHeader || 'X-API-Key'}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      auth: {
                        ...formData.auth,
                        credentials: {
                          ...formData.auth?.credentials,
                          apiKeyHeader: e.target.value,
                        },
                      },
                    })
                  }
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
                <div className="relative">
                  <input
                    type={showAuthCredentials['apiKey'] ? 'text' : 'password'}
                    placeholder="API Key"
                    defaultValue={formData.auth?.credentials?.apiKey || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        auth: {
                          ...formData.auth,
                          credentials: {
                            ...formData.auth?.credentials,
                            apiKey: e.target.value,
                          },
                        },
                      })
                    }
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowAuthCredentials({
                        ...showAuthCredentials,
                        apiKey: !showAuthCredentials['apiKey'],
                      })
                    }
                    className="absolute right-3 top-2.5 text-slate-400"
                  >
                    {showAuthCredentials['apiKey'] ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Webhook'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
