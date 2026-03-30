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
          <h2 className="text-3xl font-black tracking-tight text-zinc-900">My Agents</h2>
          <p className="text-zinc-500 font-medium">Manage and optimize your AI assistants</p>
        </div>
        <Button
          asChild
          className="rounded-full bg-zinc-900 hover:bg-zinc-800 shadow-lg hover:shadow-zinc-200 transition-all h-11 px-6"
        >
          <Link href="/dashboard/bots/new">
            <Plus className="mr-2 h-4 w-4" />
            Create Agent
          </Link>
        </Button>
      </div>

      {bots.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-20 text-center border-dashed border-2 bg-zinc-50/50">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm border border-zinc-100 mb-6 group-hover:scale-110 transition-transform">
            <BotIcon className="h-8 w-8 text-zinc-900" />
          </div>
          <CardTitle className="text-xl font-bold">No agents found</CardTitle>
          <CardDescription className="max-w-xs mt-2 text-zinc-500">
            Every great business needs a smart assistant. Create your first AI agent in seconds.
          </CardDescription>
          <Button asChild className="mt-8 rounded-full px-8" variant="outline">
            <Link href="/dashboard/bots/new">Deploy Now</Link>
          </Button>
        </Card>
      ) : (
        <div className="grid gap-6 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {bots.map(bot => {
            const botTypeLabel = {
              ecommerce: 'SHOP',
              service: 'INFO',
              appointment: 'BOOKING',
            }[bot.botType as string] || 'AGENT';

            const botTypeTheme = {
              ecommerce: 'bg-blue-50 text-blue-600 border-blue-100',
              service: 'bg-emerald-50 text-emerald-600 border-emerald-100',
              appointment: 'bg-violet-50 text-violet-600 border-violet-100',
            }[bot.botType as string] || 'bg-zinc-50 text-zinc-600 border-zinc-100';

            const botTypeSubtitle = {
              ecommerce: 'E-COMMERCE AGENT TYPE',
              service: 'SERVICE & INFO AGENT TYPE',
              appointment: 'BOOKING AGENT TYPE',
            }[bot.botType as string] || 'AI AGENT TYPE';

            const botTypeIcon = {
              ecommerce: '🛒',
              service: '📞',
              appointment: '📅',
            }[bot.botType as string] || '🤖';

            return (
              <Card
                key={bot.id}
                className="overflow-hidden border-none shadow-xl hover:shadow-2xl transition-all duration-300 group bg-white rounded-[32px] p-2"
              >
                <CardHeader className="pb-4 pt-6 px-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="h-12 w-12 rounded-2xl flex items-center justify-center bg-zinc-50 border border-zinc-100 text-blue-600 shadow-inner group-hover:scale-110 transition-transform duration-500">
                      <BotIcon className="h-6 w-6" />
                    </div>
                    <div className={`px-3 py-1.5 rounded-full border flex items-center gap-1.5 font-black text-[10px] tracking-widest ${botTypeTheme} animate-in fade-in zoom-in duration-700`}>
                      <span className="text-xs">{botTypeIcon}</span>
                      {botTypeLabel}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <CardTitle className="text-2xl font-black text-zinc-900 tracking-tight group-hover:translate-x-1 transition-transform">
                      {bot.name}
                    </CardTitle>
                    <p className="text-[10px] font-black text-zinc-300 tracking-[0.2em] uppercase">
                      {botTypeSubtitle}
                    </p>
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
