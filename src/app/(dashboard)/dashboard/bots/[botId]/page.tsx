'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Save, Trash, FileText, Plus, Copy, Check } from 'lucide-react';
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
  const router = useRouter();

  useEffect(() => {
    async function loadBot() {
      try {
        const data = await getBotById(botId);
        setBot(data);
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
    const snippet = `<script 
    src="${window.location.origin}/widget-loader.js" 
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
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/bots">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h2 className="text-3xl font-bold tracking-tight">{bot.name}</h2>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={async () => {
            if (confirm('Are you sure?')) {
              await deleteBot(bot.id);
              router.push('/dashboard/bots');
            }
          }}
        >
          <Trash className="mr-2 h-4 w-4" />
          Delete Bot
        </Button>
      </div>

      <Tabs defaultValue="settings">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge Base</TabsTrigger>
          <TabsTrigger value="install">Installation</TabsTrigger>
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
                <div className="space-y-2">
                  <Label htmlFor="primaryColor">Theme Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="primaryColor"
                      name="primaryColor"
                      defaultValue={bot.primaryColor}
                      className="w-30"
                    />
                    <div
                      className="w-10 h-10 rounded border"
                      style={{ backgroundColor: bot.primaryColor }}
                    />
                  </div>
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

        <TabsContent value="install" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>JavaScript Snippet</CardTitle>
              <CardDescription>
                Copy this code and paste it before the closing &lt;/body&gt; tag of your website.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative group">
                <pre className="bg-zinc-950 text-zinc-300 p-4 rounded-lg overflow-x-auto text-sm leading-relaxed">
                  {`<script 
    src="${typeof window !== 'undefined' ? window.location.origin : ''}/widget-loader.js" 
    data-bot-id="${bot.id}" 
    defer
></script>`}
                </pre>
                <Button
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  size="sm"
                  variant="secondary"
                  onClick={copySnippet}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
