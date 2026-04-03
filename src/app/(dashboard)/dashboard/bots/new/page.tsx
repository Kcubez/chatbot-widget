'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import Link from 'next/link';
import { createBot } from '@/lib/actions/bot';
import { getUserAllowedChannels } from '@/lib/actions/user';

// ─── Bot Category Definitions ───────────────────────────────────────────────

const BOT_CATEGORIES = [
  {
    id: 'website_bot',
    label: 'Website Chatbot',
    icon: '🌐',
    desc: 'Embeddable AI assistant widget for any website. Supports RAG knowledge base.',
    color: 'blue',
  },
  {
    id: 'first_day_pro',
    label: 'First Day Pro',
    icon: '💼',
    desc: 'Telegram bot for new employee onboarding. Step-by-step verification & announcements.',
    color: 'amber',
  },
  {
    id: 'messenger_sale',
    label: 'Messenger Sale Bot',
    icon: '💬',
    desc: 'Facebook Messenger bot for sales, orders, appointments & customer support.',
    color: 'indigo',
  },
  {
    id: 'telegram_sale',
    label: 'Telegram Sale Bot',
    icon: '✈️',
    desc: 'Telegram bot for sales, orders, appointments & customer support via Telegram.',
    color: 'sky',
  },
] as const;

// ─── Bot Sub-Types (for Sale bots only) ─────────────────────────────────────

const BOT_TYPES = [
  {
    id: 'ecommerce',
    label: 'Online Shop',
    icon: '🛒',
    desc: 'Sell products, manage stock, and automate the ordering process.',
  },
  {
    id: 'service',
    label: 'Service & Info',
    icon: '📞',
    desc: 'Customer support, service listings, and general inquiries.',
  },
  {
    id: 'appointment',
    label: 'Booking',
    icon: '📅',
    desc: 'Appointments, reservations, and time-based services.',
  },
] as const;

// ─── Color utilities ─────────────────────────────────────────────────────────

type CategoryColor = 'blue' | 'amber' | 'indigo' | 'sky';

const COLORS: Record<CategoryColor, { active: string; ring: string; icon: string; badge?: string }> = {
  blue:  { active: 'border-blue-600 bg-blue-50/30 shadow-xl shadow-blue-50 ring-4 ring-blue-600/5', ring: 'bg-blue-600 shadow-lg shadow-blue-200', icon: 'h-6 w-6 rounded-full flex items-center justify-center font-black text-sm shadow-lg shadow-blue-100 text-white bg-blue-600' },
  amber: { active: 'border-amber-500 bg-amber-50/30 shadow-xl shadow-amber-50 ring-4 ring-amber-500/5', ring: 'bg-amber-500 shadow-lg shadow-amber-200', icon: 'h-6 w-6 rounded-full flex items-center justify-center font-black text-sm shadow-lg shadow-amber-100 text-white bg-amber-500' },
  indigo:{ active: 'border-indigo-600 bg-indigo-50/30 shadow-xl shadow-indigo-50 ring-4 ring-indigo-600/5', ring: 'bg-indigo-600 shadow-lg shadow-indigo-200', icon: 'h-6 w-6 rounded-full flex items-center justify-center font-black text-sm shadow-lg shadow-indigo-100 text-white bg-indigo-600' },
  sky:   { active: 'border-sky-500 bg-sky-50/30 shadow-xl shadow-sky-50 ring-4 ring-sky-500/5', ring: 'bg-sky-500 shadow-lg shadow-sky-200', icon: 'h-6 w-6 rounded-full flex items-center justify-center font-black text-sm shadow-lg shadow-sky-100 text-white bg-sky-500' },
};

const isSaleBot = (cat: string) => cat === 'messenger_sale' || cat === 'telegram_sale';

const DEFAULT_PROMPTS: Record<string, string> = {
  ecommerce:   'You are a helpful e-commerce assistant. Help customers browse products, answer questions about pricing and availability, and guide them through the ordering process.',
  service:     'You are a helpful customer service assistant. Answer inquiries, provide information about services, and assist customers with their needs.',
  appointment: 'You are a booking assistant. Help customers schedule appointments, check availability, and manage their reservations.',
  website_bot: 'You are a helpful AI assistant. Answer questions based on the knowledge base provided.',
  first_day_pro: 'You are an onboarding assistant for new employees. Guide them through the onboarding steps and answer their questions.',
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function NewBotPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [botCategory, setBotCategory] = useState<string>('');
  const [botType, setBotType] = useState<string>('ecommerce');
  const [allowedChannels, setAllowedChannels] = useState<string[]>([]);
  const [isReady, setIsReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    async function loadData() {
      try {
        const channels = await getUserAllowedChannels();
        setAllowedChannels(channels);
        if (channels.length > 0) {
          setBotCategory(channels[0]);
        }
      } catch (error) {
        console.error('Failed to load user permissions:', error);
      } finally {
        setIsReady(true);
      }
    }
    loadData();
  }, []);

  const filteredCategories = BOT_CATEGORIES.filter(cat => allowedChannels.includes(cat.id));
  const activeCategoryColor = (BOT_CATEGORIES.find(c => c.id === botCategory)?.color ?? 'blue') as CategoryColor;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    formData.append('botCategory', botCategory);
    formData.append('botType', isSaleBot(botCategory) ? botType : 'service');

    const promptKey = isSaleBot(botCategory) ? botType : botCategory;
    if (!formData.get('systemPrompt')) {
      formData.set('systemPrompt', DEFAULT_PROMPTS[promptKey] || DEFAULT_PROMPTS['service']);
    }

    try {
      const bot = await createBot(formData);
      toast.success('Bot created successfully!');
      router.push(`/dashboard/bots/${bot.id}`);
    } catch {
      toast.error('Failed to create bot');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild className="rounded-full shrink-0">
          <Link href="/dashboard/bots">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h2 className="text-3xl font-black tracking-tight text-zinc-900">Create New Bot</h2>
          <p className="text-zinc-500 font-medium">Choose a platform and configure your bot.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-10">

        {/* ── Step 1: Platform Category ──────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 ml-1">
            <div className={COLORS[activeCategoryColor].icon}>1</div>
            <Label className="text-lg font-black text-zinc-800">Select Platform</Label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {isReady ? (
              filteredCategories.length > 0 ? (
                filteredCategories.map(cat => {
                  const isActive = botCategory === cat.id;
                  const colMap: Record<CategoryColor, string> = {
                    blue:   'border-blue-600 bg-blue-50/30 ring-4 ring-blue-600/5',
                    amber:  'border-amber-500 bg-amber-50/30 ring-4 ring-amber-500/5',
                    indigo: 'border-indigo-600 bg-indigo-50/30 ring-4 ring-indigo-600/5',
                    sky:    'border-sky-500 bg-sky-50/30 ring-4 ring-sky-500/5',
                  };
                  const iconMap: Record<CategoryColor, string> = {
                    blue:   'bg-blue-600 shadow-lg shadow-blue-200',
                    amber:  'bg-amber-500 shadow-lg shadow-amber-200',
                    indigo: 'bg-indigo-600 shadow-lg shadow-indigo-200',
                    sky:    'bg-sky-500 shadow-lg shadow-sky-200',
                  };
                  const textMap: Record<CategoryColor, string> = {
                    blue:   'text-blue-900',
                    amber:  'text-amber-900',
                    indigo: 'text-indigo-900',
                    sky:    'text-sky-900',
                  };
                  const glowMap: Record<CategoryColor, string> = {
                    blue:   'bg-blue-400',
                    amber:  'bg-amber-400',
                    indigo: 'bg-indigo-400',
                    sky:    'bg-sky-400',
                  };

                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setBotCategory(cat.id)}
                      className={`group relative p-6 rounded-3xl border-2 transition-all text-left flex flex-col items-start gap-4 overflow-hidden shadow-sm ${
                        isActive
                          ? 'shadow-xl ' + colMap[cat.color]
                          : 'border-zinc-100 bg-white hover:border-zinc-300 hover:shadow-lg'
                      }`}
                    >
                      <div
                        className={`h-14 w-14 rounded-2xl flex items-center justify-center text-3xl transition-all duration-500 ${
                          isActive
                            ? iconMap[cat.color] + ' scale-110 -rotate-6'
                            : 'bg-zinc-50 group-hover:bg-zinc-100'
                        }`}
                      >
                        {cat.icon}
                      </div>

                      <div>
                        <h3 className={`font-black text-lg ${isActive ? textMap[cat.color] : 'text-zinc-800'}`}>
                          {cat.label}
                        </h3>
                        <p className="text-xs text-zinc-500 font-medium leading-relaxed mt-1">{cat.desc}</p>
                      </div>

                      {isActive && (
                        <div className="absolute top-4 right-4 h-6 w-6 bg-current rounded-full flex items-center justify-center border-2 border-white shadow-md animate-in zoom-in duration-300 text-white">
                          <Check className="h-3.5 w-3.5 stroke-3" />
                        </div>
                      )}

                      <div
                        className={`absolute -bottom-2 -right-2 h-24 w-24 rounded-full blur-3xl opacity-20 transition-all duration-700 ${
                          isActive ? glowMap[cat.color] + ' scale-150' : 'bg-transparent'
                        }`}
                      />
                    </button>
                  );
                })
              ) : (
                <div className="col-span-full py-12 px-6 rounded-3xl border-2 border-dashed border-zinc-200 bg-zinc-50/50 text-center flex flex-col items-center gap-4">
                  <div className="h-16 w-16 rounded-full bg-white shadow-sm flex items-center justify-center text-2xl grayscale opacity-50">
                    🚫
                  </div>
                  <div>
                    <h3 className="font-bold text-zinc-900">No Access Granted</h3>
                    <p className="text-zinc-500 text-sm max-w-xs mx-auto mt-1">
                      You do not have permission to create any bots yet. Please contact your administrator.
                    </p>
                  </div>
                </div>
              )
            ) : (
              [1, 2].map(i => (
                <div key={i} className="h-40 rounded-3xl bg-zinc-50 animate-pulse border border-zinc-100" />
              ))
            )}
          </div>
        </div>

        {isReady && filteredCategories.length > 0 && (
          <>
            {/* ── Step 2: Sub-Type (Sale bots only) ─────────────────────────── */}
            {isSaleBot(botCategory) && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center gap-3 ml-1">
                  <div className="h-8 w-8 rounded-full bg-zinc-900 text-white flex items-center justify-center font-black text-sm shadow-lg shadow-zinc-100">
                    2
                  </div>
                  <Label className="text-lg font-black text-zinc-800">Select Bot Type</Label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {BOT_TYPES.map(type => (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setBotType(type.id)}
                      className={`group relative p-6 rounded-3xl border-2 transition-all text-left flex flex-col items-start gap-4 overflow-hidden ${
                        botType === type.id
                          ? 'border-blue-600 bg-blue-50/30 shadow-xl shadow-blue-50 ring-4 ring-blue-600/5'
                          : 'border-zinc-100 bg-white hover:border-zinc-300 hover:shadow-lg'
                      }`}
                    >
                      <div
                        className={`h-14 w-14 rounded-2xl flex items-center justify-center text-3xl transition-all duration-500 ${
                          botType === type.id
                            ? 'bg-blue-600 shadow-lg shadow-blue-200 scale-110 -rotate-6'
                            : 'bg-zinc-50 group-hover:bg-zinc-100'
                        }`}
                      >
                        {type.icon}
                      </div>
                      <div>
                        <h3 className={`font-black text-lg ${botType === type.id ? 'text-blue-900' : 'text-zinc-800'}`}>
                          {type.label}
                        </h3>
                        <p className="text-xs text-zinc-500 font-medium leading-relaxed mt-1">{type.desc}</p>
                      </div>
                      {botType === type.id && (
                        <div className="absolute top-4 right-4 h-6 w-6 bg-blue-600 rounded-full flex items-center justify-center border-2 border-white shadow-md animate-in zoom-in duration-300">
                          <Check className="h-3.5 w-3.5 text-white stroke-3" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Step 3 (or 2): Name ─────────────────────────────────────────── */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 ml-1">
                <div className="h-8 w-8 rounded-full bg-zinc-900 text-white flex items-center justify-center font-black text-sm shadow-lg shadow-zinc-100">
                  {isSaleBot(botCategory) ? 3 : 2}
                </div>
                <Label htmlFor="name" className="text-lg font-black text-zinc-800">
                  Name Your Bot
                </Label>
              </div>

              <div className="rounded-[32px] shadow-xl bg-white overflow-hidden border border-zinc-100">
                <CardContent className="p-8">
                  <div className="space-y-2">
                    <Input
                      id="name"
                      name="name"
                      placeholder="e.g. KK Shop Assistant"
                      required
                      className="h-16 text-xl rounded-2xl bg-zinc-50/50 focus:ring-4 focus:ring-blue-50 font-bold px-6 placeholder:text-zinc-300 transition-all focus:bg-white border-2 border-transparent focus:border-blue-100"
                    />
                    <p className="text-xs text-zinc-400 ml-1 font-black uppercase tracking-widest leading-none mt-2">
                      Primary identity for your bot in the dashboard.
                    </p>
                  </div>
                </CardContent>
                <CardFooter className="bg-zinc-50/50 p-6 flex flex-col sm:flex-row gap-4 border-t border-zinc-100">
                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="h-14 px-10 rounded-2xl bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-100 font-black text-lg transition-all active:scale-95 flex-1 sm:flex-none"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Creating Bot...
                      </>
                    ) : (
                      'Create Bot'
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    asChild
                    disabled={isLoading}
                    className="h-14 rounded-2xl font-bold text-zinc-500 hover:text-zinc-900"
                  >
                    <Link href="/dashboard/bots">Cancel</Link>
                  </Button>
                </CardFooter>
              </div>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
