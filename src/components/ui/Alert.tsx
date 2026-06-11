import React from 'react';
import { AlertCircle, CheckCircle, InfoIcon } from 'lucide-react';

interface AlertProps {
  variant?: 'success' | 'error' | 'info';
  children: React.ReactNode;
  icon?: React.ReactNode;
}

export const Alert: React.FC<AlertProps> = ({ variant = 'info', children, icon }) => {
  const variantClasses = {
    success: 'bg-green-500/20 border-green-600 text-green-300',
    error: 'bg-red-500/20 border-red-600 text-red-300',
    info: 'bg-blue-500/20 border-blue-600 text-blue-300',
  };

  const defaultIcon = {
    success: <CheckCircle size={20} />,
    error: <AlertCircle size={20} />,
    info: <InfoIcon size={20} />,
  };

  return (
    <div className={`border ${variantClasses[variant]} p-4 flex gap-3 items-start`}>
      <div className="flex-shrink-0 mt-0.5">{icon || defaultIcon[variant]}</div>
      <div className="flex-1">{children}</div>
    </div>
  );
};

export const Badge: React.FC<{ children: React.ReactNode; variant?: 'primary' | 'success' | 'error' | 'warning' }> = ({
  children,
  variant = 'primary',
}) => {
  const variantClasses = {
    primary: 'bg-blue-500/20 text-blue-300 border border-blue-600',
    success: 'bg-green-500/20 text-green-300 border border-green-600',
    error: 'bg-red-500/20 text-red-300 border border-red-600',
    warning: 'bg-yellow-500/20 text-yellow-300 border border-yellow-600',
  };

  return (
    <span className={`inline-block px-3 py-1 text-xs font-semibold ${variantClasses[variant]}`}>
      {children}
    </span>
  );
};

export const Loading: React.FC<{ message?: string }> = ({ message = 'Loading...' }) => {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-4">
      <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
      <p className="text-slate-400">{message}</p>
    </div>
  );
};
