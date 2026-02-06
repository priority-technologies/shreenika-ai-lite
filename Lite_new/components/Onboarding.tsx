import React, { useState } from 'react';
import { AgentConfig } from '../types';
import { Bot, Phone, ArrowRight, Check } from 'lucide-react';

interface OnboardingProps {
  setAgent: (agent: AgentConfig) => void;
  navigate: (path: string) => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ setAgent, navigate }) => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<Partial<AgentConfig>>({
    name: 'Sales Assistant',
    title: 'Lead Qualifier',
    gender: 'Female',
    age: 28,
    prompt: 'You are a helpful assistant...',
    voipProvider: null,
    voipApiKey: '',
    voipSid: ''
  });

  const handleNext = () => {
    if (step === 2) {
      // Finalize
      const defaultAgent: AgentConfig = {
        name: formData.name!,
        title: formData.title!,
        gender: formData.gender,
        age: formData.age!,
        prompt: formData.prompt!,
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + formData.name, 
        language: 'English (US)',
        voiceId: 'Monika',
        characteristics: ['Professional', 'Helpful'],
        callingLimit: 60,
        silenceDetectionMs: 15,
        voicemailDetection: true,
        voicemailAction: 'Leave a voicemail',
        voicemailMessage: `Hello, this is ${formData.name}. Please give me a call back.`,
        maxCallDuration: 3600,
        voiceSpeed: 1.0,
        interruptionSensitivity: 0.5,
        responsiveness: 0.5,
        emotionLevel: 0.5,
        backgroundNoise: 'Office',
        voipProvider: formData.voipProvider as any,
        voipApiKey: formData.voipApiKey || '',
        voipSid: formData.voipSid || '',
        welcomeMessage: `Hello, this is ${formData.name}. How can I assist you today?`,
        knowledgeBase: []
      };
      setAgent(defaultAgent);
      navigate('/dashboard');
    } else {
      setStep(step + 1);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center pt-20 px-4">
      <div className="max-w-2xl w-full">
        {/* Progress Bar */}
        <div className="mb-8">
           <div className="flex items-center justify-between mb-2">
             <span className={`text-sm font-medium ${step >= 1 ? 'text-indigo-600' : 'text-slate-400'}`}>1. Agent Identity</span>
             <span className={`text-sm font-medium ${step >= 2 ? 'text-indigo-600' : 'text-slate-400'}`}>2. Connect VOIP</span>
           </div>
           <div className="h-2 bg-slate-200 rounded-full">
              <div 
                className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                style={{ width: step === 1 ? '50%' : '100%' }}
              ></div>
           </div>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100">
           {step === 1 && (
             <div className="space-y-6">
                <div className="text-center mb-6">
                  <div className="bg-indigo-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Bot className="w-8 h-8 text-indigo-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900">Create Your AI Agent</h2>
                  <p className="text-slate-500">Let's give your agent a personality.</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Agent Name</label>
                    <input type="text" className="w-full border border-slate-300 rounded-lg p-3 bg-white focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. Maya" 
                      value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Role Title</label>
                    <input type="text" className="w-full border border-slate-300 rounded-lg p-3 bg-white focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. Sales Rep" 
                      value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Gender</label>
                    <select className="w-full border border-slate-300 rounded-lg p-3 bg-white outline-none"
                      value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value as any})}>
                      <option>Female</option>
                      <option>Male</option>
                      <option>Neutral</option>
                    </select>
                   </div>
                   <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Age</label>
                    <input type="number" className="w-full border border-slate-300 rounded-lg p-3 bg-white outline-none"
                      value={formData.age} onChange={e => setFormData({...formData, age: parseInt(e.target.value)})} />
                   </div>
                </div>
             </div>
           )}

           {step === 2 && (
             <div className="space-y-6">
                <div className="text-center mb-6">
                  <div className="bg-indigo-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Phone className="w-8 h-8 text-indigo-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900">Connect Telephony</h2>
                  <p className="text-slate-500">Configure your VOIP provider credentials.</p>
                </div>

                <div>
                   <label className="block text-sm font-medium text-slate-700 mb-1">Provider</label>
                   <div className="grid grid-cols-3 gap-3 mb-4">
                      {['Twilio', 'BlandAI', 'Vapi'].map(p => (
                        <button 
                          key={p}
                          onClick={() => setFormData({...formData, voipProvider: p as any})}
                          className={`p-3 rounded-lg border text-sm font-medium transition-all ${
                            formData.voipProvider === p 
                            ? 'border-indigo-600 bg-indigo-50 text-indigo-700' 
                            : 'border-slate-200 hover:border-indigo-300'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                   </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Account SID / API Key ID</label>
                  <input type="text" className="w-full border border-slate-300 rounded-lg p-3 bg-white focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="ACxxxxxxxx..." 
                    value={formData.voipSid} onChange={e => setFormData({...formData, voipSid: e.target.value})} />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Auth Token / Secret</label>
                  <input type="password" className="w-full border border-slate-300 rounded-lg p-3 bg-white focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="••••••••••••••••" 
                    value={formData.voipApiKey} onChange={e => setFormData({...formData, voipApiKey: e.target.value})} />
                </div>
             </div>
           )}

           <div className="mt-8 flex justify-end">
             <button 
               onClick={handleNext}
               className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-lg font-semibold flex items-center space-x-2 transition-colors shadow-lg shadow-indigo-200"
             >
               <span>{step === 2 ? 'Finish Setup' : 'Continue'}</span>
               {step === 2 ? <Check className="w-5 h-5"/> : <ArrowRight className="w-5 h-5" />}
             </button>
           </div>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
