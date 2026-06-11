import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Gavel, Settings, LogOut, Menu, X, User } from 'lucide-react';
import { useState } from 'react';

export const Header: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/courtrooms', label: 'Debates' },
    { path: '/models', label: 'Models' },
    { path: '/agents', label: 'Agents' },
  ];

  return (
    <header className="sticky top-0 z-40 glassmorphism border-b border-slate-700">
      <div className="px-4 py-4 lg:px-6">
        <div className="flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-cyan-400 flex items-center justify-center transform group-hover:scale-110 transition-transform">
              <Gavel size={24} className="text-slate-950" />
            </div>
            <div className="hidden md:block">
              <h1 className="text-xl font-bold gradient-text">Hathap.AI</h1>
              <p className="text-xs text-slate-400">Debate & Collaboration</p>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`px-4 py-2 transition-all ${
                  isActive(item.path)
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-600'
                    : 'text-slate-300 hover:bg-slate-800 border border-transparent'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-3">
            <Link to="/profile">
              <button className="p-2 hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-200 border border-transparent hover:border-slate-700">
                <User size={20} />
              </button>
            </Link>
            <button className="p-2 hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-200 border border-transparent hover:border-slate-700">
              <LogOut size={20} />
            </button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-700"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav className="md:hidden mt-4 space-y-2 border-t border-slate-700 pt-4">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-4 py-2 transition-all border ${
                  isActive(item.path)
                    ? 'bg-blue-500/20 text-blue-300 border-blue-600'
                    : 'text-slate-300 hover:bg-slate-800 border-transparent'
                }`}
              >
                {item.label}
              </Link>
            ))}
            <Link to="/profile" onClick={() => setMobileMenuOpen(false)}>
              <button className="w-full text-left px-4 py-2 transition-all border text-slate-300 hover:bg-slate-800 border-transparent hover:border-slate-700 flex items-center gap-2">
                <User size={18} />
                Profile
              </button>
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
};
