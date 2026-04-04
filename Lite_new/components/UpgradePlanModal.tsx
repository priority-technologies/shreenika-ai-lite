import React from "react";
import { X } from "lucide-react";

interface UpgradePlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade: () => void;
  currentPlan: "starter" | "pro" | "enterprise";
}

const UpgradePlanModal: React.FC<UpgradePlanModalProps> = ({
  isOpen,
  onClose,
  onUpgrade,
  currentPlan,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 text-center">
        <div className="flex justify-end mb-2">
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <h2 className="text-2xl font-bold text-slate-900 mb-3">
          Upgrade Required
        </h2>

        <p className="text-slate-600 mb-6">
          Your current <b>{currentPlan.toUpperCase()}</b> plan does not allow this action.
          Upgrade your plan to unlock more agents and advanced features.
        </p>

        <button
          onClick={onUpgrade}
          className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-all mb-3"
        >
          View Pricing Plans
        </button>

        <button
          onClick={onClose}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          Maybe Later
        </button>
      </div>
    </div>
  );
};

export default UpgradePlanModal;
