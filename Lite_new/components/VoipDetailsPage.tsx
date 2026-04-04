import React, { useState } from 'react';
import { Phone, ChevronLeft, Trash2, Copy, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';

interface Credentials {
  [key: string]: string;
}

interface VoipProvider {
  _id: string;
  provider: string;
  isActive: boolean;
}

interface VoipNumber {
  _id: string;
  phoneNumber: string;
  friendlyName: string;
  assignedAgent?: {
    _id: string;
    name: string;
  };
  voipProvider: VoipProvider;
}

interface VoipDetailsPageProps {
  number: VoipNumber;
  credentials?: Credentials;
  endpointUrl?: string;
  customScript?: string;
  onBack: () => void;
  onDelete: () => Promise<void>;
  loading?: boolean;
}

const VoipDetailsPage: React.FC<VoipDetailsPageProps> = ({
  number,
  credentials = {},
  endpointUrl = '',
  customScript = '',
  onBack,
  onDelete,
  loading = false
}) => {
  const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const toggleFieldVisibility = (field: string) => {
    const newVisible = new Set(visibleFields);
    if (newVisible.has(field)) {
      newVisible.delete(field);
    } else {
      newVisible.add(field);
    }
    setVisibleFields(newVisible);
  };

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleDelete = async () => {
    try {
      setDeleting(true);
      setError(null);
      await onDelete();
      setShowDeleteConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete VOIP connection');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header with Back Button */}
      <div className="flex items-center space-x-3 mb-6">
        <button
          onClick={onBack}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="Go back"
        >
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </button>
        <div className="flex items-center space-x-2">
          <Phone className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">{number.voipProvider?.provider || 'VOIP Provider'}</h1>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3 mb-6">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-red-900">Error</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* DID and Agent Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium text-blue-900 uppercase tracking-wide">DID Number</p>
            <p className="text-lg font-semibold text-blue-900 mt-1">{number.phoneNumber}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-blue-900 uppercase tracking-wide">Assigned Agent</p>
            <p className="text-lg font-semibold text-blue-900 mt-1">
              {number.assignedAgent?.name || 'Not assigned'}
            </p>
          </div>
        </div>
      </div>

      {/* Credentials Section */}
      {Object.keys(credentials).length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Connection Details</h2>
          <div className="space-y-3">
            {Object.entries(credentials).map(([key, value]) => {
              const displayKey = key
                .replace(/([A-Z])/g, ' $1')
                .replace(/^./, (str) => str.toUpperCase())
                .trim();

              const isSensitive = ['password', 'token', 'key', 'secret', 'auth'].some((term) =>
                key.toLowerCase().includes(term)
              );
              const isVisible = visibleFields.has(key);

              return (
                <div key={key} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700">{displayKey}</label>
                    <div className="flex items-center space-x-2">
                      {isSensitive && (
                        <button
                          onClick={() => toggleFieldVisibility(key)}
                          className="p-1 hover:bg-gray-100 rounded transition-colors"
                          title={isVisible ? 'Hide' : 'Show'}
                        >
                          {isVisible ? (
                            <EyeOff className="w-4 h-4 text-gray-600" />
                          ) : (
                            <Eye className="w-4 h-4 text-gray-600" />
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => handleCopy(value, key)}
                        className="p-1 hover:bg-gray-100 rounded transition-colors"
                        title="Copy to clipboard"
                      >
                        <Copy className="w-4 h-4 text-gray-600" />
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <input
                      type={isSensitive && !isVisible ? 'password' : 'text'}
                      value={value}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 font-mono text-sm text-gray-700"
                    />
                    {copied === key && (
                      <div className="absolute top-full left-0 mt-1 text-xs text-green-600 font-medium">
                        Copied!
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Endpoint URL Section */}
      {endpointUrl && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Endpoint URL</h2>
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Endpoint</label>
              <button
                onClick={() => handleCopy(endpointUrl, 'endpoint')}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
                title="Copy to clipboard"
              >
                <Copy className="w-4 h-4 text-gray-600" />
              </button>
            </div>
            <input
              type="text"
              value={endpointUrl}
              readOnly
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 font-mono text-sm text-gray-700 break-all"
            />
            {copied === 'endpoint' && (
              <div className="text-xs text-green-600 font-medium mt-1">Copied!</div>
            )}
          </div>
        </div>
      )}

      {/* Custom Script Section */}
      {customScript && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Custom IVR Script</h2>
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Script</label>
              <button
                onClick={() => handleCopy(customScript, 'script')}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
                title="Copy to clipboard"
              >
                <Copy className="w-4 h-4 text-gray-600" />
              </button>
            </div>
            <textarea
              value={customScript}
              readOnly
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 font-mono text-sm text-gray-700 h-24"
            />
            {copied === 'script' && (
              <div className="text-xs text-green-600 font-medium mt-1">Copied!</div>
            )}
          </div>
        </div>
      )}

      {/* Delete Section */}
      <div className="pt-6 border-t border-gray-200">
        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full px-4 py-3 bg-red-50 border border-red-200 text-red-600 font-medium rounded-lg hover:bg-red-100 transition-colors flex items-center justify-center space-x-2"
          >
            <Trash2 className="w-5 h-5" />
            <span>Delete VOIP Connection</span>
          </button>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 className="font-semibold text-red-900 mb-2">Delete VOIP Connection?</h3>
            <p className="text-sm text-red-700 mb-4">
              This will disconnect this VOIP number and cannot be undone. Calls will no longer be able to use this DID.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 px-4 py-2 border border-red-300 text-red-700 font-medium rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                {deleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VoipDetailsPage;
