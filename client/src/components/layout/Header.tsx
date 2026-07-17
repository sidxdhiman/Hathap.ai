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
    <header className="sticky top-0 z-40 glassmorphism border-b border-theme-border">
      <div className="px-4 py-4 lg:px-6">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-cyan-400 flex items-center justify-center transform group-hover:scale-110 transition-transform">
                <Gavel size={24} className="text-slate-950" />
              </div>
              <div className="hidden md:block">
                <h1 className="text-lg font-bold gradient-text">Hathap.AI</h1>
              </div>
            </Link>
          </div>

          {/* Centered navigation */}
          <nav className="hidden md:flex flex-1 justify-center items-center">
            <div className="inline-flex bg-transparent rounded px-2 py-1">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`mx-1 px-3 py-2 text-sm transition-all ${
                    isActive(item.path)
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-600'
                      : 'text-theme-text-secondary hover:bg-theme-bg-secondary border border-transparent'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>

          {/* Actions on the right */}
          <div className="hidden md:flex items-center gap-3">
            <Link to="/profile">
              <button className="p-2 hover:bg-theme-bg-secondary transition-colors text-theme-text-secondary hover:text-theme-text-primary border border-transparent hover:border-theme-border">
                <User size={20} />
              </button>
            </Link>
            <button className="p-2 hover:bg-theme-bg-secondary transition-colors text-theme-text-secondary hover:text-theme-text-primary border border-transparent hover:border-theme-border">
              <LogOut size={20} />
            </button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 hover:bg-theme-bg-secondary transition-colors border border-transparent hover:border-theme-border ml-auto"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav className="md:hidden mt-4 space-y-2 border-t border-theme-border pt-4">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-4 py-2 transition-all border ${
                  isActive(item.path)
                    ? 'bg-blue-500/20 text-blue-300 border-blue-600'
                    : 'text-theme-text-secondary hover:bg-theme-bg-secondary border-transparent'
                }`}
              >
                {item.label}
              </Link>
            ))}
            <Link to="/profile" onClick={() => setMobileMenuOpen(false)}>
              <button className="w-full text-left px-4 py-2 transition-all border text-theme-text-secondary hover:bg-theme-bg-secondary border-transparent hover:border-theme-border flex items-center gap-2">
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
