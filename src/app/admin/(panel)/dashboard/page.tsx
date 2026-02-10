'use client';

import { useEffect, useState } from 'react';
import {
  Users,
  Bot,
  MessageSquare,
  FileText,
  Mail,
  TrendingUp,
  Shield,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Stats {
  totalUsers: number;
  totalBots: number;
  totalConversations: number;
  totalMessages: number;
  totalDocuments: number;
  recentUsers: {
    id: string;
    name: string | null;
    email: string;
    role: string;
    createdAt: string;
    _count: { bots: number };
  }[];
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/admin/stats');
        const data = await res.json();
        setStats(data);
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
      </div>
    );
  }

  if (!stats) return null;

  const statCards = [
    {
      title: 'Total Users',
      value: stats.totalUsers,
      icon: Users,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
    },
    {
      title: 'Total Bots',
      value: stats.totalBots,
      icon: Bot,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
      border: 'border-purple-500/20',
    },
    {
      title: 'Conversations',
      value: stats.totalConversations,
      icon: MessageSquare,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
    },
    {
      title: 'Messages',
      value: stats.totalMessages,
      icon: Mail,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
    },
    {
      title: 'Documents',
      value: stats.totalDocuments,
      icon: FileText,
      color: 'text-cyan-400',
      bg: 'bg-cyan-500/10',
      border: 'border-cyan-500/20',
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Admin Dashboard</h1>
        <p className="text-zinc-400 mt-1">System overview and platform statistics</p>
      </div>

      {/* Status Banner */}
      <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <TrendingUp className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Platform Status</h2>
            <p className="text-sm text-zinc-400">All systems operational</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
          <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
          <span className="text-xs font-bold text-emerald-400 tracking-wider uppercase">
            Online
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
        {statCards.map((stat, i) => (
          <Card
            key={i}
            className={`border-zinc-800 bg-zinc-900/80 backdrop-blur-xl hover:${stat.border} transition-all duration-300 group`}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                {stat.title}
              </CardTitle>
              <div className={`h-8 w-8 rounded-lg ${stat.bg} flex items-center justify-center`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black text-white tracking-tight">
                {stat.value.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Users */}
      <Card className="border-zinc-800 bg-zinc-900/80 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-400" />
            Recent Users
          </CardTitle>
          <CardDescription className="text-zinc-400">
            Latest registered users on the platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {stats.recentUsers.map(user => (
              <div
                key={user.id}
                className="flex items-center justify-between p-4 rounded-xl bg-zinc-800/50 border border-zinc-800 hover:border-zinc-700 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold text-white uppercase">
                    {user.name?.charAt(0) || user.email.charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{user.name || 'Unnamed'}</div>
                    <div className="text-xs text-zinc-500">{user.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500">{user._count.bots} bots</span>
                  <Badge
                    variant={user.role === 'ADMIN' ? 'destructive' : 'secondary'}
                    className="text-[10px]"
                  >
                    {user.role === 'ADMIN' && <Shield className="h-3 w-3 mr-1" />}
                    {user.role}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
