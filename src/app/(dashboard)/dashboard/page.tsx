import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Bot,
  MessageSquare,
  Users,
  Zap,
  Info,
  Sparkles,
  Plus,
  ArrowRight,
  History,
  BarChart3,
} from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) return null;

  const [botsCount, conversationsCount, totalDocuments, recentBots] = await Promise.all([
    prisma.bot.count({ where: { userId: session.user.id } }),
    prisma.conversation.count({
      where: {
        bot: { userId: session.user.id },
      },
    }),
    prisma.document.count({
      where: {
        bot: { userId: session.user.id },
      },
    }),
    prisma.bot.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 3,
    }),
  ]);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Welcome Notification Banner */}
      <div className="bg-zinc-900 rounded-3xl p-8 text-white flex flex-col lg:flex-row items-center justify-between gap-6 border border-zinc-800 shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-[100px] group-hover:bg-blue-600/20 transition-colors duration-700" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-600/5 rounded-full translate-y-1/2 -translate-x-1/2 blur-[80px]" />

        <div className="flex flex-col md:flex-row items-center gap-6 relative z-10 w-full lg:w-auto text-center md:text-left">
          <div className="h-20 w-20 rounded-2xl bg-white/5 flex items-center justify-center backdrop-blur-xl border border-white/10 shadow-inner group-hover:scale-110 transition-transform duration-500">
            <Sparkles className="h-10 w-10 text-blue-400" />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
              Welcome back, {session.user.name || 'Admin'}! 👋
            </h2>
            <p className="text-zinc-400 text-base max-w-md">
              Your AI ecosystem is thriving. You have{' '}
              <span className="text-white font-semibold">{botsCount} active bots</span> serving your
              customers right now.
            </p>
          </div>
        </div>

        <div className="flex flex-row items-center gap-4 relative z-10">
          <div className="px-5 py-2.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-black tracking-widest flex items-center gap-2.5 shadow-sm">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
            SYSTEM OPERATIONAL
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            title: 'Total Bots',
            value: botsCount,
            icon: Bot,
            desc: 'AI instances',
            color: 'text-blue-500',
            bg: 'bg-blue-500/10',
          },
          {
            title: 'Total Chats',
            value: conversationsCount,
            icon: MessageSquare,
            desc: 'Successful chats',
            color: 'text-purple-500',
            bg: 'bg-purple-500/10',
          },
          {
            title: 'Knowledge',
            value: totalDocuments,
            icon: Users,
            desc: 'Docs trained',
            color: 'text-amber-500',
            bg: 'bg-amber-500/10',
          },
          {
            title: 'AI Status',
            value: 'Live',
            icon: Zap,
            desc: 'Response ready',
            color: 'text-emerald-500',
            bg: 'bg-emerald-500/10',
          },
        ].map((stat, i) => (
          <Card
            key={i}
            className="border-none shadow-xl bg-white/70 backdrop-blur-md hover:shadow-2xl transition-all duration-300 group overflow-hidden relative"
          >
            <div
              className={`absolute top-0 right-0 w-24 h-24 ${stat.bg} rounded-bl-full translate-x-8 -translate-y-8 blur-2xl group-hover:scale-150 transition-transform duration-500`}
            />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
              <CardTitle className="text-sm font-bold text-zinc-500 uppercase tracking-wider">
                {stat.title}
              </CardTitle>
              <stat.icon
                className={`h-5 w-5 ${stat.color} group-hover:scale-125 transition-transform`}
              />
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-3xl font-black text-zinc-900 tracking-tight">{stat.value}</div>
              <p className="text-xs text-zinc-400 font-medium mt-1">{stat.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        {/* Quick Actions */}
        <Card className="lg:col-span-1 border-none shadow-xl bg-white relative overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              Quick Actions
            </CardTitle>
            <CardDescription>Get things done faster</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button
              asChild
              variant="outline"
              className="justify-start h-12 rounded-xl hover:bg-zinc-50 border-zinc-100 shadow-sm transition-all group"
            >
              <Link href="/dashboard/bots/new">
                <Plus className="mr-3 h-4 w-4 text-zinc-400 group-hover:text-zinc-900" />
                <span>Build New AI Agent</span>
                <ArrowRight className="ml-auto h-4 w-4 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="justify-start h-12 rounded-xl hover:bg-zinc-50 border-zinc-100 shadow-sm transition-all group"
            >
              <Link href="/dashboard/conversations">
                <History className="mr-3 h-4 w-4 text-zinc-400 group-hover:text-zinc-900" />
                <span>Review History</span>
                <ArrowRight className="ml-auto h-4 w-4 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="justify-start h-12 rounded-xl hover:bg-zinc-50 border-zinc-100 shadow-sm transition-all group"
            >
              <Link href="/dashboard/settings">
                <BarChart3 className="mr-3 h-4 w-4 text-zinc-400 group-hover:text-zinc-900" />
                <span>View Analytics</span>
                <ArrowRight className="ml-auto h-4 w-4 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Recent Bots */}
        <Card className="lg:col-span-2 border-none shadow-xl bg-white">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Your Recent Agents</CardTitle>
              <CardDescription>Manage your latest creations</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild className="text-zinc-500">
              <Link href="/dashboard/bots">View All</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentBots.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground italic">
                No agents created yet. Let's build one!
              </div>
            ) : (
              <div className="space-y-4">
                {recentBots.map(bot => (
                  <Link
                    key={bot.id}
                    href={`/dashboard/bots/${bot.id}`}
                    className="flex items-center p-4 rounded-2xl bg-zinc-50/50 hover:bg-zinc-50 border border-transparent hover:border-zinc-100 transition-all group"
                  >
                    <div
                      className="h-12 w-12 rounded-xl flex items-center justify-center mr-4 shadow-sm"
                      style={{ backgroundColor: bot.primaryColor + '20' }}
                    >
                      <Bot className="h-6 w-6" style={{ color: bot.primaryColor }} />
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-zinc-900">{bot.name}</div>
                      <div className="text-xs text-zinc-400">
                        Created {new Date(bot.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full group-hover:bg-white group-hover:shadow-sm"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
