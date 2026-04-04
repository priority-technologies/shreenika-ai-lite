import React, { useState } from "react";
import { X, Sparkles, Loader2 } from "lucide-react";

interface AskGooglePromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (instruction: string) => Promise<void>;
}

const AskGooglePromptModal: React.FC<AskGooglePromptModalProps> = ({
  isOpen,
  onClose,
  onGenerate,
}) => {
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!instruction.trim()) return;
    setLoading(true);
    await onGenerate(instruction);
    setLoading(false);
    setInstruction("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex justify-between items-center">
          <h3 className="text-white font-bold flex items-center">
            <Sparkles className="w-5 h-5 mr-2" />
            Ask Google AI
          </h3>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <p className="text-sm text-slate-600 mb-4">
            Describe your agent’s goal and Google will generate a professional system prompt.
          </p>

          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="e.g. A sales assistant for an e-commerce store who qualifies leads..."
            className="w-full border border-slate-300 rounded-lg p-4 text-sm h-32 resize-none focus:ring-2 focus:ring-blue-500 outline-none mb-6"
          />

          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 border border-slate-300 rounded-lg text-slate-700 text-sm"
            >
              Cancel
            </button>

            <button
              onClick={handleGenerate}
              disabled={loading || !instruction.trim()}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 flex items-center disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                "Generate Prompt"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AskGooglePromptModal;
