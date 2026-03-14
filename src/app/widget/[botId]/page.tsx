'use client';

import { useChat } from 'ai/react';
import { Send, Bot as BotIcon, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { use } from 'react';
import { getPublicBotById } from '@/lib/actions/bot';

// ─── Types ───────────────────────────────────────────────────────────────────

type Segment = { type: 'text'; value: string } | { type: 'image'; url: string };
type Lang = 'my' | 'en';

// ─── Language Switch Divider ──────────────────────────────────────────────────
// Shown inline in the chat (like WhatsApp date dividers) when the user switches
// language. Messages above are still visible; AI only sees messages below.
function LangDivider({ lang }: { lang: Lang }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="flex-1 h-px bg-zinc-200" />
      <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest whitespace-nowrap">
        {lang === 'en' ? '🇬🇧 Switched to English' : '🇲🇲 မြန်မာဘာသာသို့ ပြောင်းလဲပြီ'}
      </span>
      <div className="flex-1 h-px bg-zinc-200" />
    </div>
  );
}

// ─── i18n Strings ─────────────────────────────────────────────────────────────

const i18n: Record<Lang, Record<string, string>> = {
  my: {
    onlineAssistant: 'အွန်လိုင်း လက်ထောက်',
    welcomeTitle: 'မင်္ဂလာပါ! {name} ဖြစ်ပါတယ်',
    welcomeDesc: 'ဘယ်အကြောင်းအရာမဆို မေးမြန်းနိုင်ပါတယ်ခင်ဗျာ 😊',
    inputPlaceholder: 'မက်ဆေ့ရေးပါ...',
  },
  en: {
    onlineAssistant: 'Online Assistant',
    welcomeTitle: "Hello! I'm {name}",
    welcomeDesc: "I'm here to help you with anything. Feel free to ask me anything! 😊",
    inputPlaceholder: 'Write a message...',
  },
};

function t(lang: Lang, key: string, vars?: Record<string, string>): string {
  let str = i18n[lang]?.[key] ?? i18n['en'][key] ?? key;
  if (vars)
    Object.entries(vars).forEach(([k, v]) => {
      str = str.replace(`{${k}}`, v);
    });
  return str;
}

// ─── Message parsers ──────────────────────────────────────────────────────────

function parseMessage(content: string): Segment[] {
  const segments: Segment[] = [];
  const regex = /\[PRODUCT_IMAGE:([^\]]+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex)
      segments.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    segments.push({ type: 'image', url: match[1].trim() });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < content.length) segments.push({ type: 'text', value: content.slice(lastIndex) });
  return segments;
}

function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**'))
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        if (part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
        return (
          <span key={i} style={{ whiteSpace: 'pre-wrap' }}>
            {part}
          </span>
        );
      })}
    </>
  );
}

function MessageContent({ content }: { content: string }) {
  const segments = parseMessage(content);
  return (
    <div className="space-y-2">
      {segments.map((seg, i) =>
        seg.type === 'image' ? (
          <div key={i} className="rounded-xl overflow-hidden border border-zinc-100 shadow-sm">
            <img
              src={seg.url}
              alt="Image"
              className="w-full max-w-60 object-cover rounded-xl"
              style={{ maxHeight: '240px' }}
              onError={e => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        ) : (
          <div key={i} className="text-sm leading-relaxed">
            <RichText text={seg.value} />
          </div>
        )
      )}
    </div>
  );
}

// ─── Language Toggle ──────────────────────────────────────────────────────────

function LangToggle({ lang, onToggle }: { lang: Lang; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-white/20 hover:bg-white/30 transition-all active:scale-95 border border-white/30"
      title={lang === 'my' ? 'Switch to English' : 'မြန်မာဘာသာသို့ ပြောင်းရန်'}
    >
      {/* Current language flag */}
      <img
        src={lang === 'my' ? '/MyanmarFlag.png' : '/UKFlag.png'}
        alt={lang === 'my' ? 'Myanmar' : 'English'}
        className="h-6 w-6 rounded-full object-cover border border-white/40 shadow-sm"
      />
      {/* Label */}
      <span className="text-white text-xs font-bold tracking-wide">
        {lang === 'my' ? 'MM' : 'EN'}
      </span>
    </button>
  );
}

// ─── Main Widget ──────────────────────────────────────────────────────────────

export default function ChatWidget({
  params: paramsPromise,
}: {
  params: Promise<{ botId: string }>;
}) {
  const params = use(paramsPromise);
  const botId = params.botId;
  const [bot, setBot] = useState<any>(null);

  // ── Persist language preference across refreshes (localStorage) ───────────────
  const [lang, setLang] = useState<Lang>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem(`lang_${botId}`) as Lang) ?? 'my';
    }
    return 'my';
  });

  // ── Single chatId for the whole session ───────────────────────────────────────
  const [chatId] = useState<string>(() => {
    const key = `chatId_${botId}`;
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem(key);
      if (stored) return stored;
    }
    const newId = Math.random().toString(36).substring(7);
    if (typeof window !== 'undefined') sessionStorage.setItem(key, newId);
    return newId;
  });

  // ── Track WHERE in the message list the language last switched ────────────────
  // The API will only use messages AFTER this index as AI context, so the old
  // language doesn't contaminate the new language session.
  // Each entry: { atIndex: number, lang: Lang }
  const [langSwitches, setLangSwitches] = useState<{ atIndex: number; lang: Lang }[]>([]);

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
    // Pass the index of the last language switch so the API can slice history
    body: { botId, chatId, lang, langSwitchIndex: langSwitches.at(-1)?.atIndex ?? 0 },
  });

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getPublicBotById(botId).then(data => setBot(data));
  }, [botId]);

  useEffect(() => {
    const viewport = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [messages]);

  const toggleLang = useCallback(() => {
    setLang(prev => {
      const next: Lang = prev === 'my' ? 'en' : 'my';

      // 1️⃣ Persist language preference
      localStorage.setItem(`lang_${botId}`, next);

      // 2️⃣ Record where in the message list the switch happened
      //    API will only send messages after this point as AI context
      setLangSwitches(s => [...s, { atIndex: messages.length, lang: next }]);

      return next;
    });
  }, [botId, messages.length]);

  if (!bot) return null;

  return (
    <div className="fixed inset-0 flex flex-col bg-white font-sans overflow-hidden">
      {/* ── Header ── */}
      <div
        className="px-4 py-4 flex flex-row items-center justify-between shadow-md z-10 shrink-0"
        style={{ backgroundColor: bot.primaryColor, color: '#fff' }}
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-md border border-white/30">
            <BotIcon className="h-6 w-6 text-white" />
          </div>
          <div>
            <CardTitle className="text-base font-bold leading-tight">{bot.name}</CardTitle>
            <p className="text-[10px] opacity-80 uppercase tracking-wider font-medium">
              {t(lang, 'onlineAssistant')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Flag toggle — shows the flag you will switch TO */}
          <LangToggle lang={lang} onToggle={toggleLang} />
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20 h-9 w-9 rounded-full transition-all"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20 h-9 w-9 rounded-full transition-all"
            onClick={() => window.parent.postMessage('closeWidget', '*')}
          >
            <span className="text-xl font-light">✕</span>
          </Button>
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-hidden bg-zinc-50/50 flex flex-col min-h-0">
        <ScrollArea ref={scrollRef} className="h-full p-4">
          <div className="space-y-6 pb-4">
            {/* Empty state */}
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-72 text-center space-y-4 animate-in fade-in zoom-in duration-500">
                <div className="h-20 w-20 rounded-3xl bg-white shadow-xl flex items-center justify-center border border-zinc-100 rotate-3">
                  <BotIcon className="h-10 w-10" style={{ color: bot.primaryColor }} />
                </div>
                <div className="space-y-2 px-6">
                  <h3 className="font-bold text-zinc-800 text-lg">
                    {t(lang, 'welcomeTitle', { name: bot.name })}
                  </h3>
                  <p className="text-zinc-500 text-sm leading-relaxed">{t(lang, 'welcomeDesc')}</p>
                </div>
              </div>
            )}

            {/* Message list + language switch dividers */}
            {messages.map((m, idx) => (
              <>
                {/* Insert a styled divider at each language switch point */}
                {langSwitches
                  .filter(sw => sw.atIndex === idx)
                  .map((sw, i) => (
                    <LangDivider key={`div-${i}`} lang={sw.lang} />
                  ))}

                <div
                  key={m.id}
                  className={`flex items-end gap-2 animate-in slide-in-from-bottom-2 duration-300 ${
                    m.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                  }`}
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  <Avatar
                    className={`h-8 w-8 mb-1 shadow-sm shrink-0 ${m.role === 'user' ? 'hidden' : 'flex'}`}
                  >
                    <AvatarFallback
                      style={{ backgroundColor: bot.primaryColor }}
                      className="text-white"
                    >
                      <BotIcon size={14} />
                    </AvatarFallback>
                  </Avatar>

                  <div
                    className={`max-w-[85%] px-4 py-3 shadow-sm ${
                      m.role === 'user'
                        ? 'bg-zinc-900 text-white rounded-2xl rounded-tr-none font-medium text-sm'
                        : 'bg-white text-zinc-800 rounded-2xl rounded-tl-none border border-zinc-100'
                    }`}
                  >
                    {m.role === 'user' ? (
                      <span className="text-sm">{m.content}</span>
                    ) : (
                      <MessageContent content={m.content} />
                    )}
                  </div>
                </div>
              </>
            ))}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex items-end gap-2 animate-in fade-in duration-300">
                <Avatar className="h-8 w-8 mb-1 shadow-sm flex shrink-0">
                  <AvatarFallback
                    style={{ backgroundColor: bot.primaryColor }}
                    className="text-white"
                  >
                    <BotIcon size={14} />
                  </AvatarFallback>
                </Avatar>
                <div className="bg-white rounded-2xl rounded-tl-none border border-zinc-100 px-4 py-3 shadow-sm flex gap-1 items-center h-10">
                  <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ── Input Area ── */}
      <div className="shrink-0 bg-white border-t border-zinc-100 shadow-[0_-4px_12px_rgba(0,0,0,0.03)]">
        <div className="p-4">
          <form onSubmit={handleSubmit} className="flex w-full items-center gap-3">
            <Input
              placeholder={t(lang, 'inputPlaceholder')}
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
    </div>
  );
}
