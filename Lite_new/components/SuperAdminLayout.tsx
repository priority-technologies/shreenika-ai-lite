import React, { useState, useEffect } from 'react';
import {
  LogOut,
  Bot,
  Menu,
  X,
  Settings,
  Users,
  FileText,
  ChevronDown,
  ShieldCheck,
} from 'lucide-react';

interface SuperAdminLayoutProps {
  children: React.ReactNode;
  currentPath: string;
  navigate: (path: string) => void;
  setIsAuthenticated: (val: boolean) => void;
}

const SuperAdminLayout: React.FC<SuperAdminLayoutProps> = ({
  children,
  currentPath,
  navigate,
  setIsAuthenticated,
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCMSExpanded, setIsCMSExpanded] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('forceOnboarding');
    setIsAuthenticated(false);
    navigate('/login');
  };

  const adminNavItems = [
    {
      name: 'User Management',
      icon: Users,
      path: '/admin/users',
      subItems: [],
    },
  ];

  const cmsNavItems = [
    { name: 'Privacy & Terms', path: '/admin/cms/privacy' },
    { name: 'FAQs', path: '/admin/cms/faqs' },
    { name: 'Tickets', path: '/admin/cms/tickets' },
    { name: 'Affiliate Center', path: '/admin/cms/affiliate' },
  ];

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [currentPath]);

  const isActive = (path: string) => currentPath === path || currentPath.startsWith(path + '/');

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
              <ShieldCheck className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <div className="text-lg font-bold text-red-600">Shreenika AI</div>
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                Super Admin
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden text-slate-400 hover:text-red-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1 flex-1 overflow-y-auto">
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-2">
              Super Admin
            </h3>

            {/* User Management */}
            {adminNavItems.map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive(item.path)
                    ? 'bg-red-50 text-red-600 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.name}</span>
              </button>
            ))}

            {/* CMS Pages Collapsible */}
            <div className="mt-2">
              <button
                onClick={() => setIsCMSExpanded(!isCMSExpanded)}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                  isCMSExpanded || cmsNavItems.some((item) => isActive(item.path))
                    ? 'bg-red-50 text-red-600 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <FileText className="w-5 h-5" />
                <span>CMS Pages</span>
                <ChevronDown
                  className={`w-4 h-4 ml-auto transition-transform ${
                    isCMSExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* CMS Sub-items */}
              {isCMSExpanded && (
                <div className="ml-4 mt-1 space-y-1 border-l border-slate-200">
                  {cmsNavItems.map((item) => (
                    <button
                      key={item.path}
                      onClick={() => navigate(item.path)}
                      className={`w-full flex items-center space-x-3 px-4 py-2 rounded-lg text-sm transition-colors ${
                        isActive(item.path)
                          ? 'text-red-600 font-semibold bg-red-50'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="ml-1">{item.name}</span>
                      {item.name === 'Tickets' || item.name === 'Affiliate Center' ? (
                        <span className="ml-auto text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-1 rounded">
                          Coming Soon
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
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
          <span className="ml-4 font-semibold">Shreenika AI Super Admin</span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default SuperAdminLayout;
