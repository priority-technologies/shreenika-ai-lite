import React from 'react';
import { Users, FileText, TrendingUp } from 'lucide-react';

interface SuperAdminDashboardProps {
  navigate: (path: string) => void;
}

const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({ navigate }) => {
  const stats = [
    { label: 'Total Users', value: '0', icon: Users, color: 'blue' },
    { label: 'Active Campaigns', value: '0', icon: TrendingUp, color: 'green' },
    { label: 'CMS Pages', value: '2', icon: FileText, color: 'purple' },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Super Admin Dashboard</h1>
        <p className="text-slate-600 mt-1">Welcome to the Super Admin control panel</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat) => (
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
