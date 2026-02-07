import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Bot, User, ArrowLeft, Calendar, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

export default async function ConversationDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) return null;

  const conversation = await prisma.conversation.findUnique({
    where: {
      id,
      bot: { userId: session.user.id },
    },
    include: {
      bot: true,
      messages: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!conversation) notFound();

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild className="rounded-full">
          <Link href="/dashboard/conversations">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h2 className="text-2xl font-black text-zinc-900 tracking-tight">Chat Logic Detail</h2>
          <div className="flex items-center gap-2 mt-1">
            <Badge
              variant="secondary"
              className="rounded-full bg-zinc-100 text-zinc-500 border-none font-bold text-[10px] uppercase"
            >
              {conversation.bot.name}
            </Badge>
            <span className="text-zinc-400 text-xs font-medium">
              Started {new Date(conversation.createdAt).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-4 pb-12">
        {conversation.messages.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground italic bg-zinc-50 rounded-3xl border-2 border-dashed">
            No messages found in this session.
          </div>
        ) : (
          conversation.messages.map(msg => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}
            >
              <div
                className={`flex gap-4 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <div
                  className={`h-10 w-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
                    msg.role === 'user' ? 'bg-zinc-900 text-white' : 'bg-white border text-zinc-400'
                  }`}
                >
                  {msg.role === 'user' ? <User className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
                </div>
                <div className={`space-y-1.5 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                  <div
                    className={`p-4 rounded-3xl shadow-sm text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-zinc-900 text-white rounded-tr-none font-medium'
                        : 'bg-white border border-zinc-100 text-zinc-700 rounded-tl-none font-medium'
                    }`}
                  >
                    {msg.content}
                  </div>
                  <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest px-2">
                    {new Date(msg.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
