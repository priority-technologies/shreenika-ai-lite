import React, { useRef, useState, useEffect } from 'react';
import { AgentConfig, KnowledgeDocument } from '../types';
import { FileText, Plus, Search, Trash2, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import AssignAgentModal from '../components/AssignAgentModal';
import { getAgents, getBillingStatus } from '../services/api';

type PlanType = 'Starter' | 'Pro' | 'Enterprise';

interface KnowledgeCenterProps {
  agent: AgentConfig;
  setAgent: (agent: AgentConfig) => void;
}

const KnowledgeCenter: React.FC<KnowledgeCenterProps> = ({ agent, setAgent }) => {
  const [isBuyModalOpen, setIsBuyModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [uploading, setUploading] = useState(false);
  const [pendingDoc, setPendingDoc] = useState<any>(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [allAgents, setAllAgents] = useState<AgentConfig[]>([agent]);

  // Plan-based access control - fetched from billing API
  const [planLoading, setPlanLoading] = useState(true);
  const [knowledgeEnabled, setKnowledgeEnabled] = useState(false);
  const [maxDocs, setMaxDocs] = useState(0);
  const [currentPlan, setCurrentPlan] = useState<PlanType>('Starter');

  // Fetch subscription/plan data from backend
  useEffect(() => {
    const fetchPlanData = async () => {
      try {
        setPlanLoading(true);
        const subscription = await getBillingStatus();
        const plan = subscription.plan || 'Starter';
        setCurrentPlan(plan as PlanType);
        setKnowledgeEnabled(subscription.knowledgeBaseEnabled ?? false);
        setMaxDocs(subscription.docLimit ?? 0);
      } catch (err) {
        console.error('Failed to fetch billing status:', err);
        // Default to Starter on error
        setCurrentPlan('Starter');
        setKnowledgeEnabled(false);
        setMaxDocs(0);
      } finally {
        setPlanLoading(false);
      }
    };
    fetchPlanData();
  }, []);

  // Fetch all agents from backend for assignment modal
  useEffect(() => {
    const fetchAllAgents = async () => {
      try {
        const agents = await getAgents();
        if (Array.isArray(agents) && agents.length > 0) {
          setAllAgents(agents);
        }
      } catch (err) {
        console.error('Failed to fetch agents for assignment:', err);
      }
    };
    fetchAllAgents();
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!knowledgeEnabled) {
      alert('Please upgrade your plan to use Knowledge Base.');
      return;
    }
    if (maxDocs !== Infinity && (agent.knowledgeBase?.length || 0) >= maxDocs) {
      alert('Knowledge Base document limit reached.');
      return;
    }
    if (e.target.files && e.target.files[0]) {
      setUploading(true);
      const file = e.target.files[0];

      // Simulate network upload (backend upload endpoint not yet implemented)
      setTimeout(() => {
        const newDoc: KnowledgeDocument = {
          id: Math.random().toString(36).substr(2, 9),
          name: file.name,
          size: (file.size / 1024).toFixed(1) + ' KB',
          type: file.type || 'application/pdf',
          status: 'synced',
          uploadedAt: new Date().toISOString(),
          assignedAgentIds: [],
          uploadedFrom: 'global',
        };

        setPendingDoc(newDoc);
        setIsAssignModalOpen(true);
        setUploading(false);
      }, 1500);
    }
  };

  const handleDelete = (id: string) => {
    setAgent({
      ...agent,
      knowledgeBase: agent.knowledgeBase.filter(doc => doc.id !== id)
    });
  };

  const filteredDocs = (agent.knowledgeBase || []).filter(doc =>
    doc.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Show loading while fetching plan data
  if (planLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Knowledge Center</h1>
          <p className="text-slate-500">Manage documents and resources for your AI agent.</p>
        </div>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <span className="ml-3 text-slate-600">Loading plan data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Knowledge Center</h1>
          <p className="text-slate-500">Manage documents and resources for your AI agent.</p>
        </div>

        {(agent.knowledgeBase?.length > 0) && knowledgeEnabled && (
          <div className="flex space-x-3">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={handleFileUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg transition-colors font-medium shadow-sm"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              <span>Add Document</span>
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[400px]">
        {(!agent.knowledgeBase || agent.knowledgeBase.length === 0) ? (
          <div className="flex flex-col items-center justify-center h-full py-20 text-center">
            <div className="mb-6">
               <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-slate-800">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
               </svg>
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Your Knowledge Center is Empty</h3>
            <p className="text-slate-500 max-w-sm mb-8">Get started by adding your first infobase document.</p>

            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={handleFileUpload}
            />
            <button
              onClick={() => {
                if (!knowledgeEnabled) {
                  setIsBuyModalOpen(true);
                  return;
                }
                fileInputRef.current?.click();
              }}
              disabled={uploading}
              className="bg-slate-900 text-white px-6 py-3 rounded-lg font-medium hover:bg-slate-800 transition-colors flex items-center"
            >
               {uploading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Plus className="w-5 h-5 mr-2" />}
               Add Document
            </button>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="p-4 border-b border-slate-200 flex items-center bg-slate-50">
               <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search documents..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 w-full rounded-md border-slate-300 border p-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                  />
               </div>
               <div className="ml-auto text-sm text-slate-500">
                  {filteredDocs.length} documents
               </div>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Document Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Size</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Uploaded At</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {filteredDocs.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-slate-900">{doc.name}</div>
                            <div className="text-xs text-slate-500">{doc.type}</div>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        {doc.size}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        {new Date(doc.uploadedAt).toLocaleDateString()}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                            ${doc.status === 'synced' ? 'bg-green-100 text-green-800' : ''}
                            ${doc.status === 'processing' ? 'bg-yellow-100 text-yellow-800' : ''}
                            ${doc.status === 'failed' ? 'bg-red-100 text-red-800' : ''}
                          `}
                        >
                          {doc.status === 'synced' && <CheckCircle className="w-3 h-3 mr-1" />}
                          {doc.status === 'processing' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                          {doc.status === 'failed' && <AlertCircle className="w-3 h-3 mr-1" />}
                          {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
                        </span>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleDelete(doc.id)}
                          className="text-slate-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ===== Assign Agent Modal ===== */}
      <AssignAgentModal
        isOpen={isAssignModalOpen}
        agents={allAgents}
        onClose={() => {
          setIsAssignModalOpen(false);
          setPendingDoc(null);
        }}
        onConfirm={(agentIds) => {
          const finalDoc = {
            ...pendingDoc,
            assignedAgentIds: agentIds,
          };

          setAgent({
            ...agent,
            knowledgeBase: [...(agent.knowledgeBase || []), finalDoc],
          });

          setPendingDoc(null);
          setIsAssignModalOpen(false);
        }}
      />

      {/* ===== Upgrade Modal ===== */}
      {isBuyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white p-6 rounded-xl max-w-md text-center">
            <h3 className="text-xl font-bold mb-2">Upgrade Required</h3>
            <p className="text-gray-600 mb-6">
              Your current plan ({currentPlan}) does not allow uploading documents to the Knowledge Base.
              Please upgrade to Pro or Enterprise to use this feature.
            </p>
            <button
              onClick={() => setIsBuyModalOpen(false)}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default KnowledgeCenter;
