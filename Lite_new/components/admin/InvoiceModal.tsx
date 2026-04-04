import React, { useState, useEffect } from 'react';
import { X, FileText } from 'lucide-react';
import { apiFetch } from '../../services/api';

interface Invoice {
  _id: string;
  month: string;
  totalAmount: number;
  inboundMinutes?: number;
  outboundMinutes?: number;
  inboundCost?: number;
  outboundCost?: number;
  breakdown?: {
    llm: number;
    stt: number;
    tts: number;
    infrastructure: number;
  };
  generatedAt?: string;
}

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

const InvoiceModal: React.FC<InvoiceModalProps> = ({ isOpen, onClose, userId }) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchInvoices();
    }
  }, [isOpen, userId]);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      // Fetch invoices for the user - you may need to create this endpoint
      // For now, using a generic approach that should work with existing billing data
      const data = await apiFetch(`/admin/users/${userId}`, { method: 'GET' }, 'core');
      // Extract invoices from response if available
      if (data.invoices) {
        setInvoices(data.invoices);
      }
    } catch (err) {
      console.error('Failed to fetch invoices:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatMonth = (monthStr: string) => {
    if (!monthStr) return 'N/A';
    const [year, month] = monthStr.split('-');
    if (!year || !month) {
      const date = new Date(monthStr);
      return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
          <h3 className="font-bold text-lg text-slate-900 flex items-center">
            <FileText className="w-5 h-5 mr-3 text-slate-500" />
            Invoice History
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-slate-600">Loading invoices...</p>
            </div>
          ) : invoices.length > 0 ? (
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-white sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Month
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Inbound
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Outbound
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Breakdown
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {invoices.map((invoice) => (
                  <tr key={invoice._id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold text-slate-900">
                        {formatMonth(invoice.month)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {invoice.generatedAt
                          ? new Date(invoice.generatedAt).toLocaleDateString()
                          : 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-slate-900">
                        {invoice.inboundMinutes || 0} mins
                      </div>
                      <div className="text-xs text-slate-500">
                        ${(invoice.inboundCost || 0).toFixed(2)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-slate-900">
                        {invoice.outboundMinutes || 0} mins
                      </div>
                      <div className="text-xs text-slate-500">
                        ${(invoice.outboundCost || 0).toFixed(2)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-900">
                      ${invoice.totalAmount.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-xs text-slate-600 space-y-1">
                        {invoice.breakdown && (
                          <>
                            <div>LLM: ${invoice.breakdown.llm.toFixed(2)}</div>
                            <div>STT: ${invoice.breakdown.stt.toFixed(2)}</div>
                            <div>TTS: ${invoice.breakdown.tts.toFixed(2)}</div>
                            <div>Infra: ${invoice.breakdown.infrastructure.toFixed(2)}</div>
                          </>
                        )}
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
              <p className="text-slate-400 text-sm mt-1">
                Invoices will appear here after user makes calls
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InvoiceModal;
