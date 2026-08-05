import React from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';
import { useApp, Toast } from '../../context/AppContext';

const iconFor = (variant: Toast['variant']) => {
  switch (variant) {
    case 'success':
      return <CheckCircle size={18} className="text-white" />;
    case 'error':
      return <AlertCircle size={18} className="text-white" />;
    case 'warning':
      return <AlertCircle size={18} className="text-white" />;
    default:
      return <Info size={18} className="text-white" />;
  }
};

const classesFor = (variant: Toast['variant']) => {
  switch (variant) {
    case 'success':
      return 'bg-green-500/15 border-green-500/40 text-white';
    case 'error':
      return 'bg-red-500/15 border-red-500/40 text-white';
    case 'warning':
      return 'bg-yellow-500/15 border-yellow-500/40 text-white';
    default:
      return 'bg-sky-500/15 border-sky-500/40 text-white';
  }
};

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-start gap-3 border rounded-lg p-3 shadow-lg backdrop-blur-sm animate-in slide-in-from-right-4 ${classesFor(
            toast.variant
          )}`}
        >
          <div className="flex-shrink-0 mt-0.5">{iconFor(toast.variant)}</div>
          <p className="flex-1 text-sm leading-relaxed">{toast.message}</p>
          <button
            onClick={() => dismissToast(toast.id)}
            className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
};
