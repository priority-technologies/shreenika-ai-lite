
import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Users, PhoneCall, CalendarCheck, TrendingUp, Phone, CreditCard, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { CallLog } from '../types';
import { getAgents, getBillingStatus, getCurrentUsage, getVoipNumbers, getCalls } from '../services/api';

interface DashboardProps {
  logs: CallLog[];
  leadCount: number;
}

interface DashboardData {
  agentCount: number;
  totalCalls: number;
  meetingsBooked: number;
  leadCount: number;
  voipNumberCount: number;
  currentPlan: string;
  voiceMinutesUsed: number;
  agentLimit: number;
}

const Dashboard: React.FC<DashboardProps> = ({ logs, leadCount }) => {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [callLogs, setCallLogs] = useState<CallLog[]>(logs);

  // Load dashboard data on mount
  useEffect(() => {
    loadDashboardData();
  }, []);

  // Update callLogs when props change
  useEffect(() => {
    setCallLogs(logs);
  }, [logs]);

  const loadDashboardData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch all data in parallel
      const [agentsResponse, usageResponse, voipResponse, callsResponse] = await Promise.all([
        getAgents().catch(() => ({ agents: [] })),
        getCurrentUsage().catch(() => ({ agentCount: 0, voiceMinutes: 0, limits: { agents: 1 }, plan: 'Starter' })),
        getVoipNumbers().catch(() => ({ numbers: [] })),
        getCalls().catch(() => [])
      ]);

      // Extract data
      const agents = agentsResponse.agents || agentsResponse || [];
      const voipNumbers = voipResponse.numbers || [];
      const calls = callsResponse || [];

      // Calculate meetings booked (calls with positive outcome)
      const meetingsBooked = calls.filter((call: any) =>
        call.summary?.toLowerCase().includes('scheduled') ||
        call.summary?.toLowerCase().includes('book') ||
        call.sentiment === 'Positive' ||
        call.outcome === 'meeting_booked'
      ).length;

      // Update call logs for charts
      if (calls.length > 0) {
        setCallLogs(calls);
      }

      setDashboardData({
        agentCount: Array.isArray(agents) ? agents.length : usageResponse.agentCount || 0,
        totalCalls: calls.length || logs.length,
        meetingsBooked: meetingsBooked || logs.filter(l => l.sentiment === 'Positive').length,
        leadCount: leadCount,
        voipNumberCount: voipNumbers.length,
        currentPlan: usageResponse.plan || 'Starter',
        voiceMinutesUsed: usageResponse.voiceMinutes || 0,
        agentLimit: usageResponse.limits?.agents || 1
      });

    } catch (err: any) {
      console.error('Failed to load dashboard data:', err);
      setError(err.message || 'Failed to load dashboard data');

      // Set fallback data from props
      setDashboardData({
        agentCount: 0,
        totalCalls: logs.length,
        meetingsBooked: logs.filter(l => l.sentiment === 'Positive').length,
        leadCount: leadCount,
        voipNumberCount: 0,
        currentPlan: 'Starter',
        voiceMinutesUsed: 0,
        agentLimit: 1
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Generate chart data for the last 7 days
  const getWeeklyChartData = (logs: CallLog[]) => {
    const weekData: { [key: string]: { name: string, calls: number, meetings: number } } = {};
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date();

    // Initialize last 7 days
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(today.getDate() - i);
        const dayKey = d.toISOString().split('T')[0];
        const dayName = dayLabels[d.getDay()];
        weekData[dayKey] = { name: dayName, calls: 0, meetings: 0 };
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    logs.forEach(log => {
        const logDate = new Date(log.startedAt);
        if(logDate >= sevenDaysAgo) {
          const dayKey = logDate.toISOString().split('T')[0];

          if (weekData[dayKey]) {
              weekData[dayKey].calls += 1;
              if (log.summary?.toLowerCase().includes('scheduled') || log.summary?.toLowerCase().includes('book a meeting') || log.sentiment === 'Positive') {
                  weekData[dayKey].meetings += 1;
              }
          }
        }
    });

    return Object.values(weekData);
  };

  const chartData = getWeeklyChartData(callLogs);

  // Stats configuration
  const stats = [
    {
      name: 'Active Agents',
      value: dashboardData ? `${dashboardData.agentCount}/${dashboardData.agentLimit}` : '0/1',
      icon: Users,
      color: 'bg-blue-500',
      subtitle: dashboardData?.currentPlan ? `${dashboardData.currentPlan} Plan` : 'Starter Plan'
    },
    {
      name: 'Total Calls',
      value: dashboardData?.totalCalls.toString() || '0',
      icon: PhoneCall,
      color: 'bg-indigo-500',
      subtitle: `${dashboardData?.voiceMinutesUsed || 0} mins used`
    },
    {
      name: 'Meetings Booked',
      value: dashboardData?.meetingsBooked.toString() || '0',
      icon: CalendarCheck,
      color: 'bg-emerald-500',
      subtitle: 'From calls'
    },
    {
      name: 'Total Leads',
      value: dashboardData?.leadCount.toString() || leadCount.toString(),
      icon: TrendingUp,
      color: 'bg-amber-500',
      subtitle: 'In database'
    },
  ];

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500">Welcome back, here's what's happening today.</p>
        </div>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <span className="ml-3 text-slate-600">Loading dashboard data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500">Welcome back, here's what's happening today.</p>
        </div>
        <button
          onClick={loadDashboardData}
          className="flex items-center px-3 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
          <div>
            <p className="text-sm text-yellow-800">Some data couldn't be loaded. Showing available data.</p>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.name} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">{stat.name}</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{stat.value}</p>
                <p className="text-xs text-slate-400 mt-1">{stat.subtitle}</p>
              </div>
              <div className={`p-3 rounded-lg ${stat.color} bg-opacity-10`}>
                <stat.icon className={`w-6 h-6 ${stat.color.replace('bg-', 'text-')}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Stats Row */}
      {dashboardData && dashboardData.voipNumberCount > 0 && (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-green-50 rounded-lg">
                <Phone className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">VOIP Numbers Connected</p>
                <p className="text-xs text-slate-500">{dashboardData.voipNumberCount} phone number(s) active</p>
              </div>
            </div>
            <span className="text-lg font-bold text-green-600">{dashboardData.voipNumberCount}</span>
          </div>
        </div>
      )}

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Call Volume Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Weekly Call Volume</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                <Tooltip
                  cursor={{fill: '#f1f5f9'}}
                  contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                />
                <Bar dataKey="calls" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={32} name="Calls" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Lead Qualification Trend */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Meetings Booked Trend</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                <Tooltip
                  contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                />
                <Line type="monotone" dataKey="meetings" stroke="#10b981" strokeWidth={3} dot={{r: 4, fill: '#10b981'}} activeDot={{r: 6}} name="Meetings" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Quick Overview</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-50 rounded-lg p-4">
            <div className="flex items-center space-x-3 mb-2">
              <CreditCard className="w-5 h-5 text-blue-600" />
              <span className="font-medium text-slate-900">Current Plan</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{dashboardData?.currentPlan || 'Starter'}</p>
            <p className="text-xs text-slate-500 mt-1">
              {dashboardData?.agentCount || 0} of {dashboardData?.agentLimit || 1} agents used
            </p>
          </div>

          <div className="bg-slate-50 rounded-lg p-4">
            <div className="flex items-center space-x-3 mb-2">
              <PhoneCall className="w-5 h-5 text-indigo-600" />
              <span className="font-medium text-slate-900">Voice Usage</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{dashboardData?.voiceMinutesUsed || 0} mins</p>
            <p className="text-xs text-slate-500 mt-1">This month</p>
          </div>

          <div className="bg-slate-50 rounded-lg p-4">
            <div className="flex items-center space-x-3 mb-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              <span className="font-medium text-slate-900">Conversion Rate</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">
              {dashboardData && dashboardData.totalCalls > 0
                ? `${Math.round((dashboardData.meetingsBooked / dashboardData.totalCalls) * 100)}%`
                : '0%'
              }
            </p>
            <p className="text-xs text-slate-500 mt-1">Calls to meetings</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
