'use client';

import { useEffect, useState } from 'react';
import { MessageSquare, Loader2, Search, Bot } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface ConversationItem {
  id: string;
  createdAt: string;
  bot: { name: string; primaryColor: string; user: { name: string | null; email: string } };
  _count: { messages: number };
}

export default function AdminConversationsPage() {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function fetchConversations() {
      try {
        const res = await fetch('/api/admin/conversations');
        const data = await res.json();
        if (Array.isArray(data)) {
          setConversations(data);
        }
      } catch (error) {
        console.error('Failed to fetch conversations:', error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchConversations();
  }, []);

  const filteredConversations = conversations.filter(
    c =>
      c.bot.name.toLowerCase().includes(search.toLowerCase()) ||
      c.id.toLowerCase().includes(search.toLowerCase())
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
        <h1 className="text-3xl font-bold text-white tracking-tight">All Conversations</h1>
        <p className="text-zinc-400 mt-1">{conversations.length} total conversations</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
        <Input
          placeholder="Search by bot name or conversation ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500 focus:border-red-500/50"
        />
      </div>

      <Card className="border-zinc-800 bg-zinc-900/80 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-emerald-400" />
            Conversations
          </CardTitle>
          <CardDescription className="text-zinc-400">
            All chat conversations across the platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-800">
            <div className="col-span-3">ID</div>
            <div className="col-span-3">Bot</div>
            <div className="col-span-2">Owner</div>
            <div className="col-span-2">Messages</div>
            <div className="col-span-2">Date</div>
          </div>

          <div className="divide-y divide-zinc-800/50">
            {filteredConversations.map(conv => (
              <div
                key={conv.id}
                className="grid grid-cols-12 gap-4 px-4 py-4 items-center hover:bg-zinc-800/30 transition-colors"
              >
                <div className="col-span-3 text-sm text-zinc-300 font-mono truncate">{conv.id}</div>
                <div className="col-span-3 flex items-center gap-2">
                  <div
                    className="h-6 w-6 rounded flex items-center justify-center"
                    style={{ backgroundColor: conv.bot.primaryColor + '20' }}
                  >
                    <Bot className="h-3 w-3" style={{ color: conv.bot.primaryColor }} />
                  </div>
                  <span className="text-sm text-white truncate">{conv.bot.name}</span>
                </div>
                <div className="col-span-2 text-sm text-zinc-400 truncate">
                  {conv.bot.user.name || conv.bot.user.email}
                </div>
                <div className="col-span-2 text-sm text-zinc-400 flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  {conv._count.messages}
                </div>
                <div className="col-span-2 text-sm text-zinc-500">
                  {new Date(conv.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>

          {filteredConversations.length === 0 && (
            <div className="text-center py-12 text-zinc-500">No conversations found.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
