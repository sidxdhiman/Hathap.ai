import React from 'react';
import { AlertCircle, CheckCircle, InfoIcon } from 'lucide-react';

interface AlertProps {
  variant?: 'success' | 'error' | 'info' | 'warning';
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({ variant = 'info', children, icon, className = '' }) => {
  const variantClasses = {
    success: 'bg-green-500/20 border-green-600 text-white',
    error: 'bg-red-500/20 border-red-600 text-white',
    info: 'bg-sky-500/20 border-sky-600 text-white',
    warning: 'bg-yellow-500/20 border-yellow-600 text-white',
  };

  const defaultIcon = {
    success: <CheckCircle size={20} />,
    error: <AlertCircle size={20} />,
    info: <InfoIcon size={20} />,
    warning: <AlertCircle size={20} />,
  };

  return (
    <div className={`border ${variantClasses[variant]} p-4 flex gap-3 items-start ${className}`}>
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
    primary: 'bg-sky-500/20 text-white border border-sky-600',
    success: 'bg-green-500/20 text-white border border-green-600',
    error: 'bg-red-500/20 text-white border border-red-600',
    warning: 'bg-yellow-500/20 text-white border border-yellow-600',
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
      <p className="text-theme-text-secondary">{message}</p>
    </div>
  );
};
