'use client';

import { useChat } from 'ai/react';
import { Send, Bot as BotIcon, User, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

import { use } from 'react';
import { getPublicBotById } from '@/lib/actions/bot';

export default function ChatWidget({
  params: paramsPromise,
}: {
  params: Promise<{ botId: string }>;
}) {
  const params = use(paramsPromise);
  const botId = params.botId;
  const [bot, setBot] = useState<any>(null);
  const [chatId] = useState(() => Math.random().toString(36).substring(7));

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
    body: {
      botId: botId,
      chatId: chatId,
    },
  });

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadBot() {
      const data = await getPublicBotById(botId);
      setBot(data);
    }
    loadBot();
  }, [botId]);

  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  if (!bot) return null;

  return (
    <div className="fixed inset-0 flex flex-col bg-white font-sans overflow-hidden">
      <div
        className="px-4 py-4 flex flex-row items-center justify-between shadow-md z-10"
        style={{ backgroundColor: bot.primaryColor, color: '#fff' }}
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-md border border-white/30">
            <BotIcon className="h-6 w-6 text-white" />
          </div>
          <div>
            <CardTitle className="text-base font-bold leading-tight">{bot.name}</CardTitle>
            <p className="text-[10px] opacity-80 uppercase tracking-wider font-medium">
              Online Assistant
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20 h-9 w-9 rounded-full transition-all"
            onClick={() => window.location.reload()}
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20 h-9 w-9 rounded-full transition-all"
            onClick={() => window.parent.postMessage('closeWidget', '*')}
            title="Close"
          >
            <span className="text-xl font-light">✕</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden bg-zinc-50/50 flex flex-col">
        <ScrollArea ref={scrollRef} className="h-full p-4">
          <div className="space-y-6 pb-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-75 text-center space-y-4 animate-in fade-in zoom-in duration-500">
                <div className="h-20 w-20 rounded-3xl bg-white shadow-xl flex items-center justify-center border border-zinc-100 rotate-3">
                  <BotIcon className="h-10 w-10" style={{ color: bot.primaryColor }} />
                </div>
                <div className="space-y-2 px-6">
                  <h3 className="font-bold text-zinc-800 text-lg">Hello! I'm {bot.name}</h3>
                  <p className="text-zinc-500 text-sm leading-relaxed">
                    I'm here to help you with anything you need. Just type a message below to get
                    started!
                  </p>
                </div>
              </div>
            )}
            {messages.map((m, idx) => (
              <div
                key={m.id}
                className={`flex items-end gap-2 animate-in slide-in-from-bottom-2 duration-300 ${
                  m.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                }`}
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <Avatar
                  className={`h-8 w-8 mb-1 shadow-sm ${m.role === 'user' ? 'hidden' : 'flex'}`}
                >
                  <AvatarFallback
                    style={{ backgroundColor: bot.primaryColor }}
                    className="text-white"
                  >
                    <BotIcon size={14} />
                  </AvatarFallback>
                </Avatar>
                <div
                  className={`max-w-[85%] px-4 py-3 text-sm shadow-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-zinc-900 text-white rounded-2xl rounded-tr-none font-medium'
                      : 'bg-white text-zinc-800 rounded-2xl rounded-tl-none border border-zinc-100'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex items-end gap-2 animate-in fade-in duration-300">
                <Avatar className="h-8 w-8 mb-1 shadow-sm flex">
                  <AvatarFallback
                    style={{ backgroundColor: bot.primaryColor }}
                    className="text-white"
                  >
                    <BotIcon size={14} />
                  </AvatarFallback>
                </Avatar>
                <div className="bg-white text-zinc-800 rounded-2xl rounded-tl-none border border-zinc-100 px-4 py-3 shadow-sm flex gap-1 items-center h-10">
                  <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce"></span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="p-4 bg-white border-t border-zinc-100 shadow-[0_-4px_12px_rgba(0,0,0,0.02)]">
        <form onSubmit={handleSubmit} className="flex w-full items-center gap-3">
          <Input
            placeholder="Write a message..."
            value={input}
            onChange={handleInputChange}
            className="flex-1 rounded-2xl bg-zinc-50 border-zinc-200 focus-visible:ring-offset-0 h-12 px-5 text-sm transition-all focus-visible:ring-1"
            style={{ '--tw-ring-color': bot.primaryColor } as any}
            disabled={isLoading}
          />
          <Button
            type="submit"
            size="icon"
            className="rounded-2xl h-12 w-12 shrink-0 shadow-lg hover:shadow-xl transition-all active:scale-95"
            style={{ backgroundColor: bot.primaryColor }}
            disabled={isLoading || !input.trim()}
          >
            <Send className="h-5 w-5" />
          </Button>
        </form>
      </div>
    </div>
  );
}
