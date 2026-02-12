import React, { useState, useEffect } from 'react';
import { Search, Trash2, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiFetch } from '../../services/api';

interface Lead {
  _id: string;
  name: string;
  phone?: string;
  email?: string;
  isArchived?: boolean;
  archivedAt?: string;
}

interface UserLeadsSectionProps {
  userId: string;
  navigate: (path: string) => void;
}

const UserLeadsSection: React.FC<UserLeadsSectionProps> = ({ userId, navigate }) => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [message, setMessage] = useState('');
  const leadsPerPage = 50;

  useEffect(() => {
    fetchLeads();
  }, [userId]);

  useEffect(() => {
    filterLeads();
  }, [leads, searchTerm]);

  const fetchLeads = async () => {
    try {
      setLoading(true);
      const data = await apiFetch(`/admin/users/${userId}/leads`);
      setLeads(data.leads || []);
    } catch (err) {
      console.error('Failed to fetch leads:', err);
      setMessage('Failed to load leads');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  const filterLeads = () => {
    let filtered = [...leads];

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (l) =>
          (l.name && l.name.toLowerCase().includes(term)) ||
          (l.phone && l.phone.toLowerCase().includes(term)) ||
          (l.email && l.email.toLowerCase().includes(term))
      );
    }

    setFilteredLeads(filtered);
    setCurrentPage(1);
  };

  const handleDeleteLead = async (leadId: string) => {
    if (!confirm('Are you sure you want to archive this lead?')) return;

    try {
      // Archive the lead (soft delete)
      const leadData = leads.find(l => l._id === leadId);
      if (leadData) {
        // Since the backend endpoint is /admin/users/:userId/leads/:leadId, we need to call it
        // For now, we'll make a generic call to archive
        await apiFetch(`/admin/leads/${leadId}`, { method: 'DELETE' }, 'core');
        setMessage('✅ Lead archived successfully');
        fetchLeads();
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (err) {
      console.error('Failed to archive lead:', err);
      setMessage('❌ Failed to archive lead');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  // Pagination
  const totalPages = Math.ceil(filteredLeads.length / leadsPerPage);
  const startIdx = (currentPage - 1) * leadsPerPage;
  const endIdx = startIdx + leadsPerPage;
  const paginatedLeads = filteredLeads.slice(startIdx, endIdx);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-900">Leads</h2>

      {message && (
        <div className="p-4 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
          {message}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
        <input
          type="text"
          placeholder="Search by name, phone, or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-600">
            <p>Loading leads...</p>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="p-8 text-center text-slate-600">
            <p>No leads found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">
                      S.No.
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">
                      Phone
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">
                      Status
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-slate-600">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {paginatedLeads.map((lead, idx) => (
                    <tr
                      key={lead._id}
                      className={`hover:bg-slate-50 ${
                        lead.isArchived ? 'bg-red-50' : ''
                      }`}
                    >
                      <td className="px-6 py-3 text-sm text-slate-600">
                        {startIdx + idx + 1}
                      </td>
                      <td className="px-6 py-3 text-sm font-medium text-slate-900">
                        {lead.name || 'N/A'}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-600">
                        {lead.phone || 'N/A'}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-600">
                        {lead.email || 'N/A'}
                      </td>
                      <td className="px-6 py-3 text-sm">
                        {lead.isArchived ? (
                          <span className="px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            Archived
                          </span>
                        ) : (
                          <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            onClick={() =>
                              navigate(
                                `/admin/leads/${lead._id}`
                              )
                            }
                            className="p-2 hover:bg-blue-50 rounded text-blue-600 transition-colors"
                            title="View details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteLead(lead._id)}
                            className="p-2 hover:bg-red-50 rounded text-red-600 transition-colors"
                            title="Archive lead"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
                <p className="text-sm text-slate-600">
                  Page {currentPage} of {totalPages} ({filteredLeads.length} total)
                </p>
                <div className="flex space-x-2">
                  <button
                    onClick={() =>
                      setCurrentPage(Math.max(1, currentPage - 1))
                    }
                    disabled={currentPage === 1}
                    className="p-2 hover:bg-white disabled:opacity-50 rounded border border-slate-300"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() =>
                      setCurrentPage(Math.min(totalPages, currentPage + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="p-2 hover:bg-white disabled:opacity-50 rounded border border-slate-300"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default UserLeadsSection;
