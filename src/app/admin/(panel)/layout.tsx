'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Shield,
  LayoutDashboard,
  Users,
  Bot,
  MessageSquare,
  LogOut,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { createAuthClient } from 'better-auth/react';
import { toast } from 'sonner';

const authClient = createAuthClient();

const navItems = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/bots', label: 'All Bots', icon: Bot },
  { href: '/admin/conversations', label: 'All Conversations', icon: MessageSquare },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isVerified, setIsVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    async function verify() {
      try {
        const res = await fetch('/api/admin/verify');
        const data = await res.json();
        if (!data.isAdmin) {
          router.replace('/admin/login');
        } else {
          setIsVerified(true);
        }
      } catch {
        router.replace('/admin/login');
      } finally {
        setIsLoading(false);
      }
    }
    verify();
  }, [router]);

  const handleLogout = async () => {
    await authClient.signOut();
    toast.success('Logged out successfully');
    router.push('/admin/login');
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
      </div>
    );
  }

  if (!isVerified) return null;

  return (
    <div className="flex h-dvh overflow-hidden bg-zinc-950">
      {/* Sidebar */}
      <aside className="w-16 sm:w-64 shrink-0 min-h-0 border-r border-zinc-800 bg-zinc-900/50 backdrop-blur-xl flex flex-col">
        {/* Logo */}
        <div className="p-3 sm:p-6 shrink-0 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <Shield className="h-5 w-5 text-red-400" />
            </div>
            <div className="hidden sm:block">
              <span className="text-lg font-bold text-white block leading-tight">Admin</span>
              <span className="text-[10px] text-zinc-500 font-semibold tracking-widest uppercase">
                Control Panel
              </span>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav aria-label="Admin navigation" className="flex-1 min-h-0 overflow-y-auto p-2 sm:p-4 space-y-1">
          {navItems.map(item => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center gap-3 px-3 sm:px-4 py-3 rounded-xl text-sm font-medium transition-all group ${
                  isActive
                    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                }`}
              >
                <item.icon
                  className={`h-4 w-4 ${isActive ? 'text-red-400' : 'text-zinc-500 group-hover:text-zinc-300'}`}
                />
                <span className="hidden sm:inline">{item.label}</span>
                {isActive && <ChevronRight className="hidden sm:block ml-auto h-3 w-3 text-red-400" />}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-2 sm:p-4 shrink-0 border-t border-zinc-800">
          <button
            onClick={handleLogout}
            aria-label="Logout"
            title="Logout"
            className="flex items-center gap-3 px-3 sm:px-4 py-3 rounded-xl text-sm font-medium text-zinc-400 hover:text-red-400 hover:bg-red-500/5 transition-all w-full"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="min-w-0 min-h-0 flex-1 overflow-auto">
        <div className="p-4 sm:p-8">{children}</div>
      </main>
    </div>
  );
}
