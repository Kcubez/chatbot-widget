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
import { Badge } from '@/components/ui/badge';

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
          {bots.map(bot => (
            <Card
              key={bot.id}
              className="overflow-hidden border-none shadow-xl hover:shadow-2xl transition-all duration-300 group bg-white"
            >
              <div className="h-2 w-full" style={{ backgroundColor: bot.primaryColor }} />
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between mb-2">
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center bg-zinc-50 group-hover:scale-110 transition-transform"
                    style={{ color: bot.primaryColor }}
                  >
                    <BotIcon className="h-5 w-5" />
                  </div>
                  <Badge
                    variant="secondary"
                    className="bg-zinc-100 text-zinc-600 font-bold text-[10px] uppercase tracking-tighter"
                  >
                    Active
                  </Badge>
                </div>
                <CardTitle className="text-xl font-black text-zinc-900 group-hover:text-zinc-800 transition-colors">
                  {bot.name}
                </CardTitle>
                <CardDescription className="line-clamp-2 min-h-10 text-zinc-500 font-medium leading-relaxed mt-2">
                  {bot.systemPrompt || 'No specialized instructions set.'}
                </CardDescription>
              </CardHeader>
              <CardFooter className="flex items-center gap-2 pt-0 pb-6 px-6">
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="flex-1 rounded-xl h-10 font-bold border-zinc-200"
                >
                  <Link href={`/dashboard/bots/${bot.id}`}>
                    <Settings className="mr-2 h-4 w-4" />
                    Configure
                  </Link>
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  asChild
                  className="rounded-xl h-10 w-10 shrink-0"
                >
                  <Link href={`/widget/${bot.id}`} target="_blank">
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
