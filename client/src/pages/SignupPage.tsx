import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, User, Lock } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import logo from '../../assets/logo-1.png';

export const SignupPage: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const { refreshData } = useApp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await auth.signup(name, email, password);
      refreshData();
      navigate('/onboarding');
    } catch (e) {
      alert('Signup failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-theme-bg-primary flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <img 
            src={logo} 
            alt="Hathap.AI Logo" 
            className="w-16 h-16 shadow-2xl shadow-blue-500/20"
          />
        </div>

        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2 gradient-text">Hathap.AI</h1>
          <p className="text-theme-text-secondary">Create your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="glassmorphism p-6 space-y-4 border-theme-border">
            <div>
              <label className="block text-sm font-semibold text-theme-text-primary mb-2">
                <User size={16} className="inline mr-2" />
                Full name
              </label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>

            <div>
              <label className="block text-sm font-semibold text-theme-text-primary mb-2">
                <Mail size={16} className="inline mr-2" />
                Email
              </label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>

            <div>
              <label className="block text-sm font-semibold text-theme-text-primary mb-2">
                <Lock size={16} className="inline mr-2" />
                Password
              </label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>

            <Button type="submit" isLoading={isLoading} className="w-full justify-center">
              Create Account
            </Button>
          </div>

          <p className="text-center text-theme-text-secondary text-sm">Already have an account? <a className="text-blue-400 hover:underline" href="/">Sign in</a></p>
        </form>
      </div>
    </div>
  );
};
