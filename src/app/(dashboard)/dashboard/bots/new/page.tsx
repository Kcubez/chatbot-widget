'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import Link from 'next/link';
import { createBot } from '@/lib/actions/bot';

export default function NewBotPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [primaryColor, setPrimaryColor] = useState('#3b82f6');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);

    try {
      const bot = await createBot(formData);
      toast.success('Bot created successfully!');
      router.push(`/dashboard/bots/${bot.id}`);
    } catch (err) {
      toast.error('Failed to create bot');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/bots">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h2 className="text-3xl font-bold tracking-tight">Create New Bot</h2>
      </div>

      <Card>
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>Bot Details</CardTitle>
            <CardDescription>
              Configure the basic identity and behavior of your chatbot.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Bot Name</Label>
              <Input id="name" name="name" placeholder="e.g. Customer Support Hero" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="systemPrompt">System Prompt</Label>
              <Textarea
                id="systemPrompt"
                name="systemPrompt"
                placeholder="Give your bot instructions on how to behave, e.g. 'You are a helpful assistant for my online shop...'"
                className="min-h-37.5"
                required
              />
            </div>
            <div className="space-y-3">
              <Label htmlFor="primaryColor">Theme Color</Label>
              <div className="flex flex-wrap gap-4 items-center">
                <div className="relative group">
                  <div
                    className="w-12 h-12 rounded-xl border-2 border-zinc-200 shadow-sm cursor-pointer transition-all hover:border-zinc-400 group-hover:scale-105"
                    style={{ backgroundColor: primaryColor }}
                  />
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={e => setPrimaryColor(e.target.value)}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  />
                </div>
                <div className="flex-1 max-w-45">
                  <Input
                    id="primaryColor"
                    name="primaryColor"
                    value={primaryColor}
                    onChange={e => setPrimaryColor(e.target.value)}
                    className="font-mono text-sm uppercase"
                    placeholder="#HEX"
                  />
                </div>
                <div className="h-8 w-px bg-zinc-200 hidden sm:block" />
                <div className="flex gap-2">
                  {['#3b82f6', '#10b981', '#f43f5e', '#f59e0b', '#71717a', '#000000'].map(color => (
                    <button
                      key={color}
                      type="button"
                      className="w-8 h-8 rounded-lg border border-zinc-200 shadow-sm transition-all hover:scale-110 active:scale-95 focus:ring-2 focus:ring-zinc-400 focus:outline-hidden"
                      style={{ backgroundColor: color }}
                      onClick={() => setPrimaryColor(color)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2 border-t p-6">
            <Button variant="outline" asChild disabled={isLoading}>
              <Link href="/dashboard/bots">Cancel</Link>
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Bot'
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
