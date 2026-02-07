import Link from 'next/link';
import { Plus, Bot as BotIcon, Settings, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { getBots } from '@/lib/actions/bot';

export default async function BotsPage() {
  const bots = await getBots();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">My Bots</h2>
          <p className="text-muted-foreground">Manage and train your AI chatbots</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/bots/new">
            <Plus className="mr-2 h-4 w-4" />
            Create Bot
          </Link>
        </Button>
      </div>

      {bots.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-zinc-100 mb-4">
            <BotIcon className="h-6 w-6 text-zinc-900" />
          </div>
          <CardTitle>No bots yet</CardTitle>
          <CardDescription className="max-w-xs mt-2">
            Create your first bot and start training it with your documents.
          </CardDescription>
          <Button asChild className="mt-6" variant="outline">
            <Link href="/dashboard/bots/new text-sm">Create Now</Link>
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {bots.map(bot => (
            <Card key={bot.id} className="overflow-hidden">
              <div className="h-2 w-full" style={{ backgroundColor: bot.primaryColor }} />
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BotIcon className="h-5 w-5" />
                  {bot.name}
                </CardTitle>
                <CardDescription className="line-clamp-2">
                  {bot.systemPrompt || 'No system prompt set.'}
                </CardDescription>
              </CardHeader>
              <CardFooter className="flex justify-between border-t p-4 bg-zinc-50/50">
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/dashboard/bots/${bot.id}`}>
                    <Settings className="mr-2 h-4 w-4" />
                    Configure
                  </Link>
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/widget/${bot.id}`} target="_blank">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Preview
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
