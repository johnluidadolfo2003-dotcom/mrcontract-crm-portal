import React, { useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';

interface ToastProps {
  message: string;
  isVisible: boolean;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, isVisible, onClose }) => {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 bg-zinc-900 dark:bg-zinc-800 text-white px-4 py-3 rounded-2xl shadow-2xl border border-zinc-800 dark:border-zinc-700/50 animate-bounce-short"
    >
      <CheckCircle2 className="w-5 h-5 text-brand-orange" />
      <span className="text-sm font-semibold">{message}</span>
    </div>
  );
};
