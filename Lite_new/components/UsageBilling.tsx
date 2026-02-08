
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
  Smartphone,
  Landmark,
  Globe,
  CheckCircle2,
  Loader2,
  Lock,
  ArrowUpRight,
  Package,
  Check,
  Zap,
  Shield,
  HardDrive,
  Download,
  FileText,
  AlertCircle
} from 'lucide-react';
import { Subscription, Usage, Invoice } from '../types';
import { getBillingStatus, getCurrentUsage, getInvoices, updatePlan, purchaseAddOn } from '../services/api';

const UsageBilling: React.FC = () => {
  // Modal states
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'upi' | 'netbanking' | 'gateway'>('card');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // Real data states
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Temporary UI state for subscription management
  const [selectedPlan, setSelectedPlan] = useState<'Starter' | 'Pro' | 'Enterprise'>('Starter');
  const [selectedAddons, setSelectedAddons] = useState({ extraDocs: false, extraAgent: false });

  // Chart services configuration
  const services = [
    { key: 'llm', color: '#8b5cf6', label: 'AI Model (LLM)' },
    { key: 'stt', color: '#ec4899', label: 'Speech-to-Text' },
    { key: 'tts', color: '#10b981', label: 'Text-to-Speech' },
    { key: 'infrastructure', color: '#f59e0b', label: 'Infrastructure' },
  ];

  // Plan configuration (should match backend)
  const plans = [
     {
       id: 'Starter',
       activationFee: 0,
       features: ['1 AI Agent', '0 Documents', 'Pay-as-you-go calls', 'Standard Support']
     },
     {
       id: 'Pro',
       activationFee: 20,
       features: ['5 AI Agents', '25 Documents', 'Knowledge Base', 'Priority Support', 'Add-ons Available']
     },
     {
       id: 'Enterprise',
       activationFee: null,
       features: ['Unlimited Agents', 'Unlimited Documents', 'Advanced Training', 'Dedicated Account Manager', 'SLA']
     },
  ];

  // Load billing data on component mount
  useEffect(() => {
    loadBillingData();
  }, []);

  const loadBillingData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [subData, usageData, invoiceData] = await Promise.all([
        getBillingStatus(),
        getCurrentUsage(),
        getInvoices()
      ]);

      setSubscription(subData);
      setUsage(usageData);
      setInvoices(invoiceData);

      // Set initial selected plan
      if (subData?.plan) {
        setSelectedPlan(subData.plan);
      }
    } catch (err: any) {
      console.error('Failed to load billing data:', err);
      setError(err.message || 'Failed to load billing data');
    } finally {
      setLoading(false);
    }
  };

  // Calculate current month cost from usage
  const calculateCurrentMonthCost = () => {
    if (!usage) return 0;
    // Pricing: Outbound $0.015/min, Inbound $0.013/min
    // For simplicity, assuming all voice minutes are outbound
    return usage.voiceMinutes * 0.015;
  };

  // Calculate total for subscription modal
  const calculateSubscriptionTotal = () => {
    const plan = plans.find(p => p.id === selectedPlan);
    let total = plan?.activationFee || 0;

    if (selectedAddons.extraDocs && selectedPlan === 'Pro') {
      total += 1; // Extra documents: $1 for 10 docs
    }
    if (selectedAddons.extraAgent && selectedPlan === 'Pro') {
      total += 20; // Extra agent: $20
    }

    return total;
  };

  // Format month string (YYYY-MM) to readable format
  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // Prepare chart data from invoices
  const getChartData = () => {
    if (!invoices || invoices.length === 0) {
      return [];
    }

    return invoices
      .slice(0, 6)
      .reverse()
      .map(invoice => ({
        name: formatMonth(invoice.month),
        llm: invoice.breakdown.llm,
        stt: invoice.breakdown.stt,
        tts: invoice.breakdown.tts,
        infrastructure: invoice.breakdown.infrastructure
      }));
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);

    try {
      // TODO: Integrate with Stripe payment
      // For now, just simulate success
      await new Promise(resolve => setTimeout(resolve, 2000));

      setIsProcessing(false);
      setPaymentSuccess(true);

      // Reload data after payment
      await loadBillingData();

      // Reset after success
      setTimeout(() => {
        setPaymentSuccess(false);
        setShowPaymentModal(false);
      }, 3000);
    } catch (err: any) {
      console.error('Payment failed:', err);
      setIsProcessing(false);
      alert('Payment failed: ' + (err.message || 'Unknown error'));
    }
  };

  const handleUpdateSubscription = async () => {
    setIsProcessing(true);

    try {
      // Check if plan changed
      if (subscription && selectedPlan !== subscription.plan) {
        const response = await updatePlan(selectedPlan);

        // ✅ Handle Stripe payment redirect
        if (response.requiresPayment && response.checkoutUrl) {
          console.log('💳 Redirecting to Stripe checkout:', response.checkoutUrl);
          // Redirect to Stripe checkout
          window.location.href = response.checkoutUrl;
          return; // Don't close modal or show success message
        }

        // ✅ Handle Enterprise plan (requires contact)
        if (response.requiresContact) {
          setIsProcessing(false);
          alert(`${response.message}\n\nPlease contact: ${response.contactEmail}`);
          return;
        }
      }

      // Handle add-ons for Pro plan
      if (selectedPlan === 'Pro') {
        if (selectedAddons.extraDocs) {
          await purchaseAddOn('extra_documents', 1);
        }
        if (selectedAddons.extraAgent) {
          await purchaseAddOn('extra_agent', 1);
        }
      }

      // Reload data
      await loadBillingData();

      setIsProcessing(false);
      setShowSubscriptionModal(false);
      alert("Subscription updated successfully!");
    } catch (err: any) {
      console.error('Subscription update failed:', err);
      setIsProcessing(false);
      alert('Update failed: ' + (err.message || 'Unknown error'));
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <p className="text-slate-700 font-medium mb-2">Failed to load billing data</p>
        <p className="text-slate-500 text-sm mb-4">{error}</p>
        <button
          onClick={loadBillingData}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const currentMonthCost = calculateCurrentMonthCost();
  const lastMonthInvoice = invoices.length > 0 ? invoices[0] : null;
  const chartData = getChartData();

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex justify-between items-center">
         <div>
            <h1 className="text-2xl font-bold text-slate-900">Usage & Billing</h1>
            <p className="text-slate-500">Monitor your consumption and manage forecast budgets.</p>
         </div>
         <button
           onClick={() => setShowInvoiceModal(true)}
           className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-white bg-slate-50">
            View Invoice
         </button>
      </div>

      {/* --- TOP SUMMARY CARDS --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

         {/* Cost Summary Card */}
         <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 lg:col-span-2">
            <div className="flex items-center space-x-2 mb-6">
               <h2 className="text-lg font-bold text-slate-900">Cost summary</h2>
               <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded">Info</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               {/* Month-to-date */}
               <div>
                  <p className="text-sm font-medium text-slate-600 mb-1">Month-to-date cost</p>
                  <h3 className="text-3xl font-bold text-blue-600 mb-2">${currentMonthCost.toFixed(2)}</h3>
                  <div className="flex items-center text-xs text-slate-500">
                     <span className="font-medium text-slate-900">{usage?.voiceMinutes || 0} minutes used</span>
                  </div>
               </div>

               {/* Last month comparison */}
               <div className="border-l border-slate-100 pl-6 md:pl-8">
                  <p className="text-sm font-medium text-slate-600 mb-1">Last month's total cost</p>
                  <h3 className="text-2xl font-bold text-blue-500 mb-2">
                    ${lastMonthInvoice ? lastMonthInvoice.totalAmount.toFixed(2) : '0.00'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {lastMonthInvoice ? formatMonth(lastMonthInvoice.month) : 'No data'}
                  </p>
               </div>

               {/* Agent & Doc Usage */}
               <div className="pt-4 md:pt-0">
                  <p className="text-sm font-medium text-slate-600 mb-1">Agent Usage</p>
                  <h3 className="text-3xl font-bold text-blue-600 mb-2">
                    {usage?.agentCount || 0} / {usage?.limits.agents || 1}
                  </h3>
                  <div className="flex items-center text-xs text-slate-500">
                     <span className="font-medium text-slate-900">Agents deployed</span>
                  </div>
               </div>

               {/* Document Usage */}
               <div className="border-l border-slate-100 pl-6 md:pl-8 pt-4 md:pt-0">
                  <p className="text-sm font-medium text-slate-600 mb-1">Document Usage</p>
                  <h3 className="text-2xl font-bold text-blue-500 mb-2">
                    {usage?.docCount || 0} / {usage?.limits.docs || 0}
                  </h3>
                  <p className="text-xs text-slate-400">Documents uploaded</p>
               </div>
            </div>
         </div>

         {/* Services Enrolled */}
         <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col">
            <div className="flex items-center space-x-2 mb-4">
               <Package className="w-5 h-5 text-blue-600" />
               <h2 className="text-lg font-bold text-slate-900">Current Plan</h2>
            </div>

            <div className="flex-1 space-y-4">
               <div className="flex justify-between items-center py-2 border-b border-slate-50">
                   <div>
                       <p className="text-sm font-bold text-slate-800">{subscription?.plan || 'Starter'} Plan</p>
                       <div className="flex items-center space-x-2">
                         <span className="text-xs text-slate-500">Pay-as-you-go</span>
                         <span className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded font-medium">
                           {subscription?.status || 'ACTIVE'}
                         </span>
                       </div>
                   </div>
                   <div className="text-sm font-bold text-slate-900">
                     {subscription?.plan === 'Starter' ? '$0' : subscription?.plan === 'Pro' ? '$20' : 'Contact'}
                   </div>
               </div>

               <div className="bg-slate-50 rounded-lg p-3">
                 <p className="text-xs text-slate-600 mb-2">Plan Limits:</p>
                 <ul className="space-y-1 text-xs text-slate-700">
                   <li>• {usage?.limits.agents || 1} Agent(s)</li>
                   <li>• {usage?.limits.docs || 0} Documents</li>
                   <li>• $0.015/min outbound calls</li>
                   <li>• $0.013/min inbound calls</li>
                 </ul>
               </div>
            </div>

            <div className="pt-4 mt-auto border-t border-slate-100">
                <button
                    onClick={() => setShowSubscriptionModal(true)}
                    className="w-full text-xs font-bold text-blue-600 hover:bg-blue-50 py-2.5 rounded border border-blue-200 hover:border-blue-300 transition-colors"
                >
                    Manage Plan
                </button>
            </div>
         </div>
      </div>

      {/* --- CHART SECTION --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         {/* Chart */}
         <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 lg:col-span-2">
            <div className="flex justify-between items-start mb-6">
               <div className="flex items-center space-x-2">
                  <h2 className="text-lg font-bold text-slate-900">Cost breakdown</h2>
                  <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded">Info</span>
               </div>

               <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-slate-700">Last 6 months</span>
               </div>
            </div>

            {chartData.length > 0 ? (
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} tickFormatter={(val: number) => `$${val}`} />
                    <Tooltip
                      formatter={(value: number) => [`$${value.toFixed(2)}`, '']}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      cursor={{fill: '#f8fafc'}}
                    />
                    <Legend
                      iconType="circle"
                      wrapperStyle={{ paddingTop: '20px' }}
                    />
                    {services.map((service) => (
                      <Bar
                        key={service.key}
                        dataKey={service.key}
                        name={service.label}
                        stackId="a"
                        fill={service.color}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[400px] flex items-center justify-center text-slate-500">
                <div className="text-center">
                  <FileText className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                  <p>No invoice history yet</p>
                  <p className="text-sm">Start making calls to see cost breakdown</p>
                </div>
              </div>
            )}
         </div>

         {/* Payment Section */}
         <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 h-full flex flex-col justify-between">
               <div>
                  <div className="flex items-center space-x-2 mb-4">
                     <h2 className="text-lg font-bold text-slate-900">Current Usage</h2>
                     <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded">Live</span>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center mb-6">
                     <p className="text-sm font-medium text-slate-500 mb-2">This Month's Cost</p>
                     <h3 className="text-4xl font-bold text-slate-900">${currentMonthCost.toFixed(2)}</h3>
                     <p className="text-xs text-slate-500 mt-2 font-medium">
                       {usage?.voiceMinutes || 0} minutes used
                     </p>
                  </div>

                  <div className="space-y-3">
                     {invoices.slice(0, 2).map((invoice, idx) => (
                       <div key={invoice._id} className="flex justify-between text-sm text-slate-600 border-b border-slate-100 pb-2">
                          <span className="truncate">{formatMonth(invoice.month)}</span>
                          <span className="text-slate-900 font-medium">${invoice.totalAmount.toFixed(2)}</span>
                       </div>
                     ))}
                     {invoices.length === 0 && (
                       <p className="text-xs text-slate-400 text-center py-4">No invoices yet</p>
                     )}
                  </div>
               </div>

               <button
                  onClick={() => setShowInvoiceModal(true)}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg transition-colors mt-6 flex items-center justify-center shadow-lg shadow-indigo-100"
               >
                  <FileText className="w-5 h-5 mr-2" />
                  View All Invoices
               </button>
            </div>
         </div>
      </div>

      {/* --- PAYMENT MODAL --- */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-slate-900 px-6 py-4 flex justify-between items-center text-white">
              <h3 className="font-bold text-lg flex items-center">
                 <Lock className="w-4 h-4 mr-2 text-green-400" />
                 Secure Payment
              </h3>
              <button onClick={() => setShowPaymentModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>

            {paymentSuccess ? (
              <div className="p-12 text-center">
                 <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="w-10 h-10 text-green-600" />
                 </div>
                 <h3 className="text-xl font-bold text-slate-900 mb-2">Payment Successful!</h3>
                 <p className="text-slate-500">Transaction ID: TXN-{Math.random().toString(36).substr(2, 9).toUpperCase()}</p>
                 <p className="text-slate-500 mt-2 text-sm">Thank you for your payment.</p>
              </div>
            ) : (
              <div className="flex">
                <div className="w-1/3 bg-slate-50 border-r border-slate-200 p-2 space-y-1">
                   {[
                      { id: 'card', label: 'Credit/Debit Card', icon: CreditCard },
                      { id: 'upi', label: 'UPI / VPA', icon: Smartphone },
                      { id: 'netbanking', label: 'Net Banking', icon: Landmark },
                      { id: 'gateway', label: 'Payment Gateway', icon: Globe },
                   ].map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setPaymentMethod(m.id as any)}
                        className={`w-full text-left px-4 py-3 rounded-lg text-xs font-medium flex items-center space-x-3 transition-colors ${
                           paymentMethod === m.id ? 'bg-white shadow-sm text-indigo-600 border border-slate-200' : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                         <m.icon className="w-4 h-4" />
                         <span>{m.label}</span>
                      </button>
                   ))}
                </div>

                <div className="w-2/3 p-6">
                   <div className="mb-6">
                      <p className="text-xs text-slate-500 uppercase font-semibold mb-1">Paying Amount</p>
                      <div className="text-2xl font-bold text-slate-900">$1,094.60</div>
                   </div>

                   <form onSubmit={handlePay} className="space-y-4">
                      {paymentMethod === 'card' && (
                         <div className="space-y-3 animate-fadeIn">
                            <div>
                               <label className="block text-xs font-medium text-slate-700 mb-1">Card Number</label>
                               <input required type="text" placeholder="0000 0000 0000 0000" className="w-full border border-slate-300 rounded p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"/>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                               <div>
                                  <label className="block text-xs font-medium text-slate-700 mb-1">Expiry</label>
                                  <input required type="text" placeholder="MM/YY" className="w-full border border-slate-300 rounded p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"/>
                               </div>
                               <div>
                                  <label className="block text-xs font-medium text-slate-700 mb-1">CVV</label>
                                  <input required type="text" placeholder="123" maxLength={3} className="w-full border border-slate-300 rounded p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"/>
                               </div>
                            </div>
                         </div>
                      )}
                      
                      {/* Simplified other methods for brevity */}
                      {(paymentMethod === 'upi' || paymentMethod === 'netbanking') && (
                          <div className="text-center py-6 text-sm text-slate-500 bg-slate-50 rounded">
                             Redirecting to secure gateway...
                          </div>
                      )}

                      <div className="pt-4">
                         <button 
                           type="submit" 
                           disabled={isProcessing}
                           className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-lg transition-colors flex items-center justify-center disabled:opacity-70"
                         >
                            {isProcessing ? (
                               <>
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  Processing...
                               </>
                            ) : (
                               'Pay Now'
                            )}
                         </button>
                      </div>
                   </form>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* --- INVOICE HISTORY MODAL --- */}
      {showInvoiceModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4 animate-fadeIn"
          onClick={() => setShowInvoiceModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
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
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Inbound</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Outbound</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Breakdown</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {invoices.map((invoice, idx) => (
                      <tr key={invoice._id} className="hover:bg-slate-50">
                        <td className="px-6 py-4">
                          <div className="text-sm font-bold text-slate-900">{formatMonth(invoice.month)}</div>
                          <div className="text-xs text-slate-500">
                            {new Date(invoice.generatedAt).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-slate-900">{invoice.inboundMinutes} mins</div>
                          <div className="text-xs text-slate-500">${invoice.inboundCost.toFixed(2)}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-slate-900">{invoice.outboundMinutes} mins</div>
                          <div className="text-xs text-slate-500">${invoice.outboundCost.toFixed(2)}</div>
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-slate-900">${invoice.totalAmount.toFixed(2)}</td>
                        <td className="px-6 py-4 text-right">
                          <div className="text-xs text-slate-600 space-y-1">
                            <div>LLM: ${invoice.breakdown.llm.toFixed(2)}</div>
                            <div>STT: ${invoice.breakdown.stt.toFixed(2)}</div>
                            <div>TTS: ${invoice.breakdown.tts.toFixed(2)}</div>
                            <div>Infra: ${invoice.breakdown.infrastructure.toFixed(2)}</div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="flex flex-col items-center justify-center py-12">
                  <FileText className="w-16 h-16 text-slate-300 mb-4" />
                  <p className="text-slate-600 font-medium">No invoices yet</p>
                  <p className="text-slate-400 text-sm mt-1">Invoices will appear here after you make calls</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- SUBSCRIPTION MANAGEMENT MODAL --- */}
      {showSubscriptionModal && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4 animate-fadeIn">
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

                  {/* Plan Selection */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                     {plans.map(plan => (
                        <div
                           key={plan.id}
                           onClick={() => setSelectedPlan(plan.id as 'Starter' | 'Pro' | 'Enterprise')}
                           className={`relative rounded-2xl p-6 cursor-pointer transition-all ${
                              selectedPlan === plan.id
                                 ? 'bg-white border-2 border-blue-600 shadow-xl scale-105 z-10'
                                 : 'bg-white border border-slate-200 hover:border-blue-300 opacity-80 hover:opacity-100'
                           }`}
                        >
                           {selectedPlan === plan.id && (
                              <div className="absolute top-0 right-0 transform translate-x-2 -translate-y-2">
                                 <div className="bg-blue-600 text-white rounded-full p-1 shadow-md">
                                    <Check className="w-4 h-4" />
                                 </div>
                              </div>
                           )}
                           <h3 className="text-lg font-bold text-slate-900 mb-2">{plan.id}</h3>
                           <div className="flex items-baseline mb-6">
                              {plan.activationFee === null ? (
                                <span className="text-2xl font-bold text-slate-900">Contact Sales</span>
                              ) : (
                                <>
                                  <span className="text-3xl font-bold text-slate-900">${plan.activationFee}</span>
                                  <span className="text-slate-500 ml-1">one-time</span>
                                </>
                              )}
                           </div>
                           <ul className="space-y-3 mb-6">
                              {plan.features.map((feat, i) => (
                                 <li key={i} className="flex items-center text-sm text-slate-600">
                                    <CheckCircle2 className="w-4 h-4 text-green-500 mr-2 shrink-0" />
                                    {feat}
                                 </li>
                              ))}
                           </ul>
                        </div>
                     ))}
                  </div>

                  {/* Add-ons (Only for Pro plan) */}
                  {selectedPlan === 'Pro' && (
                    <div className="max-w-3xl mx-auto">
                       <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center">
                          <Zap className="w-5 h-5 mr-2 text-yellow-500" />
                          Available Add-ons
                       </h3>
                       <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                          <div className="p-4 flex items-center justify-between">
                             <div className="flex items-center space-x-4">
                                <div className="p-2 bg-indigo-50 rounded text-indigo-600">
                                   <HardDrive className="w-6 h-6" />
                                </div>
                                <div>
                                   <h4 className="font-bold text-slate-900">Extra Documents (10 docs)</h4>
                                   <p className="text-sm text-slate-500">Add 10 more documents to your knowledge base.</p>
                                </div>
                             </div>
                             <div className="flex items-center space-x-4">
                                <span className="font-bold text-slate-900">$1</span>
                                <button
                                   onClick={() => setSelectedAddons(prev => ({...prev, extraDocs: !prev.extraDocs}))}
                                   className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${selectedAddons.extraDocs ? 'bg-blue-600' : 'bg-slate-200'}`}
                                >
                                   <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${selectedAddons.extraDocs ? 'translate-x-5' : 'translate-x-0'}`} />
                                </button>
                             </div>
                          </div>

                          <div className="p-4 flex items-center justify-between">
                             <div className="flex items-center space-x-4">
                                <div className="p-2 bg-green-50 rounded text-green-600">
                                   <Smartphone className="w-6 h-6" />
                                </div>
                                <div>
                                   <h4 className="font-bold text-slate-900">Extra AI Agent Slot</h4>
                                   <p className="text-sm text-slate-500">Add 1 more agent (max 2 extra agents).</p>
                                </div>
                             </div>
                             <div className="flex items-center space-x-4">
                                <span className="font-bold text-slate-900">$20</span>
                                <button
                                   onClick={() => setSelectedAddons(prev => ({...prev, extraAgent: !prev.extraAgent}))}
                                   className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${selectedAddons.extraAgent ? 'bg-blue-600' : 'bg-slate-200'}`}
                                >
                                   <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${selectedAddons.extraAgent ? 'translate-x-5' : 'translate-x-0'}`} />
                                </button>
                             </div>
                          </div>
                       </div>
                    </div>
                  )}

                  {/* Enterprise note */}
                  {selectedPlan === 'Enterprise' && (
                    <div className="max-w-3xl mx-auto bg-blue-50 border border-blue-200 rounded-xl p-6">
                      <h4 className="font-bold text-slate-900 mb-2">Enterprise Plan</h4>
                      <p className="text-sm text-slate-600">
                        Contact our sales team to discuss your requirements and get a custom quote tailored to your business needs.
                      </p>
                    </div>
                  )}
               </div>

               {/* Footer / Checkout Bar */}
               <div className="bg-white border-t border-slate-200 p-6 flex justify-between items-center shrink-0">
                  <div>
                     <p className="text-sm font-medium text-slate-500">
                       {selectedPlan === 'Enterprise' ? 'Contact Sales' : 'Activation Fee + Add-ons'}
                     </p>
                     <p className="text-3xl font-bold text-slate-900">
                       {selectedPlan === 'Enterprise' ? 'Custom' : `$${calculateSubscriptionTotal().toFixed(2)}`}
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
                        disabled={isProcessing || selectedPlan === 'Enterprise'}
                        className="px-8 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 flex items-center disabled:opacity-70"
                     >
                        {isProcessing ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Shield className="w-5 h-5 mr-2" />}
                        {selectedPlan === 'Enterprise' ? 'Contact Sales' : 'Confirm Changes'}
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
