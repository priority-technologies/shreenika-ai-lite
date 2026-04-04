import React, { useState } from 'react';
import { AgentConfig } from '../types';
import { Bot, ArrowRight, Loader2 } from 'lucide-react';
import VoipSetupPopup from './VoipSetupPopup';
import { markUserOnboarded } from '../services/api';

interface OnboardingProps {
  setAgent: (agent: AgentConfig) => void;
  navigate: (path: string) => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ setAgent, navigate }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [showVoipPopup, setShowVoipPopup] = useState(false);
  const [formData, setFormData] = useState<Partial<AgentConfig>>({
    name: 'Sales Assistant',
    title: 'Lead Qualifier',
    gender: 'Female',
    age: 28,
    prompt: 'You are a helpful assistant...',
  });

  const handleContinue = () => {
    // Show VOIP popup after agent identity is set
    setShowVoipPopup(true);
  };

  const handleVoipComplete = () => {
    // VOIP setup complete, close popup and finalize agent
    setShowVoipPopup(false);
    // Use setTimeout to ensure popup closes before navigation
    setTimeout(() => {
      finializeAgent();
    }, 100);
  };

  const handleVoipSkip = () => {
    // Skip VOIP and go to dashboard (user can set it up later in Settings)
    setShowVoipPopup(false);
    // Use setTimeout to ensure popup closes before navigation
    setTimeout(() => {
      finializeAgent();
    }, 100);
  };

  const finializeAgent = async () => {
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
      welcomeMessage: `Hello, this is ${formData.name}. How can I assist you today?`,
      knowledgeBase: []
    };

    // Mark user as onboarded in backend
    try {
      await markUserOnboarded();
      console.log('✅ User marked as onboarded');
    } catch (err) {
      console.error('⚠️ Failed to mark user as onboarded:', err);
    }

    setAgent(defaultAgent);
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center pt-20 px-4">
      <div className="max-w-2xl w-full">
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100">
          <div className="space-y-6">
            {/* Header */}
            <div className="text-center mb-6">
              <div className="bg-indigo-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Bot className="w-8 h-8 text-indigo-600" />
              </div>
              <h2 className="text-3xl font-bold text-slate-900">Create Your AI Agent</h2>
              <p className="text-slate-500">Let's give your agent a personality.</p>
            </div>

            {/* Agent Name and Role */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Agent Name</label>
                <input
                  type="text"
                  className="w-full border border-slate-300 rounded-lg p-3 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="e.g. Maya"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Role Title</label>
                <input
                  type="text"
                  className="w-full border border-slate-300 rounded-lg p-3 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="e.g. Sales Rep"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
            </div>

            {/* Gender and Age */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Gender</label>
                <select
                  className="w-full border border-slate-300 rounded-lg p-3 bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value as any })}
                >
                  <option>Female</option>
                  <option>Male</option>
                  <option>Neutral</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Age</label>
                <input
                  type="number"
                  className="w-full border border-slate-300 rounded-lg p-3 bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                  value={formData.age}
                  onChange={(e) => setFormData({ ...formData, age: parseInt(e.target.value) })}
                />
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div className="mt-8 flex justify-between gap-4">
            <button
              onClick={() => {
                localStorage.removeItem("token");
                localStorage.removeItem("user");
                localStorage.removeItem("forceOnboarding");
                navigate('/login');
              }}
              className="border border-slate-300 text-slate-700 px-8 py-3 rounded-lg font-semibold hover:bg-slate-50 transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleContinue}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-lg font-semibold flex items-center space-x-2 transition-colors shadow-lg shadow-indigo-200"
            >
              <span>Continue</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* VOIP Setup Popup */}
      <VoipSetupPopup
        isOpen={showVoipPopup}
        onClose={() => setShowVoipPopup(false)}
        onSkip={handleVoipSkip}
        onComplete={handleVoipComplete}
      />
    </div>
  );
};

export default Onboarding;
