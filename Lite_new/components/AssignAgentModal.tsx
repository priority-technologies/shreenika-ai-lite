import React, { useState } from 'react';
import { X, Check } from 'lucide-react';
import { AgentConfig } from '../types';

interface AssignAgentModalProps {
  isOpen: boolean;
  agents: AgentConfig[];
  onClose: () => void;
  onConfirm: (agentIds: string[]) => void;
}

const AssignAgentModal: React.FC<AssignAgentModalProps> = ({
  isOpen,
  agents,
  onClose,
  onConfirm,
}) => {
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);

  if (!isOpen) return null;

  const toggleAgent = (id: string) => {
    setSelectedAgentIds((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const handleConfirm = () => {
    if (selectedAgentIds.length === 0) {
      alert('Please assign at least one agent.');
      return;
    }
    onConfirm(selectedAgentIds);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-lg font-bold text-slate-900">
            Assign Agent(s)
          </h3>
          <button onClick={onClose}>
            <X className="w-5 h-5 text-slate-500 hover:text-slate-700" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3 max-h-[300px] overflow-y-auto">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => toggleAgent(agent.id!)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-all ${
                selectedAgentIds.includes(agent.id!)
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="text-left">
                <div className="text-sm font-semibold text-slate-900">
                  {agent.name}
                </div>
                <div className="text-xs text-slate-500">
                  {agent.title}
                </div>
              </div>

              {selectedAgentIds.includes(agent.id!) && (
                <Check className="w-5 h-5 text-blue-600" />
              )}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700"
          >
            Assign & Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default AssignAgentModal;
