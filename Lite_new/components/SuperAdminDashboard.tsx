import React, { useState, useEffect } from 'react';
import { Users, FileText, TrendingUp, Phone, Bot, Loader2 } from 'lucide-react';
import { apiFetch } from '../services/api';

interface DashboardStats {
  totalUsers: number;
  totalContacts: number;
  totalCalls: number;
  totalAgents: number;
  planBreakdown: Record<string, number>;
}

interface SuperAdminDashboardProps {
  navigate: (path: string) => void;
}

const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({ navigate }) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const data = await apiFetch('/admin/dashboard/stats');
        setStats(data);
      } catch (err) {
        console.error('Failed to fetch dashboard stats:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const statCards = [
    { label: 'Total Users', value: stats?.totalUsers ?? 0, icon: Users, color: 'blue' },
    { label: 'Total Agents', value: stats?.totalAgents ?? 0, icon: Bot, color: 'green' },
    { label: 'Total Contacts', value: stats?.totalContacts ?? 0, icon: Phone, color: 'indigo' },
    { label: 'Total Calls', value: stats?.totalCalls ?? 0, icon: TrendingUp, color: 'purple' },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Super Admin Dashboard</h1>
        <p className="text-slate-600 mt-1">Welcome to the Super Admin control panel</p>
      </div>

      {/* Stats Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((stat) => (
            <div
              key={stat.label}
              className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">{stat.label}</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</p>
                </div>
                <div className={`p-3 rounded-lg bg-${stat.color}-50`}>
                  <stat.icon className={`w-6 h-6 text-${stat.color}-600`} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Plan Breakdown */}
      {stats?.planBreakdown && Object.keys(stats.planBreakdown).length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Plan Distribution</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {['Starter', 'Pro', 'Enterprise'].map((plan) => (
              <div
                key={plan}
                className={`p-4 rounded-lg border ${
                  plan === 'Starter' ? 'border-blue-200 bg-blue-50' :
                  plan === 'Pro' ? 'border-green-200 bg-green-50' :
                  'border-purple-200 bg-purple-50'
                }`}
              >
                <p className="text-sm font-medium text-slate-600">{plan}</p>
                <p className="text-xl font-bold text-slate-900">
                  {stats.planBreakdown[plan] || 0} users
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => navigate('/admin/users')}
            className="p-4 border border-slate-200 rounded-lg hover:bg-blue-50 transition-colors text-left"
          >
            <h3 className="font-semibold text-slate-900">User Management</h3>
            <p className="text-sm text-slate-600 mt-1">Manage users and their accounts</p>
          </button>
          <button
            onClick={() => navigate('/admin/cms/privacy')}
            className="p-4 border border-slate-200 rounded-lg hover:bg-purple-50 transition-colors text-left"
          >
            <h3 className="font-semibold text-slate-900">CMS Pages</h3>
            <p className="text-sm text-slate-600 mt-1">Update privacy, terms, and FAQs</p>
          </button>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminDashboard;
