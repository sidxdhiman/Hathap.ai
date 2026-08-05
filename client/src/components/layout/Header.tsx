import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Settings, LogOut, Menu, X, User } from 'lucide-react';
import { useState } from 'react';
import logo from '../../../assets/logo-1.png';
import { useAuth } from '../../context/AuthContext';

export const Header: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { token, logout } = useAuth();
  
  // Hide navbar items during onboarding
  const isOnboarding = location.pathname === '/onboarding';

  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/courtrooms', label: 'Courtrooms' },
    { path: '/models', label: 'Models' },
    { path: '/agents', label: 'Agents' },
  ];

  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (token) {
      navigate('/dashboard');
    } else {
      navigate('/');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-40 glassmorphism border-b border-theme-border">
      <div className="px-4 py-3 lg:px-6">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <div className="flex items-center gap-3">
            <button onClick={handleLogoClick} className="flex items-center gap-3 group hover:opacity-80 transition-opacity">
              <img 
                src={logo} 
                alt="Hathap.AI Logo" 
                className="w-8 h-8 transform group-hover:scale-110 transition-transform"
              />
              {!isOnboarding && (
                <div className="hidden md:block">
                  <h1 className="text-base font-bold gradient-text">Hathap.AI</h1>
                </div>
              )}
            </button>
          </div>

          {/* Centered navigation - hidden during onboarding */}
          {!isOnboarding && (
            <nav className="hidden md:flex flex-1 justify-center items-center">
              <div className="inline-flex bg-transparent rounded px-2 py-1">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`mx-1 px-3 py-2 text-sm transition-all ${
                      isActive(item.path)
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-600'
                        : 'text-theme-text-secondary hover:bg-theme-bg-secondary border border-transparent'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </nav>
          )}

          {/* Actions on the right - hidden during onboarding */}
          {!isOnboarding && (
            <div className="hidden md:flex items-center gap-3">
              <Link to="/profile">
                <button className="p-2 hover:bg-theme-bg-secondary transition-colors text-theme-text-secondary hover:text-theme-text-primary border border-transparent hover:border-theme-border">
                  <User size={20} />
                </button>
              </Link>
              <button 
                onClick={handleLogout}
                className="p-2 hover:bg-theme-bg-secondary transition-colors text-theme-text-secondary hover:text-theme-text-primary border border-transparent hover:border-theme-border"
                title="Logout"
              >
                <LogOut size={20} />
              </button>
            </div>
          )}

          {/* Mobile Menu Button - hidden during onboarding */}
          {!isOnboarding && (
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 hover:bg-theme-bg-secondary transition-colors border border-transparent hover:border-theme-border ml-auto"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          )}
        </div>

        {/* Mobile Navigation - hidden during onboarding */}
        {!isOnboarding && mobileMenuOpen && (
          <nav className="md:hidden mt-4 space-y-2 border-t border-theme-border pt-4">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-4 py-2 transition-all border ${
                  isActive(item.path)
                    ? 'bg-sky-500/20 text-sky-300 border-sky-600'
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
