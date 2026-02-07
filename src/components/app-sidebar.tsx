'use client';

import * as React from 'react';
import {
  Bot,
  Command,
  LayoutDashboard,
  MessageSquare,
  Settings,
  LogOut,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { createAuthClient } from 'better-auth/react';
import { cn } from '@/lib/utils';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';

const authClient = createAuthClient();

const navItems = [
  {
    title: 'Dashboard',
    url: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    title: 'My Bots',
    url: '/dashboard/bots',
    icon: Bot,
  },
  {
    title: 'Conversations',
    url: '/dashboard/conversations',
    icon: MessageSquare,
  },
];

const secondaryItems = [
  {
    title: 'Settings',
    url: '/dashboard/settings',
    icon: Settings,
  },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = async () => {
    await authClient.signOut();
    router.push('/login');
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-zinc-100 bg-white" {...props}>
      <SidebarHeader className="p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="hover:bg-transparent px-0">
              <Link href="/dashboard" className="flex items-center gap-3">
                <div className="flex aspect-square size-10 items-center justify-center rounded-xl bg-zinc-900 text-white shadow-lg transition-transform hover:scale-105 active:scale-95">
                  <Command className="size-5" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="font-black text-zinc-900 text-base">AI WIDGET</span>
                  <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-widest">
                    Premium SaaS
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="px-2">
        <SidebarMenu className="mt-8 gap-1.5">
          {navItems.map(item => {
            const isActive = pathname === item.url;
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  tooltip={item.title}
                  asChild
                  className={cn(
                    'h-11 rounded-xl transition-all duration-200 px-4',
                    isActive
                      ? 'bg-zinc-900 text-white shadow-md hover:bg-zinc-800'
                      : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'
                  )}
                >
                  <Link href={item.url} className="flex items-center gap-3">
                    <item.icon
                      className={cn('size-5', isActive ? 'text-white' : 'text-zinc-400')}
                    />
                    <span className="font-semibold tracking-tight">{item.title}</span>
                    {isActive && <ChevronRight className="ml-auto size-4 opacity-50" />}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t border-zinc-50">
        <SidebarMenu className="gap-1">
          {secondaryItems.map(item => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                size="sm"
                asChild
                className="h-10 rounded-lg text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
              >
                <Link href={item.url} className="flex items-center gap-3">
                  <item.icon className="size-4" />
                  <span className="font-medium">{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
          <SidebarMenuItem className="mt-4">
            <SidebarMenuButton
              size="sm"
              onClick={handleLogout}
              className="h-10 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-all font-medium"
            >
              <LogOut className="size-4 mr-3" />
              <span>Sign Out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
