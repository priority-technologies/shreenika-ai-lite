import React, { useState, useEffect } from 'react';
import { ArrowLeft, Search, Trash2, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiFetch } from '../../services/api';

interface User {
  _id: string;
  email: string;
  name: string;
  phone?: string;
  accountType?: string;
  createdAt?: string;
  stats?: {
    contacts: number;
    calls: number;
    agents: number;
  };
}

interface UserManagementListProps {
  navigate: (path: string) => void;
}

const UserManagementList: React.FC<UserManagementListProps> = ({ navigate }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [accountTypeFilter, setAccountTypeFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [message, setMessage] = useState('');
  const usersPerPage = 20;

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    filterUsers();
  }, [users, searchTerm, accountTypeFilter]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await apiFetch('/admin/users');
      setUsers(data.users || []);
    } catch (err) {
      console.error('Failed to fetch users:', err);
      setMessage('Failed to load users');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  const filterUsers = () => {
    let filtered = [...users];

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (u) =>
          (u.name && u.name.toLowerCase().includes(term)) ||
          (u.email && u.email.toLowerCase().includes(term))
      );
    }

    // Account type filter
    if (accountTypeFilter !== 'all') {
      filtered = filtered.filter((u) => u.accountType === accountTypeFilter);
    }

    setFilteredUsers(filtered);
    setCurrentPage(1);
  };

  const handleDelete = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      await apiFetch(`/admin/users/${userId}/suspend`, { method: 'POST' });
      setMessage('✅ User deleted successfully');
      fetchUsers();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error('Failed to delete user:', err);
      setMessage('❌ Failed to delete user');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  // Pagination
  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
  const startIdx = (currentPage - 1) * usersPerPage;
  const endIdx = startIdx + usersPerPage;
  const paginatedUsers = filteredUsers.slice(startIdx, endIdx);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <button
          onClick={() => navigate('/admin')}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">User Management</h1>
          <p className="text-slate-600 mt-1">
            Total users: <span className="font-semibold text-slate-900">{users.length}</span>
          </p>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className="p-4 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
          {message}
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white rounded-lg border border-slate-200 p-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Account Type Filter */}
        <select
          value={accountTypeFilter}
          onChange={(e) => setAccountTypeFilter(e.target.value)}
          className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Account Types</option>
          <option value="Starter">Starter</option>
          <option value="Pro">Pro</option>
          <option value="Enterprise">Enterprise</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-600">
            <p>Loading users...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-8 text-center text-slate-600">
            <p>No users found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">
                      User ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">
                      Phone
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">
                      Account Type
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-slate-600">
                      Agents
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-slate-600">
                      Contacts
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-slate-600">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {paginatedUsers.map((user) => (
                    <tr key={user._id} className="hover:bg-slate-50">
                      <td className="px-6 py-3 text-sm text-slate-600 font-mono">
                        {user._id.slice(0, 8)}...
                      </td>
                      <td className="px-6 py-3 text-sm font-medium text-slate-900">
                        {user.name || 'N/A'}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-600">
                        {user.email}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-600">
                        {user.phone || 'N/A'}
                      </td>
                      <td className="px-6 py-3 text-sm">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            user.accountType === 'Starter'
                              ? 'bg-blue-100 text-blue-800'
                              : user.accountType === 'Pro'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-purple-100 text-purple-800'
                          }`}
                        >
                          {user.accountType || 'Starter'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-center text-sm text-slate-700 font-medium">
                        {user.stats?.agents ?? 0}
                      </td>
                      <td className="px-6 py-3 text-center text-sm text-slate-700 font-medium">
                        {user.stats?.contacts ?? 0}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            onClick={() => navigate(`/admin/users/${user._id}`)}
                            className="p-2 hover:bg-blue-50 rounded text-blue-600 transition-colors"
                            title="View details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(user._id)}
                            className="p-2 hover:bg-red-50 rounded text-red-600 transition-colors"
                            title="Delete user"
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
                  Page {currentPage} of {totalPages} ({filteredUsers.length} total)
                </p>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="p-2 hover:bg-white disabled:opacity-50 rounded border border-slate-300"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
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

export default UserManagementList;
