import React, { useState, useEffect } from 'react';
import { Phone, ChevronRight, Trash2, AlertCircle, Loader2 } from 'lucide-react';

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

interface VoipProviderListProps {
  numbers: VoipNumber[];
  loading: boolean;
  onSelectNumber: (number: VoipNumber) => void;
  onDeleteNumber: (numberId: string) => Promise<void>;
}

const VoipProviderList: React.FC<VoipProviderListProps> = ({
  numbers,
  loading,
  onSelectNumber,
  onDeleteNumber
}) => {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async (e: React.MouseEvent, numberId: string) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this VOIP connection? This action cannot be undone.')) {
      return;
    }

    try {
      setDeleting(numberId);
      await onDeleteNumber(numberId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete VOIP connection');
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  if (numbers.length === 0) {
    return (
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
        <Phone className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <p className="text-gray-700 font-medium">No VOIP connections yet</p>
        <p className="text-sm text-gray-500 mt-1">Connect a VOIP provider to start making calls</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-red-900">Error</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {numbers.map((number) => (
          <div
            key={number._id}
            onClick={() => onSelectNumber(number)}
            className="border border-gray-200 rounded-lg p-4 hover:bg-blue-50 hover:border-blue-300 cursor-pointer transition-colors flex items-center justify-between"
          >
            <div className="flex items-center space-x-4 flex-1">
              <div className="flex-shrink-0">
                <Phone className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">{number.voipProvider?.provider || 'Unknown Provider'}</h3>
                <div className="flex items-center space-x-4 mt-1">
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">DID:</span> {number.phoneNumber}
                  </p>
                  {number.assignedAgent && (
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Agent:</span> {number.assignedAgent.name}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={(e) => handleDelete(e, number._id)}
                disabled={deleting === number._id}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                title="Delete VOIP connection"
              >
                {deleting === number._id ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Trash2 className="w-5 h-5" />
                )}
              </button>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default VoipProviderList;
