import React, { useState } from 'react';
import { X, Send, Loader2, CheckCircle, Brain, Zap, Database, User, Target, MessageSquare, BarChart3 } from 'lucide-react';

interface TestAgentProps {
  agentId: string;
  agentName: string;
  onClose: () => void;
}

export const SimpleTestAgent: React.FC<TestAgentProps> = ({ agentId, agentName, onClose }) => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [conversationHistory, setConversationHistory] = useState<Array<{role: string, text: string, metrics?: any}>>([]);

  const handleTest = async () => {
    if (!input.trim()) {
      setError('Please enter a test message');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:5000/api/voice/test-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, input })
      });

      const data = await response.json();

      if (data.success) {
        setResult(data);
        setConversationHistory(prev => [
          ...prev,
          { role: 'user', text: input },
          { role: 'agent', text: data.output.agentResponse, metrics: data.output }
        ]);
        setInput('');
      } else {
        setError(data.error || 'Test failed');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleTest();
    }
  };

  const getPrincipleColor = (principle: string) => {
    const colors: Record<string, string> = {
      'Reciprocity': 'bg-blue-100 text-blue-800 border border-blue-200',
      'Authority': 'bg-purple-100 text-purple-800 border border-purple-200',
      'Social Proof': 'bg-green-100 text-green-800 border border-green-200',
      'Liking': 'bg-pink-100 text-pink-800 border border-pink-200',
      'Scarcity': 'bg-orange-100 text-orange-800 border border-orange-200',
      'Commitment': 'bg-yellow-100 text-yellow-800 border border-yellow-200',
    };
    return colors[principle] || 'bg-gray-100 text-gray-800 border border-gray-200';
  };

  const getLatencyColor = (ms: number) => {
    if (ms < 1500) return 'text-green-600';
    if (ms < 3000) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getQualityColor = (quality: string) => {
    const map: Record<string, string> = {
      'Excellent': 'text-green-600',
      'Good': 'text-blue-600',
      'Medium': 'text-yellow-600',
      'Slow': 'text-red-600',
    };
    return map[quality] || 'text-gray-600';
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <Brain size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold">Test Agent: {agentName}</h2>
              <p className="text-xs text-white/80">A-Z Testing — Psychology • Language • Voice • Cache • Gemini AI</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Agent Profile Card */}
          {result && (
            <div className="bg-gradient-to-r from-slate-50 to-indigo-50 border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <User size={16} className="text-indigo-600" />
                <span className="text-sm font-bold text-slate-700">Agent Profile</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-slate-500">Name:</span> <span className="font-semibold">{result.agent?.name}</span></div>
                <div><span className="text-slate-500">Role:</span> <span className="font-semibold">{result.agent?.role}</span></div>
                <div><span className="text-slate-500">Company:</span> <span className="font-semibold">{result.agent?.company}</span></div>
                <div><span className="text-slate-500">Language:</span> <span className="font-semibold">{result.agent?.language}</span></div>
                <div><span className="text-slate-500">Voice:</span> <span className="font-semibold">{result.agent?.voice}</span></div>
                <div><span className="text-slate-500">Tone:</span> <span className="font-semibold">{result.agent?.voiceTone}</span></div>
              </div>
              {result.agent?.characteristics?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {result.agent.characteristics.map((c: string, i: number) => (
                    <span key={i} className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full">{c}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Conversation History */}
          {conversationHistory.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquare size={14} className="text-slate-500" />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Conversation</span>
              </div>
              {conversationHistory.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-sm'
                      : 'bg-gray-100 text-gray-800 rounded-bl-sm border border-gray-200'
                  }`}>
                    <p className="leading-relaxed">{msg.text}</p>
                    {msg.role === 'agent' && msg.metrics && (
                      <div className="mt-2 pt-2 border-t border-gray-200 flex flex-wrap gap-2">
                        <span className={`text-xs font-semibold ${getLatencyColor(msg.metrics.latencyMs)}`}>
                          ⚡ {msg.metrics.latencyMs}ms
                        </span>
                        <span className={`text-xs font-semibold ${getQualityColor(msg.metrics.responseQuality)}`}>
                          ⭐ {msg.metrics.responseQuality}
                        </span>
                        <span className="text-xs text-slate-500">
                          💾 {(msg.metrics.cacheStatus || 'miss').toUpperCase()}
                        </span>
                        <span className="text-xs text-purple-600 font-semibold">
                          🧠 {msg.metrics.taskRatio}/{msg.metrics.psychologyRatio}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-sm">
              ❌ {error}
            </div>
          )}

          {/* Psychology Analysis (latest result) */}
          {result && (
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Brain size={16} className="text-purple-600" />
                <span className="text-sm font-bold text-purple-700">Psychology Analysis</span>
              </div>

              {/* Active Principles */}
              <div className="mb-3">
                <p className="text-xs text-slate-500 mb-2">Active Principles</p>
                <div className="flex flex-wrap gap-2">
                  {(result.output?.psychologyApplied || []).map((p: string, i: number) => (
                    <span key={i} className={`text-xs px-3 py-1 rounded-full font-semibold ${getPrincipleColor(p)}`}>
                      {p}
                    </span>
                  ))}
                </div>
              </div>

              {/* Ratio + Signals */}
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="bg-white rounded-lg p-2 text-center border">
                  <div className="text-slate-500">Task / Psych Ratio</div>
                  <div className="font-bold text-purple-600 mt-1">
                    {result.output?.taskRatio}% / {result.output?.psychologyRatio}%
                  </div>
                </div>
                <div className="bg-white rounded-lg p-2 text-center border">
                  <div className="text-slate-500">Sentiment</div>
                  <div className={`font-bold mt-1 capitalize ${
                    result.output?.sentimentDetected === 'positive' ? 'text-green-600' :
                    result.output?.sentimentDetected === 'negative' ? 'text-red-600' : 'text-gray-600'
                  }`}>
                    {result.output?.sentimentDetected || 'neutral'}
                  </div>
                </div>
                <div className="bg-white rounded-lg p-2 text-center border">
                  <div className="text-slate-500">Engagement</div>
                  <div className={`font-bold mt-1 capitalize ${
                    result.output?.engagementLevel === 'high' ? 'text-green-600' :
                    result.output?.engagementLevel === 'low' ? 'text-red-600' : 'text-yellow-600'
                  }`}>
                    {result.output?.engagementLevel || 'medium'}
                  </div>
                </div>
              </div>

              {result.output?.objectionDetected && (
                <div className="mt-2 bg-orange-100 text-orange-800 text-xs px-3 py-1.5 rounded-lg border border-orange-200">
                  ⚠️ Objection Detected — Psychology shifted to handle with empathy
                </div>
              )}
            </div>
          )}

          {/* Performance Metrics */}
          {result && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white border rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <Zap size={14} className="text-blue-500" />
                  <span className="text-xs text-slate-500 font-semibold">Total Latency</span>
                </div>
                <div className={`text-2xl font-bold ${getLatencyColor(result.output?.latencyMs)}`}>
                  {result.output?.latencyMs}ms
                </div>
                <div className="text-xs text-slate-400 mt-1">Gemini: {result.output?.geminiLatencyMs}ms</div>
              </div>

              <div className="bg-white border rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <BarChart3 size={14} className="text-green-500" />
                  <span className="text-xs text-slate-500 font-semibold">Confidence</span>
                </div>
                <div className="text-2xl font-bold text-green-600">
                  {((result.output?.confidence || 0) * 100).toFixed(0)}%
                </div>
                <div className={`text-xs font-semibold mt-1 ${getQualityColor(result.output?.responseQuality)}`}>
                  {result.output?.responseQuality}
                </div>
              </div>

              <div className="bg-white border rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <Database size={14} className="text-indigo-500" />
                  <span className="text-xs text-slate-500 font-semibold">Cache</span>
                </div>
                <div className="text-lg font-bold text-indigo-600">
                  {(result.output?.cacheStatus || 'miss').toUpperCase()}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Hit Rate: {result.metrics?.cacheStats?.hitRate || '0%'}
                </div>
              </div>

              <div className="bg-white border rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <Target size={14} className="text-orange-500" />
                  <span className="text-xs text-slate-500 font-semibold">Response</span>
                </div>
                <div className="text-lg font-bold text-orange-600">
                  {result.output?.responseLength} chars
                </div>
                <div className="text-xs text-slate-400 mt-1">Knowledge Base: {result.profile?.knowledgeBaseEnabled ? `✅ (${result.profile.knowledgeBaseCount} docs)` : '—'}</div>
              </div>
            </div>
          )}

          {/* System Prompt Preview */}
          {result && (
            <details className="bg-gray-50 border rounded-xl">
              <summary className="px-4 py-3 text-xs font-semibold text-slate-600 cursor-pointer">
                📋 System Prompt Preview (Psychology-Enhanced)
              </summary>
              <div className="px-4 pb-4">
                <p className="text-xs text-gray-600 font-mono leading-relaxed whitespace-pre-wrap bg-white p-3 rounded border">
                  {result.profile?.systemPromptPreview}
                </p>
              </div>
            </details>
          )}

          {/* Test ID */}
          {result && (
            <div className="text-xs text-gray-400 bg-gray-50 px-3 py-2 rounded-lg border">
              <span className="font-semibold">Test ID:</span> {result.testId} &nbsp;|&nbsp;
              <span className="font-semibold">Agent:</span> {result.agentId} &nbsp;|&nbsp;
              <span className="font-semibold">Time:</span> {new Date(result.timestamp).toLocaleTimeString()}
            </div>
          )}
        </div>

        {/* Input Area — Fixed at bottom */}
        <div className="border-t bg-gray-50 px-5 py-4">
          {!result && (
            <div className="mb-3 text-xs text-slate-500 text-center">
              💡 Try: "What are your pricing plans?" or "I'm not sure if this is right for me"
            </div>
          )}
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={result ? "Send another message..." : "Type your test message (simulates user speech)..."}
              className="flex-1 p-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none text-sm"
              rows={2}
              disabled={loading}
            />
            <button
              onClick={handleTest}
              disabled={loading || !input.trim()}
              className="px-5 bg-indigo-600 text-white rounded-xl font-semibold flex items-center gap-2 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Send size={18} />
              )}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-2 text-center">Press Enter to send • Shift+Enter for new line</p>
        </div>

      </div>
    </div>
  );
};
