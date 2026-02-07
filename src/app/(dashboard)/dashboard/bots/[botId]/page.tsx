'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  Save,
  Trash,
  FileText,
  Plus,
  Copy,
  Check,
  ExternalLink,
  ArrowRight,
} from 'lucide-react';
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
import { getBotById, updateBot, deleteBot, addDocument } from '@/lib/actions/bot';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { use } from 'react';

export default function BotDetailsPage({
  params: paramsPromise,
}: {
  params: Promise<{ botId: string }>;
}) {
  const params = use(paramsPromise);
  const botId = params.botId;
  const [bot, setBot] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newDoc, setNewDoc] = useState('');
  const [copied, setCopied] = useState(false);
  const [primaryColor, setPrimaryColor] = useState('#3b82f6');
  const router = useRouter();

  useEffect(() => {
    async function loadBot() {
      try {
        const data = await getBotById(botId);
        setBot(data);
        if (data?.primaryColor) setPrimaryColor(data.primaryColor);
      } catch (err) {
        toast.error('Failed to load bot');
        router.push('/dashboard/bots');
      } finally {
        setIsLoading(false);
      }
    }
    loadBot();
  }, [botId, router]);

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      systemPrompt: formData.get('systemPrompt') as string,
      primaryColor: formData.get('primaryColor') as string,
    };

    try {
      await updateBot(botId, data);
      toast.success('Settings saved');
    } catch (err) {
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddDoc = async () => {
    if (!newDoc.trim()) return;
    setIsSaving(true);
    try {
      await addDocument(botId, newDoc);
      toast.success('Knowledge added');
      setNewDoc('');
      const updated = await getBotById(botId);
      setBot(updated);
    } catch (err) {
      toast.error('Failed to add knowledge');
    } finally {
      setIsSaving(false);
    }
  };

  const copySnippet = () => {
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (typeof window !== 'undefined' ? window.location.origin : '');
    const snippet = `<script 
    src="${baseUrl}/widget-loader.js" 
    data-bot-id="${bot.id}" 
    defer
></script>`;
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Snippet copied!');
  };

  if (isLoading) {
    return (
      <div className="flex h-100 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-2">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild className="rounded-full shrink-0">
            <Link href="/dashboard/bots">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h2 className="text-3xl font-black text-zinc-900 tracking-tight line-clamp-1">
            {bot.name}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            asChild
            className="rounded-full h-10 px-4 font-bold border-zinc-200"
          >
            <Link href={`/widget/${bot.id}`} target="_blank">
              <ExternalLink className="mr-2 h-4 w-4" />
              Preview
            </Link>
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="rounded-full h-10 px-4 font-bold shadow-lg shadow-rose-100"
            onClick={async () => {
              if (confirm('Are you sure? This will delete all data for this agent.')) {
                await deleteBot(bot.id);
                router.push('/dashboard/bots');
              }
            }}
          >
            <Trash className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <Tabs defaultValue="settings" className="w-full">
        <TabsList className="grid grid-cols-3 w-full h-12 bg-zinc-100/50 rounded-2xl p-1 border border-zinc-100/50 shadow-sm md:max-w-xl md:mx-auto">
          <TabsTrigger
            value="settings"
            className="rounded-xl text-xs sm:text-sm font-bold transition-all data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm data-[state=inactive]:text-zinc-500 hover:text-zinc-700"
          >
            Settings
          </TabsTrigger>
          <TabsTrigger
            value="knowledge"
            className="rounded-xl text-xs sm:text-sm font-bold transition-all data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm data-[state=inactive]:text-zinc-500 hover:text-zinc-700"
          >
            Knowledge Base
          </TabsTrigger>
          <TabsTrigger
            value="install"
            className="rounded-xl text-xs sm:text-sm font-bold transition-all data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm data-[state=inactive]:text-zinc-500 hover:text-zinc-700"
          >
            Installation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="mt-6">
          <Card>
            <form onSubmit={handleUpdate}>
              <CardHeader>
                <CardTitle>Configuration</CardTitle>
                <CardDescription>Update your bot's identity and behavior.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Bot Name</Label>
                  <Input id="name" name="name" defaultValue={bot.name} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="systemPrompt">System Prompt</Label>
                  <Textarea
                    id="systemPrompt"
                    name="systemPrompt"
                    defaultValue={bot.systemPrompt}
                    className="min-h-50"
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
                      {['#3b82f6', '#10b981', '#f43f5e', '#f59e0b', '#71717a', '#000000'].map(
                        color => (
                          <button
                            key={color}
                            type="button"
                            className="w-8 h-8 rounded-lg border border-zinc-200 shadow-sm transition-all hover:scale-110 active:scale-95 focus:ring-2 focus:ring-zinc-400 focus:outline-hidden"
                            style={{ backgroundColor: color }}
                            onClick={() => setPrimaryColor(color)}
                          />
                        )
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground italic">
                    This color will be used for your chatbot's header and bubble.
                  </p>
                </div>
              </CardContent>
              <CardFooter className="border-t p-4 flex justify-end">
                <Button type="submit" disabled={isSaving}>
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>

        <TabsContent value="knowledge" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Add Knowledge</CardTitle>
              <CardDescription>
                Train your bot by adding text content about your business.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Paste text information here (e.g. pricing, FAQs, services)..."
                className="min-h-37.5"
                value={newDoc}
                onChange={e => setNewDoc(e.target.value)}
              />
              <Button onClick={handleAddDoc} disabled={isSaving || !newDoc.trim()}>
                <Plus className="mr-2 h-4 w-4" />
                Add Content
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Stored Knowledge ({bot.documents.length})</h3>
            {bot.documents.length === 0 ? (
              <p className="text-muted-foreground italic">No knowledge added yet.</p>
            ) : (
              bot.documents.map((doc: any) => (
                <Card key={doc.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <FileText className="h-5 w-5 text-zinc-400 mt-1 shrink-0" />
                      <p className="text-sm text-zinc-600 line-clamp-3">{doc.content}</p>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="install" className="mt-8 space-y-6">
          <Card className="border-none shadow-xl bg-white overflow-hidden">
            <CardHeader className="border-b border-zinc-50 pb-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-zinc-900 text-white flex items-center justify-center shadow-lg shrink-0">
                  <span className="font-bold">JS</span>
                </div>
                <div>
                  <CardTitle className="text-xl font-bold">JavaScript Snippet</CardTitle>
                  <CardDescription>
                    Add this code to your website to activate the chatbot.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-2xl flex gap-3 items-start">
                  <div className="h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="h-3 w-3 text-white" />
                  </div>
                  <p className="text-sm text-blue-900 font-medium leading-relaxed">
                    Copy this code and paste it before the closing{' '}
                    <code className="bg-blue-100/50 px-1.5 py-0.5 rounded text-blue-700">
                      &lt;/body&gt;
                    </code>{' '}
                    tag of your website.
                  </p>
                </div>

                <div className="relative group">
                  <div className="absolute top-3 right-3 z-10">
                    <Button
                      className="rounded-xl transition-all bg-white/10 hover:bg-white text-white hover:text-zinc-900 backdrop-blur-md border border-white/20 shadow-xl"
                      size="sm"
                      onClick={copySnippet}
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      <span className="ml-2 font-bold">{copied ? 'Copied' : 'Copy'}</span>
                    </Button>
                  </div>
                  <pre className="bg-zinc-950 text-zinc-300 p-6 rounded-3xl overflow-x-auto text-xs sm:text-sm leading-relaxed border border-zinc-800 shadow-2xl min-h-30">
                    {`<script 
    src="${process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')}/widget-loader.js" 
    data-bot-id="${bot.id}" 
    defer
></script>`}
                  </pre>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl bg-white overflow-hidden">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-bold">Direct Preview</CardTitle>
              <CardDescription>
                Use this link to test your chatbot in a standalone page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex-1 relative">
                  <Input
                    readOnly
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/widget/${bot.id}`}
                    className="h-12 rounded-xl border-zinc-100 bg-zinc-50 font-mono text-xs pr-10"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400">
                    <ExternalLink className="h-4 w-4" />
                  </div>
                </div>
                <Button className="rounded-xl h-12 px-6 font-bold" asChild>
                  <Link href={`/widget/${bot.id}`} target="_blank">
                    Open Preview
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
