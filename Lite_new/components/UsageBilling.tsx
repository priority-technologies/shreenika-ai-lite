
import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import {
  CreditCard,
  X,
  CheckCircle2,
  Loader2,
  Lock,
  Package,
  Check,
  Shield,
  FileText,
  AlertCircle,
  Zap,
  TrendingUp
} from 'lucide-react';
import { Subscription, Usage, Invoice } from '../types';
import {
  getBillingStatus,
  getCurrentUsage,
  getInvoices,
  updatePlan,
  createRechargeIntent,
  getAgents,
} from '../services/api';

// ── Plan definitions — must match backend subscription.model.js ──────────────
const PLAN_CONFIG: Record<string, {
  monthlyPrice: number;
  yearlyPrice: number;
  setupFee: number;
  includedMinutes: number;
  agentLimit: number;
  docLimit: number;
  rechargeRate: number | null;
  features: string[];
}> = {
  Starter: {
    monthlyPrice: 2499,
    yearlyPrice: 1999,
    setupFee: 0,
    includedMinutes: 400,
    agentLimit: 1,
    docLimit: 0,
    rechargeRate: null,
    features: ['1 AI Agent', 'No Knowledge Base', '400 minutes/month', 'Standard Support'],
  },
  Pro: {
    monthlyPrice: 7999,
    yearlyPrice: 6399,
    setupFee: 4999,
    includedMinutes: 1500,
    agentLimit: 5,
    docLimit: 25,
    rechargeRate: 5.50,
    features: ['5 AI Agents', '25 Documents', 'Knowledge Base', '1,500 minutes/month', 'Priority Support', 'Minute Recharge'],
  },
  Enterprise: {
    monthlyPrice: 19999,
    yearlyPrice: 15999,
    setupFee: 14999,
    includedMinutes: 5000,
    agentLimit: 99,
    docLimit: 990,
    rechargeRate: 3.99,
    features: ['99 AI Agents', '990 Documents', 'Advanced Knowledge Base', '5,000 minutes/month', 'Dedicated Account Manager', 'SLA'],
  },
};

const UsageBilling: React.FC = () => {
  // Modal states
  const [showPaymentModal, setShowPaymentModal]         = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal]         = useState(false);
  const [showRechargeModal, setShowRechargeModal]       = useState(false);
  const [isProcessing, setIsProcessing]                 = useState(false);
  const [paymentSuccess, setPaymentSuccess]             = useState(false);

  // Real data states
  const [subscription, setSubscription] = useState<any>(null);
  const [usage, setUsage]               = useState<any>(null);
  const [invoices, setInvoices]         = useState<any[]>([]);
  const [agentCount, setAgentCount]     = useState<number>(0);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  // Plan selection for subscription modal
  const [selectedPlan, setSelectedPlan] = useState<'Starter' | 'Pro' | 'Enterprise'>('Starter');

  // Recharge
  const [rechargeMinutes, setRechargeMinutes]     = useState<number>(100);
  const [rechargeMessage, setRechargeMessage]     = useState<string | null>(null);

  // Load all billing data on mount
  useEffect(() => {
    loadBillingData();
  }, []);

  const loadBillingData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [subData, usageData, invoiceData, agentsData] = await Promise.all([
        getBillingStatus(),
        getCurrentUsage(),
        getInvoices(),
        getAgents(),
      ]);

      setSubscription(subData);
      setUsage(usageData);
      setInvoices(invoiceData?.invoices || []);

      // Count agents from the agents list
      const agentsList = Array.isArray(agentsData) ? agentsData : (agentsData?.agents || []);
      setAgentCount(agentsList.length);

      if (subData?.plan) setSelectedPlan(subData.plan);
    } catch (err: any) {
      console.error('Failed to load billing data:', err);
      setError(err.message || 'Failed to load billing data');
    } finally {
      setLoading(false);
    }
  };

  // Format "YYYY-MM" → "March 2026"
  const formatMonth = (monthStr: string) => {
    if (!monthStr) return '—';
    const [year, month] = monthStr.split('-');
    const d = new Date(parseInt(year), parseInt(month) - 1);
    return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  };

  // ── Chart data from usage.monthlyBreakdown (MinuteLedger aggregation) ──────
  const getChartData = () => {
    if (!usage?.monthlyBreakdown || usage.monthlyBreakdown.length === 0) return [];
    return [...usage.monthlyBreakdown]
      .sort((a: any, b: any) => a._id.localeCompare(b._id))
      .slice(-6)
      .map((entry: any) => ({
        name:          formatMonth(entry._id),
        'Gemini Min':  entry.geminiMinutes || 0,
        'Cache Min':   entry.cacheMinutes  || 0,
      }));
  };

  // ── Minutes balance progress ──────────────────────────────────────────────
  const minutesBalance  = subscription?.minutesBalance  || 0;
  const minutesIncluded = subscription?.minutesIncluded || PLAN_CONFIG[subscription?.plan || 'Starter']?.includedMinutes || 0;
  const minutesUsed     = usage?.minutesUsed            || 0;
  const minutesPct      = minutesIncluded > 0 ? Math.min(100, Math.round((minutesBalance / minutesIncluded) * 100)) : 0;

  // ── Plan upgrade flow ─────────────────────────────────────────────────────
  const handleUpdateSubscription = async () => {
    setIsProcessing(true);
    try {
      if (subscription && selectedPlan !== subscription.plan) {
        const response = await updatePlan(selectedPlan);
        if (response.requiresPayment && response.checkoutUrl) {
          window.location.href = response.checkoutUrl;
          return;
        }
        if (response.requiresContact) {
          setIsProcessing(false);
          alert(`${response.message}\n\nPlease contact: ${response.contactEmail}`);
          return;
        }
      }
      await loadBillingData();
      setIsProcessing(false);
      setShowSubscriptionModal(false);
    } catch (err: any) {
      setIsProcessing(false);
      alert('Update failed: ' + (err.message || 'Unknown error'));
    }
  };

  // ── Minute recharge flow ─────────────────────────────────────────────────
  const handleRecharge = async () => {
    if (rechargeMinutes < 100) {
      alert('Minimum recharge is 100 minutes.');
      return;
    }
    setIsProcessing(true);
    setRechargeMessage(null);
    try {
      const result = await createRechargeIntent(rechargeMinutes);
      // result contains { clientSecret, amountINR, minutes, ratePerMin }
      // Stripe.js Elements is needed to confirm the PaymentIntent.
      // For now, show the amount and instruct developer to wire Stripe Elements.
      if (result?.clientSecret) {
        setRechargeMessage(
          `Payment intent created for ₹${result.amountINR} (${result.minutes} minutes). ` +
          `Please integrate Stripe.js Elements with clientSecret to complete payment.`
        );
      } else {
        setRechargeMessage(result?.message || 'Recharge initiated. Check your Stripe dashboard.');
      }
      await loadBillingData();
    } catch (err: any) {
      alert('Recharge failed: ' + (err.message || 'Unknown error'));
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Subscription modal total ──────────────────────────────────────────────
  const calculateSubscriptionTotal = () => {
    return PLAN_CONFIG[selectedPlan]?.setupFee || 0;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <p className="text-slate-700 font-medium mb-2">Failed to load billing data</p>
        <p className="text-slate-500 text-sm mb-4">{error}</p>
        <button onClick={loadBillingData} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          Retry
        </button>
      </div>
    );
  }

  const planConfig      = PLAN_CONFIG[subscription?.plan || 'Starter'];
  const rechargeAllowed = subscription?.rechargeAllowed;
  const rechargeRate    = subscription?.rechargeRatePerMin;
  const chartData       = getChartData();
  const lastInvoice     = invoices.length > 0 ? invoices[0] : null;
  const agentLimit      = subscription?.effectiveLimits?.agents || planConfig?.agentLimit || 1;
  const docLimit        = subscription?.effectiveLimits?.docs    || planConfig?.docLimit   || 0;

  return (
    <div className="space-y-6 animate-fadeIn">

      {/* ── Header ── */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Usage & Billing</h1>
          <p className="text-slate-500">Monitor your consumption and manage your plan.</p>
        </div>
        <button
          onClick={() => setShowInvoiceModal(true)}
          className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-white bg-slate-50"
        >
          View Invoices
        </button>
      </div>

      {/* ── TOP SUMMARY CARDS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Cost Summary */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 lg:col-span-2">
          <div className="flex items-center space-x-2 mb-6">
            <h2 className="text-lg font-bold text-slate-900">Cost Summary</h2>
            <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded">This Cycle</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Minutes Used */}
            <div>
              <p className="text-sm font-medium text-slate-600 mb-1">Minutes Used (This Cycle)</p>
              <h3 className="text-3xl font-bold text-blue-600 mb-2">{minutesUsed.toFixed(2)}</h3>
              <p className="text-xs text-slate-500">{(usage?.cacheMinutesUsed || 0).toFixed(2)} from cache (discounted)</p>
            </div>

            {/* Last Invoice Total */}
            <div className="border-l border-slate-100 pl-6 md:pl-8">
              <p className="text-sm font-medium text-slate-600 mb-1">Last Invoice Total</p>
              <h3 className="text-2xl font-bold text-blue-500 mb-2">
                ₹{lastInvoice ? (lastInvoice.total || 0).toFixed(2) : '0.00'}
              </h3>
              <p className="text-xs text-slate-400">
                {lastInvoice ? formatMonth(lastInvoice.month) : 'No invoices yet'}
              </p>
            </div>

            {/* Agent Usage */}
            <div className="pt-4 md:pt-0">
              <p className="text-sm font-medium text-slate-600 mb-1">Agent Usage</p>
              <h3 className="text-3xl font-bold text-blue-600 mb-2">
                {agentCount} / {agentLimit}
              </h3>
              <p className="text-xs text-slate-500">Agents deployed</p>
            </div>

            {/* Document Usage */}
            <div className="border-l border-slate-100 pl-6 md:pl-8 pt-4 md:pt-0">
              <p className="text-sm font-medium text-slate-600 mb-1">Document Usage</p>
              <h3 className="text-2xl font-bold text-blue-500 mb-2">
                — / {docLimit === 0 ? 'N/A' : docLimit}
              </h3>
              <p className="text-xs text-slate-400">
                {docLimit === 0 ? 'Not available on Starter' : 'Documents uploaded'}
              </p>
            </div>
          </div>
        </div>

        {/* Current Plan + Minutes Balance */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col">
          <div className="flex items-center space-x-2 mb-4">
            <Package className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-900">Current Plan</h2>
          </div>

          <div className="flex-1 space-y-4">
            {/* Plan name + status */}
            <div className="flex justify-between items-center py-2 border-b border-slate-50">
              <div>
                <p className="text-sm font-bold text-slate-800">{subscription?.plan || 'Starter'} Plan</p>
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-slate-500">
                    ₹{planConfig?.monthlyPrice?.toLocaleString('en-IN')}/mo
                  </span>
                  <span className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded font-medium uppercase">
                    {subscription?.status || 'ACTIVE'}
                  </span>
                </div>
              </div>
              <div className="text-sm font-bold text-slate-900">
                {planConfig?.setupFee > 0 ? `₹${planConfig.setupFee.toLocaleString('en-IN')} setup` : 'Free setup'}
              </div>
            </div>

            {/* Minutes balance progress */}
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="flex justify-between text-xs text-slate-600 mb-1.5">
                <span className="font-semibold">Minutes Remaining</span>
                <span className="font-bold text-indigo-600">{minutesBalance.toFixed(0)} / {minutesIncluded}</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${minutesPct < 20 ? 'bg-red-500' : minutesPct < 50 ? 'bg-yellow-500' : 'bg-indigo-500'}`}
                  style={{ width: `${minutesPct}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">{minutesPct}% remaining this cycle</p>
            </div>

            {/* Recharge rate (Pro/Enterprise only) */}
            {rechargeAllowed && rechargeRate && (
              <div className="text-xs text-slate-600 bg-green-50 border border-green-100 rounded-lg p-2.5">
                <span className="font-semibold text-green-700">Recharge available:</span> ₹{rechargeRate}/min
              </div>
            )}

            {/* Plan limits */}
            <div className="text-xs text-slate-600 space-y-1">
              <div className="flex justify-between"><span>Agents</span><span className="font-medium">{agentLimit}</span></div>
              <div className="flex justify-between"><span>Documents</span><span className="font-medium">{docLimit || 'N/A'}</span></div>
              <div className="flex justify-between"><span>Included minutes</span><span className="font-medium">{planConfig?.includedMinutes?.toLocaleString()}</span></div>
            </div>
          </div>

          <div className="pt-4 mt-auto border-t border-slate-100 space-y-2">
            {/* Recharge button for Pro/Enterprise */}
            {rechargeAllowed && (
              <button
                onClick={() => setShowRechargeModal(true)}
                className="w-full text-xs font-bold text-green-700 hover:bg-green-50 py-2.5 rounded border border-green-200 hover:border-green-300 transition-colors flex items-center justify-center"
              >
                <Zap className="w-3.5 h-3.5 mr-1.5" />
                Buy More Minutes
              </button>
            )}
            <button
              onClick={() => setShowSubscriptionModal(true)}
              className="w-full text-xs font-bold text-blue-600 hover:bg-blue-50 py-2.5 rounded border border-blue-200 hover:border-blue-300 transition-colors"
            >
              Manage Plan
            </button>
          </div>
        </div>
      </div>

      {/* ── CHART + CURRENT USAGE ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Minutes Breakdown Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 lg:col-span-2">
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-bold text-slate-900">Minutes Breakdown</h2>
              <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded">Last 6 months</span>
            </div>
            <div className="flex items-center space-x-3 text-xs text-slate-500">
              <span className="flex items-center"><span className="w-3 h-3 rounded-full bg-violet-500 inline-block mr-1"></span>Gemini</span>
              <span className="flex items-center"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block mr-1"></span>Cache</span>
            </div>
          </div>

          {chartData.length > 0 ? (
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(v: number) => `${v}m`} />
                  <Tooltip
                    formatter={(value: number, name: string) => [`${value} min`, name]}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    cursor={{ fill: '#f8fafc' }}
                  />
                  <Bar dataKey="Gemini Min" stackId="a" fill="#8b5cf6" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Cache Min"  stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[350px] flex items-center justify-center text-slate-500">
              <div className="text-center">
                <TrendingUp className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                <p>No usage data yet</p>
                <p className="text-sm">Start making calls to see minute breakdown</p>
              </div>
            </div>
          )}
        </div>

        {/* Current Usage + Recent Invoices */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <h2 className="text-lg font-bold text-slate-900">Current Usage</h2>
              <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded">Live</span>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-center mb-5">
              <p className="text-sm font-medium text-slate-500 mb-1">Minutes Used (This Cycle)</p>
              <h3 className="text-4xl font-bold text-slate-900">{minutesUsed.toFixed(1)}</h3>
              <p className="text-xs text-slate-500 mt-1 font-medium">
                {(usage?.cacheMinutesUsed || 0).toFixed(1)} min served from cache
              </p>
            </div>

            <div className="space-y-2">
              {invoices.slice(0, 3).map((invoice: any) => (
                <div key={invoice._id} className="flex justify-between text-sm text-slate-600 border-b border-slate-100 pb-2">
                  <span className="truncate">{formatMonth(invoice.month)}</span>
                  <span className="text-slate-900 font-medium">₹{(invoice.total || 0).toFixed(2)}</span>
                </div>
              ))}
              {invoices.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">No invoices yet</p>
              )}
            </div>
          </div>

          <button
            onClick={() => setShowInvoiceModal(true)}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg transition-colors mt-5 flex items-center justify-center shadow-lg shadow-indigo-100"
          >
            <FileText className="w-5 h-5 mr-2" />
            View All Invoices
          </button>
        </div>
      </div>

      {/* ── RECHARGE MODAL ── */}
      {showRechargeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-slate-900 px-6 py-4 flex justify-between items-center text-white">
              <h3 className="font-bold text-lg flex items-center">
                <Zap className="w-4 h-4 mr-2 text-yellow-400" />
                Buy More Minutes
              </h3>
              <button onClick={() => { setShowRechargeModal(false); setRechargeMessage(null); }} className="text-slate-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                <span className="font-semibold">{subscription?.plan} rate:</span> ₹{rechargeRate}/min &nbsp;|&nbsp; Minimum: 100 minutes
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Number of Minutes</label>
                <input
                  type="number"
                  min={100}
                  step={100}
                  value={rechargeMinutes}
                  onChange={e => setRechargeMinutes(parseInt(e.target.value) || 100)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div className="flex justify-between items-center bg-slate-50 rounded-lg p-4">
                <span className="text-sm text-slate-600">Total Amount</span>
                <span className="text-2xl font-bold text-slate-900">
                  ₹{((rechargeMinutes || 0) * (rechargeRate || 0)).toFixed(2)}
                </span>
              </div>

              {rechargeMessage && (
                <div className="text-xs text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                  {rechargeMessage}
                </div>
              )}

              <button
                onClick={handleRecharge}
                disabled={isProcessing || rechargeMinutes < 100}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center disabled:opacity-70"
              >
                {isProcessing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</> : 'Proceed to Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── INVOICE HISTORY MODAL ── */}
      {showInvoiceModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4"
          onClick={() => setShowInvoiceModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[80vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-bold text-lg text-slate-900 flex items-center">
                <FileText className="w-5 h-5 mr-3 text-slate-500" />
                Invoice History
              </h3>
              <button onClick={() => setShowInvoiceModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {invoices.length > 0 ? (
                <table className="min-w-full divide-y divide-slate-100">
                  <thead className="bg-white sticky top-0 z-10">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Month</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Plan</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Gemini Min</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Cache Min</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Subtotal</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">GST (18%)</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {invoices.map((invoice: any) => (
                      <tr key={invoice._id} className="hover:bg-slate-50">
                        <td className="px-6 py-4">
                          <div className="text-sm font-bold text-slate-900">{formatMonth(invoice.month)}</div>
                          <div className="text-xs text-slate-500">
                            {invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString('en-IN') : '—'}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-700">{invoice.plan || '—'}</td>
                        <td className="px-6 py-4 text-sm text-slate-700">
                          {invoice.usageBreakdown?.geminiMinutes ?? '—'} min
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-700">
                          {invoice.usageBreakdown?.cacheMinutes ?? '—'} min
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-700">₹{(invoice.subtotal || 0).toFixed(2)}</td>
                        <td className="px-6 py-4 text-sm text-slate-700">₹{(invoice.gst || 0).toFixed(2)}</td>
                        <td className="px-6 py-4 text-sm font-bold text-slate-900">₹{(invoice.total || 0).toFixed(2)}</td>
                        <td className="px-6 py-4">
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                            invoice.status === 'paid' ? 'bg-green-100 text-green-700' :
                            invoice.status === 'failed' ? 'bg-red-100 text-red-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {(invoice.status || 'draft').toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="flex flex-col items-center justify-center py-12">
                  <FileText className="w-16 h-16 text-slate-300 mb-4" />
                  <p className="text-slate-600 font-medium">No invoices yet</p>
                  <p className="text-slate-400 text-sm mt-1">Invoices are generated after each billing cycle</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── SUBSCRIPTION MANAGEMENT MODAL ── */}
      {showSubscriptionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full overflow-hidden h-[90vh] flex flex-col">
            <div className="bg-white px-8 py-6 border-b border-slate-200 flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Manage Plan</h2>
                <p className="text-slate-500">Choose the plan that fits your business needs.</p>
              </div>
              <button onClick={() => setShowSubscriptionModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 bg-slate-50">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {Object.entries(PLAN_CONFIG).map(([planId, config]) => (
                  <div
                    key={planId}
                    onClick={() => setSelectedPlan(planId as 'Starter' | 'Pro' | 'Enterprise')}
                    className={`relative rounded-2xl p-6 cursor-pointer transition-all ${
                      selectedPlan === planId
                        ? 'bg-white border-2 border-blue-600 shadow-xl scale-105 z-10'
                        : 'bg-white border border-slate-200 hover:border-blue-300 opacity-80 hover:opacity-100'
                    }`}
                  >
                    {selectedPlan === planId && (
                      <div className="absolute top-0 right-0 transform translate-x-2 -translate-y-2">
                        <div className="bg-blue-600 text-white rounded-full p-1 shadow-md">
                          <Check className="w-4 h-4" />
                        </div>
                      </div>
                    )}
                    <h3 className="text-lg font-bold text-slate-900 mb-1">{planId}</h3>
                    <div className="mb-1">
                      <span className="text-2xl font-bold text-slate-900">₹{config.monthlyPrice.toLocaleString('en-IN')}</span>
                      <span className="text-slate-500 text-sm ml-1">/mo</span>
                    </div>
                    {config.setupFee > 0 && (
                      <p className="text-xs text-orange-600 font-medium mb-4">+ ₹{config.setupFee.toLocaleString('en-IN')} one-time setup</p>
                    )}
                    <ul className="space-y-2 mt-4">
                      {config.features.map((feat, i) => (
                        <li key={i} className="flex items-center text-sm text-slate-600">
                          <CheckCircle2 className="w-4 h-4 text-green-500 mr-2 shrink-0" />
                          {feat}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="bg-white border-t border-slate-200 p-6 flex justify-between items-center shrink-0">
              <div>
                <p className="text-sm font-medium text-slate-500">
                  {PLAN_CONFIG[selectedPlan]?.setupFee > 0 ? 'One-time Activation Fee' : 'No Activation Fee'}
                </p>
                <p className="text-3xl font-bold text-slate-900">
                  {PLAN_CONFIG[selectedPlan]?.setupFee > 0
                    ? `₹${PLAN_CONFIG[selectedPlan].setupFee.toLocaleString('en-IN')}`
                    : '₹0'}
                </p>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowSubscriptionModal(false)}
                  className="px-6 py-3 border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateSubscription}
                  disabled={isProcessing || (selectedPlan === subscription?.plan && minutesBalance > 0)}
                  className="px-8 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 flex items-center disabled:opacity-70"
                >
                  {isProcessing
                    ? <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    : <Shield className="w-5 h-5 mr-2" />
                  }
                  {selectedPlan === subscription?.plan && minutesBalance > 0
                    ? 'Already Active'
                    : selectedPlan === subscription?.plan && minutesBalance === 0
                    ? 'Activate & Pay via Stripe'
                    : 'Confirm & Pay via Stripe'
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsageBilling;
