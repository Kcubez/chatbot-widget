import Link from 'next/link';
import {
  Plus,
  Bot as BotIcon,
  Settings,
  ExternalLink,
  ArrowRight,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { getBots } from '@/lib/actions/bot';


export default async function BotsPage() {
  const bots = await getBots();

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-zinc-900">My Bots</h2>
          <p className="text-zinc-500 font-medium">Manage and optimize your AI bots</p>
        </div>
        <Button
          asChild
          className="rounded-full bg-zinc-900 hover:bg-zinc-800 shadow-lg hover:shadow-zinc-200 transition-all h-11 px-6"
        >
          <Link href="/dashboard/bots/new">
            <Plus className="mr-2 h-4 w-4" />
            Create Bot
          </Link>
        </Button>
      </div>

      {bots.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-20 text-center border-dashed border-2 bg-zinc-50/50">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm border border-zinc-100 mb-6">
            <BotIcon className="h-8 w-8 text-zinc-900" />
          </div>
          <CardTitle className="text-xl font-bold">No bots found</CardTitle>
          <CardDescription className="max-w-xs mt-2 text-zinc-500">
            Create your first AI bot to get started.
          </CardDescription>
          <Button asChild className="mt-8 rounded-full px-8" variant="outline">
            <Link href="/dashboard/bots/new">Get Started</Link>
          </Button>
        </Card>
      ) : (
        <div className="grid gap-6 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {bots.map(bot => {
            // ─── Category display config ───────────────────────────────
            const category = (bot as any).botCategory || 'website_bot';

            const CATEGORY_CONFIG: Record<string, { label: string; subtitle: string; icon: string; theme: string }> = {
              website_bot:   { label: 'WEB',        subtitle: 'WEBSITE CHATBOT',          icon: '🌐', theme: 'bg-blue-50 text-blue-600 border-blue-100' },
              first_day_pro: { label: 'FIRST DAY',  subtitle: 'EMPLOYEE ONBOARDING',       icon: '💼', theme: 'bg-amber-50 text-amber-600 border-amber-100' },
              messenger_sale:{ label: 'MESSENGER',  subtitle: 'MESSENGER SALE BOT',        icon: '💬', theme: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
              telegram_sale: { label: 'TELEGRAM',   subtitle: 'TELEGRAM SALE BOT',         icon: '✈️', theme: 'bg-sky-50 text-sky-600 border-sky-100' },
              telegram_agentic_sale: { label: 'AGENTIC', subtitle: 'AUTONOMOUS SALES AGENT', icon: '🤖', theme: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
            };

            const { label, subtitle, icon, theme } = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG['website_bot'];

            // ─── Sub-type badge (only for sale bots) ──────────────────
            const isSale = category === 'messenger_sale' || category === 'telegram_sale' || category === 'telegram_agentic_sale';
            const subTypeLabel: Record<string, string> = { ecommerce: '🛒 Shop', service: '📞 Service', appointment: '📅 Booking' };
            const subType = isSale ? (subTypeLabel[bot.botType as string] || '') : '';

            return (
              <Card
                key={bot.id}
                className="overflow-hidden border-none shadow-xl hover:shadow-2xl transition-all duration-300 group bg-white rounded-[32px] p-2"
              >
                <CardHeader className="pb-4 pt-6 px-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="h-12 w-12 rounded-2xl flex items-center justify-center bg-zinc-50 border border-zinc-100 text-2xl shadow-inner group-hover:scale-110 transition-transform duration-500">
                      {icon}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className={`px-3 py-1.5 rounded-full border flex items-center gap-1.5 font-black text-[10px] tracking-widest ${theme} animate-in fade-in zoom-in duration-700`}>
                        {label}
                      </div>
                      {subType && (
                        <span className="text-[9px] font-bold text-zinc-400 tracking-widest uppercase">{subType}</span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <CardTitle className="text-2xl font-black text-zinc-900 tracking-tight group-hover:translate-x-1 transition-transform">
                      {bot.name}
                    </CardTitle>
                    <p className="text-[10px] font-black text-zinc-300 tracking-[0.2em] uppercase">{subtitle}</p>
                  </div>
                </CardHeader>
                <CardFooter className="pt-4 pb-6 px-6">
                  <Button
                    variant="outline"
                    asChild
                    className="w-full rounded-2xl h-14 font-black border-zinc-100 bg-white hover:bg-zinc-50 hover:border-zinc-200 shadow-sm transition-all active:scale-95 text-base"
                  >
                    <Link href={`/dashboard/bots/${bot.id}`}>
                      <Settings className="mr-2 h-5 w-5 text-zinc-400 group-hover:rotate-45 transition-transform duration-500" />
                      Configure
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}


