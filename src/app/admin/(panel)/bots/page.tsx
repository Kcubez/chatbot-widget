'use client';

import { useEffect, useState } from 'react';
import { Bot, Loader2, Search, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface BotItem {
  id: string;
  name: string;
  primaryColor: string;
  createdAt: string;
  user: { name: string | null; email: string };
  _count: { conversations: number; documents: number };
}

export default function AdminBotsPage() {
  const [bots, setBots] = useState<BotItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function fetchBots() {
      try {
        const res = await fetch('/api/admin/bots');
        const data = await res.json();
        if (Array.isArray(data)) {
          setBots(data);
        }
      } catch (error) {
        console.error('Failed to fetch bots:', error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchBots();
  }, []);

  const filteredBots = bots.filter(
    bot =>
      bot.name.toLowerCase().includes(search.toLowerCase()) ||
      bot.user.email.toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">All Bots</h1>
        <p className="text-zinc-400 mt-1">{bots.length} bots across all users</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
        <Input
          placeholder="Search bots or owner email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500 focus:border-red-500/50"
        />
      </div>

      <Card className="border-zinc-800 bg-zinc-900/80 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Bot className="h-5 w-5 text-purple-400" />
            All Bots
          </CardTitle>
          <CardDescription className="text-zinc-400">
            View all bots created by users
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-800">
            <div className="col-span-3">Bot</div>
            <div className="col-span-3">Owner</div>
            <div className="col-span-2">Conversations</div>
            <div className="col-span-2">Documents</div>
            <div className="col-span-2">Created</div>
          </div>

          <div className="divide-y divide-zinc-800/50">
            {filteredBots.map(bot => (
              <div
                key={bot.id}
                className="grid grid-cols-12 gap-4 px-4 py-4 items-center hover:bg-zinc-800/30 transition-colors"
              >
                <div className="col-span-3 flex items-center gap-3">
                  <div
                    className="h-9 w-9 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: bot.primaryColor + '20' }}
                  >
                    <Bot className="h-4 w-4" style={{ color: bot.primaryColor }} />
                  </div>
                  <span className="text-sm font-medium text-white truncate">{bot.name}</span>
                </div>
                <div className="col-span-3 flex items-center gap-2 text-sm text-zinc-400">
                  <User className="h-3 w-3 text-zinc-500" />
                  <span className="truncate">{bot.user.name || bot.user.email}</span>
                </div>
                <div className="col-span-2 text-sm text-zinc-400">{bot._count.conversations}</div>
                <div className="col-span-2 text-sm text-zinc-400">{bot._count.documents}</div>
                <div className="col-span-2 text-sm text-zinc-500">
                  {new Date(bot.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>

          {filteredBots.length === 0 && (
            <div className="text-center py-12 text-zinc-500">No bots found.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
