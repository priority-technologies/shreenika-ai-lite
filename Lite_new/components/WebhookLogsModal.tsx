import React, { useState, useEffect } from 'react';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import axios from 'axios';

interface Log {
  _id: string;
  event: string;
  statusCode?: number;
  success: boolean;
  error?: string;
  duration: number;
  createdAt: string;
  response?: any;
  payload?: any;
  retryCount: number;
}

interface Props {
  webhookId: string;
  onClose: () => void;
}

export default function WebhookLogsModal({ webhookId, onClose }: Props) {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const token = localStorage.getItem('token');
  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const response = await axios.get(`${baseURL}/webhooks/${webhookId}/logs?limit=100`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setLogs(response.data.logs);
      } catch (err) {
        console.error('Failed to load logs:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [webhookId]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 sticky top-0 bg-white">
          <h2 className="text-2xl font-bold text-slate-900">Webhook Logs</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-4 text-slate-600">Loading logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-slate-600">
              No logs yet. Try testing the webhook to generate logs.
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={log._id}
                  className={`border rounded-lg overflow-hidden ${
                    log.success
                      ? 'border-green-200 bg-green-50'
                      : 'border-red-200 bg-red-50'
                  }`}
                >
                  <button
                    onClick={() =>
                      setExpandedLog(expandedLog === log._id ? null : log._id)
                    }
                    className="w-full p-4 flex items-center gap-3 hover:opacity-75 transition text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                            log.success
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {log.success ? '✓ Success' : '✗ Failed'}
                        </span>
                        {log.statusCode && (
                          <span className="text-xs text-slate-600">
                            Status: {log.statusCode}
                          </span>
                        )}
                        {log.retryCount > 0 && (
                          <span className="text-xs text-slate-600">
                            Retry: {log.retryCount}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-700 truncate">
                        {log.event} • {log.duration}ms • {new Date(log.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {expandedLog === log._id ? (
                      <ChevronUp size={20} className="text-slate-600" />
                    ) : (
                      <ChevronDown size={20} className="text-slate-600" />
                    )}
                  </button>

                  {/* Expanded Details */}
                  {expandedLog === log._id && (
                    <div className="px-4 pb-4 border-t border-inherit space-y-3">
                      {log.error && (
                        <div>
                          <p className="text-xs font-semibold text-slate-700 mb-1">
                            Error:
                          </p>
                          <pre className="text-xs bg-slate-100 p-2 rounded overflow-x-auto text-slate-700">
                            {log.error}
                          </pre>
                        </div>
                      )}

                      {log.payload && (
                        <div>
                          <p className="text-xs font-semibold text-slate-700 mb-1">
                            Request Payload:
                          </p>
                          <pre className="text-xs bg-slate-100 p-2 rounded overflow-x-auto text-slate-700">
                            {JSON.stringify(log.payload, null, 2)}
                          </pre>
                        </div>
                      )}

                      {log.response && (
                        <div>
                          <p className="text-xs font-semibold text-slate-700 mb-1">
                            Response:
                          </p>
                          <pre className="text-xs bg-slate-100 p-2 rounded overflow-x-auto text-slate-700">
                            {typeof log.response === 'string'
                              ? log.response
                              : JSON.stringify(log.response, null, 2)}
                          </pre>
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
    </div>
  );
}
