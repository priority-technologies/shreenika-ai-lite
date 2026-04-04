import React, { useState, useEffect } from 'react';
import { Phone, ChevronRight, Trash2, AlertCircle, Loader2, Link2 } from 'lucide-react';
import { assignNumberToAgent } from '../services/api';

interface Agent {
  _id: string;
  name: string;
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

interface VoipProviderListProps {
  numbers: VoipNumber[];
  loading: boolean;
  agents: Agent[];
  onSelectNumber: (number: VoipNumber) => void;
  onDeleteNumber: (numberId: string) => Promise<void>;
  onAssignSuccess: () => void;
}

const VoipProviderList: React.FC<VoipProviderListProps> = ({
  numbers,
  loading,
  agents,
  onSelectNumber,
  onDeleteNumber,
  onAssignSuccess
}) => {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assigningNumber, setAssigningNumber] = useState<VoipNumber | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

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

  const handleAssignClick = (e: React.MouseEvent, number: VoipNumber) => {
    e.stopPropagation();
    setAssigningNumber(number);
    setSelectedAgentId('');
    setError(null);
  };

  const handleAssignConfirm = async () => {
    if (!assigningNumber || !selectedAgentId) {
      setError('Please select an agent');
      return;
    }

    try {
      setIsAssigning(true);
      await assignNumberToAgent(assigningNumber._id, selectedAgentId);
      setAssigningNumber(null);
      setSelectedAgentId('');
      onAssignSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign number to agent');
    } finally {
      setIsAssigning(false);
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
              {!number.assignedAgent && (
                <button
                  onClick={(e) => handleAssignClick(e, number)}
                  className="px-3 py-1 text-sm bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg transition-colors font-medium"
                  title="Assign to agent"
                >
                  [Assign]
                </button>
              )}
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

      {/* Assignment Modal */}
      {assigningNumber && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            {/* Modal Header */}
            <div className="border-b border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-900">Assign Phone Number to Agent</h3>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start space-x-2">
                  <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Phone Number</p>
                <p className="text-lg font-semibold text-blue-600">{assigningNumber.phoneNumber}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">Select Agent *</label>
                <select
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">-- Choose an agent --</option>
                  {agents.map((agent) => (
                    <option key={agent._id} value={agent._id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="border-t border-gray-200 p-6 flex items-center justify-end space-x-3">
              <button
                onClick={() => setAssigningNumber(null)}
                disabled={isAssigning}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignConfirm}
                disabled={isAssigning || !selectedAgentId}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
              >
                {isAssigning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Assigning...</span>
                  </>
                ) : (
                  <>
                    <Link2 className="w-4 h-4" />
                    <span>Assign</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VoipProviderList;
