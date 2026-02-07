import { getConversations } from '@/lib/actions/bot';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { MessageSquare, Calendar, Bot, ChevronRight, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

export default async function ConversationsPage() {
  const conversations = await getConversations();

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-black tracking-tight text-zinc-900">Conversations</h2>
        <p className="text-zinc-500 font-medium">Analyze user interactions and bot responses</p>
      </div>

      {conversations.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-20 text-center border-dashed border-2 bg-zinc-50/50">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm border border-zinc-100 mb-6 transition-transform">
            <MessageSquare className="h-8 w-8 text-zinc-400" />
          </div>
          <CardTitle className="text-xl font-bold">No history found</CardTitle>
          <CardDescription className="max-w-xs mt-2 text-zinc-500">
            When users start chatting with your bots on your website, you'll see the history here.
          </CardDescription>
        </Card>
      ) : (
        <div className="grid gap-4">
          {conversations.map((conv: any) => (
            <Link key={conv.id} href={`/dashboard/conversations/${conv.id}`} className="group">
              <Card className="border-none shadow-md hover:shadow-xl transition-all duration-300 bg-white overflow-hidden active:scale-[0.99]">
                <CardContent className="p-0">
                  <div className="flex flex-col md:flex-row md:items-center p-6 gap-6">
                    <div className="h-14 w-14 rounded-2xl bg-zinc-50 flex items-center justify-center shrink-0 group-hover:bg-zinc-100 transition-colors">
                      <Bot className="h-6 w-6 text-zinc-400 group-hover:text-zinc-900 transition-colors" />
                    </div>

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-bold text-zinc-900 text-lg tracking-tight">
                          Session {conv.id.slice(-6).toUpperCase()}
                        </span>
                        <Badge
                          variant="outline"
                          className="rounded-full px-3 py-0 h-6 border-zinc-200 text-zinc-500 font-bold text-[10px] uppercase"
                        >
                          {conv.bot?.name || 'Unknown Bot'}
                        </Badge>
                      </div>

                      <p className="text-zinc-500 text-sm line-clamp-1 font-medium">
                        {conv.messages?.[0]?.content || 'No messages yet'}
                      </p>
                    </div>

                    <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-4 border-t md:border-t-0 pt-4 md:pt-0 mt-4 md:mt-0">
                      <div className="flex items-center gap-1.5 text-zinc-400 font-bold text-[10px] uppercase tracking-wider">
                        <Calendar className="h-3 w-3" />
                        {new Date(conv.createdAt).toLocaleDateString()}
                      </div>
                      <div className="h-10 w-10 rounded-full bg-zinc-50 flex items-center justify-center group-hover:bg-zinc-900 group-hover:text-white transition-all shadow-sm">
                        <ChevronRight className="h-5 w-5" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
