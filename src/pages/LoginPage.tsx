import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gavel, Lock, Mail } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      navigate('/dashboard');
    }, 500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-400 to-cyan-400 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/20">
            <Gavel size={40} className="text-slate-950" />
          </div>
        </div>

        {/* Content */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2 gradient-text">AI Courtroom</h1>
          <p className="text-slate-400">Debate & Collaboration Platform</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="glassmorphism p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-200 mb-2">
                <Mail size={16} className="inline mr-2" />
                Email
              </label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-200 mb-2">
                <Lock size={16} className="inline mr-2" />
                Password
              </label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <Button type="submit" isLoading={isLoading} className="w-full justify-center">
              Sign In
            </Button>
          </div>

          <p className="text-center text-slate-400 text-sm">
            Demo: Use any email and password
          </p>
        </form>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-white/10 text-center text-slate-500 text-sm">
          <p>🚀 Powered by AI Collaboration</p>
        </div>
      </div>
    </div>
  );
};
