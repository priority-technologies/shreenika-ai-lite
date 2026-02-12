import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface UserManagementListProps {
  navigate: (path: string) => void;
}

const UserManagementList: React.FC<UserManagementListProps> = ({ navigate }) => {
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
          <p className="text-slate-600 mt-1">Manage all users and their accounts</p>
        </div>
      </div>

      {/* Placeholder Content */}
      <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
        <p className="text-slate-600">User management list coming soon...</p>
      </div>
    </div>
  );
};

export default UserManagementList;
