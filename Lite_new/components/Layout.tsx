import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Phone,
  LogOut,
  Bot,
  Menu,
  X,
  BookOpen,
  CreditCard,
  ShieldCheck,
  Settings,
} from 'lucide-react';

import VerificationBanner from "./verificationBanner.tsx";

const user = JSON.parse(localStorage.getItem("user") || "null");

<VerificationBanner user={user} />

interface LayoutProps {
  children: React.ReactNode;
  currentPath: string;
  navigate: (path: string) => void;
  setIsAuthenticated: (val: boolean) => void;
}

const Layout: React.FC<LayoutProps> = ({
  children,
  currentPath,
  navigate,
  setIsAuthenticated,
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAdminStatus = () => {
      const userStr = localStorage.getItem('voxai_user');
      if (userStr) {
        const user = JSON.parse(userStr);
        setIsAdmin(user.role === 'admin' || user.role === 'superadmin');
      } else {
        setIsAdmin(false);
      }
    };

    checkAdminStatus();
    window.addEventListener('storage', checkAdminStatus);
    return () => window.removeEventListener('storage', checkAdminStatus);
  }, [currentPath]);

  const handleLogout = () => {
    localStorage.removeItem('voxai_user');
    setIsAuthenticated(false);
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { name: 'Agent Management', icon: Bot, path: '/agents' },
    { name: 'Knowledge Center', icon: BookOpen, path: '/knowledge' },
    { name: 'Contacts', icon: Users, path: '/leads' },
    { name: 'Call Management', icon: Phone, path: '/calls' },
    { name: 'Usage & Billing', icon: CreditCard, path: '/usage' },
    // Learning Reels intentionally hidden for now
  ];

  if (isAdmin) {
    navItems.push({
      name: 'Super Admin',
      icon: ShieldCheck,
      path: '/admin',
    });
  }

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [currentPath]);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-slate-900/50 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-slate-200 transform transition-transform duration-200 ease-in-out
        lg:translate-x-0 lg:static lg:inset-auto flex flex-col
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-6 border-b border-slate-100">
          <div className="flex items-center space-x-2.5">
            <div className="relative w-8 h-8 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-orange-500 via-red-500 to-purple-600 opacity-20"></div>
              <Bot className="w-6 h-6 text-blue-700" />
            </div>
            <div>
              <div className="text-lg font-bold text-blue-700">Shreenika AI</div>
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                Lite
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden text-slate-400 hover:text-blue-700"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1 flex-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = currentPath === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors
                ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.name}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100">
          <button
            onClick={() => navigate('/settings')}
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-slate-600 hover:bg-slate-50"
          >
            <Settings className="w-5 h-5" />
            <span>Settings</span>
          </button>

          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50"
          >
            <LogOut className="w-5 h-5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b h-16 flex items-center px-4 lg:hidden">
          <button onClick={() => setIsSidebarOpen(true)}>
            <Menu className="w-6 h-6" />
          </button>
          <span className="ml-4 font-semibold">Shreenika AI</span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
