import React from 'react';
import { ArrowLeft, Clock } from 'lucide-react';

interface ComingSoonPageProps {
  navigate: (path: string) => void;
  title: string;
  description: string;
}

const ComingSoonPage: React.FC<ComingSoonPageProps> = ({
  navigate,
  title,
  description,
}) => {
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
          <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
        </div>
      </div>

      {/* Coming Soon Banner */}
      <div className="flex flex-col items-center justify-center h-96 bg-white rounded-lg border border-slate-200 space-y-4">
        <div className="p-4 bg-amber-50 rounded-full">
          <Clock className="w-8 h-8 text-amber-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Coming Soon</h2>
        <p className="text-slate-600 text-center max-w-md">{description}</p>
      </div>
    </div>
  );
};

export default ComingSoonPage;
