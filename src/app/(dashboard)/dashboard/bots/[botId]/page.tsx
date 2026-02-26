'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  Trash,
  FileText,
  Plus,
  Copy,
  Check,
  ExternalLink,
  ArrowRight,
  Upload,
  Shield,
  Bot,
  Pencil,
  X,
  MessageCircle,
  MessageSquare,
  Facebook,
} from 'lucide-react';
import Script from 'next/script';
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
import {
  getBotById,
  updateBot,
  deleteBot,
  addDocument,
  uploadPDF,
  updateDocument,
  deleteDocument,
} from '@/lib/actions/bot';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';

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
  const [newDocTitle, setNewDocTitle] = useState('');
  const [editingDoc, setEditingDoc] = useState<{
    id: string;
    content: string;
    title: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [primaryColor, setPrimaryColor] = useState('#3b82f6');

  // Facebook Integration State
  // const [fbPages, setFbPages] = useState<any[]>([]);
  // const [isFetchingFb, setIsFetchingFb] = useState(false);

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
      await addDocument(botId, newDoc, newDocTitle || 'Text Knowledge');
      toast.success('Knowledge added');
      setNewDoc('');
      setNewDocTitle('');
      const updated = await getBotById(botId);
      setBot(updated);
    } catch (err) {
      toast.error('Failed to add knowledge');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePDFUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error('Please upload a PDF file');
      return;
    }

    setIsSaving(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      await uploadPDF(botId, formData);
      toast.success('PDF knowledge added');
      const updated = await getBotById(botId);
      setBot(updated);
    } catch (err) {
      toast.error('Failed to process PDF');
    } finally {
      setIsSaving(false);
      // Reset input
      e.target.value = '';
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!confirm('Are you sure you want to delete this knowledge?')) return;
    setIsSaving(true);
    try {
      await deleteDocument(docId, botId);
      toast.success('Knowledge deleted');
      const updated = await getBotById(botId);
      setBot(updated);
    } catch (err) {
      toast.error('Failed to delete knowledge');
    } finally {
      setIsSaving(false);
    }
  };

  // const handleFacebookLogin = async () => {
  //   const appId = process.env.NEXT_PUBLIC_FB_APP_ID;

  //   if (!appId) {
  //     toast.error('Facebook App ID is not configured on the server.');
  //     return;
  //   }

  //   if (!(window as any).FB) {
  //     toast.error('Facebook SDK is still loading. Please try again in a moment.');
  //     return;
  //   }

  //   setIsFetchingFb(true);

  //   try {
  //     (window as any).FB.init({
  //       appId: appId,
  //       cookie: true,
  //       xfbml: true,
  //       version: 'v19.0',
  //     });

  //     (window as any).FB.login(
  //       (response: any) => {
  //         if (response.authResponse) {
  //           const userToken = response.authResponse.accessToken;
  //           // @ts-ignore
  //           window.FB.api('/me/accounts', { access_token: userToken }, (response: any) => {
  //             if (response && !response.error) {
  //               setFbPages(response.data);
  //             } else {
  //               toast.error('Failed to fetch Facebook pages');
  //             }
  //             setIsFetchingFb(false);
  //           });
  //         } else {
  //           toast.error('Facebook login cancelled');
  //           setIsFetchingFb(false);
  //         }
  //       },
  //       { scope: 'pages_messaging,pages_show_list,pages_manage_metadata' }
  //     );
  //   } catch (err) {
  //     console.error(err);
  //     toast.error('Facebook SDK error');
  //     setIsFetchingFb(false);
  //   }
  // };

  // const connectPage = async (page: any) => {
  //   setIsSaving(true);
  //   try {
  //     // 1. Subscribe the page to our app's webhooks automatically
  //     const subscribeResponse = await fetch(
  //       `https://graph.facebook.com/v19.0/${page.id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks&access_token=${page.access_token}`,
  //       { method: 'POST' }
  //     );

  //     const subscribeData = await subscribeResponse.json();
  //     if (!subscribeResponse.ok || !subscribeData.success) {
  //       console.error('Facebook Subscription Error:', subscribeData);
  //       toast.error(
  //         'Failed to subscribe to page events. Make sure you have the required permissions.'
  //       );
  //       return;
  //     }

  //     // 2. Save settings to our database
  //     await updateBot(botId, {
  //       messengerPageId: page.id,
  //       messengerAccessToken: page.access_token,
  //       messengerVerifyToken: Math.random().toString(36).substring(7),
  //     });

  //     toast.success(`Connected to ${page.name}`);
  //     setFbPages([]);
  //     const updated = await getBotById(botId);
  //     setBot(updated);
  //   } catch (err) {
  //     console.error('Connect Page error:', err);
  //     toast.error('Failed to connect page');
  //   } finally {
  //     setIsSaving(false);
  //   }
  // };

  const handleUpdateDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDoc) return;
    setIsSaving(true);
    try {
      await updateDocument(editingDoc.id, botId, editingDoc.content, editingDoc.title);
      toast.success('Knowledge updated');
      setEditingDoc(null);
      const updated = await getBotById(botId);
      setBot(updated);
    } catch (err) {
      toast.error('Failed to update knowledge');
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
        <TabsList className="grid grid-cols-4 w-full h-12 bg-zinc-100/50 rounded-2xl p-1 border border-zinc-100/50 shadow-sm md:max-w-2xl md:mx-auto">
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
            Knowledge
          </TabsTrigger>
          <TabsTrigger
            value="telegram"
            className="rounded-xl text-xs sm:text-sm font-bold transition-all data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm data-[state=inactive]:text-zinc-500 hover:text-zinc-700"
          >
            Telegram
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

        <TabsContent value="knowledge" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-lg">Add Context</CardTitle>
                <CardDescription>Paste text information here (e.g. pricing, FAQs).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="docTitle">Title (Optional)</Label>
                  <Input
                    id="docTitle"
                    placeholder="e.g. Pricing Table"
                    value={newDocTitle}
                    onChange={e => setNewDocTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="docContent">Content</Label>
                  <Textarea
                    id="docContent"
                    placeholder="Paste text content..."
                    className="min-h-30"
                    value={newDoc}
                    onChange={e => setNewDoc(e.target.value)}
                  />
                </div>
                <Button
                  onClick={handleAddDoc}
                  disabled={isSaving || !newDoc.trim()}
                  className="w-full"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Text
                </Button>
              </CardContent>
            </Card>

            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-lg">Upload Documents</CardTitle>
                <CardDescription>Upload PDF files to train your AI agent.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="border-2 border-dashed border-zinc-200 rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-3 bg-zinc-50/50 hover:bg-zinc-50 transition-colors cursor-pointer relative">
                  <Upload className="h-8 w-8 text-zinc-400" />
                  <div>
                    <p className="text-sm font-bold text-zinc-900">Click to upload PDF</p>
                    <p className="text-xs text-zinc-500 mt-1">Maximum file size: 10MB</p>
                  </div>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handlePDFUpload}
                    disabled={isSaving}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  {isSaving && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center rounded-2xl">
                      <Loader2 className="h-6 w-6 animate-spin text-zinc-900" />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4 pt-4">
            <h3 className="font-bold text-xl flex items-center gap-2">
              <FileText className="h-5 w-5 text-zinc-400" />
              Trained Knowledge ({bot.documents.length})
            </h3>
            {bot.documents.length === 0 ? (
              <Card className="border-dashed border-2 bg-zinc-50/30">
                <CardContent className="py-12 flex flex-col items-center justify-center text-zinc-400">
                  <FileText className="h-12 w-12 mb-4 opacity-20" />
                  <p className="text-sm font-medium italic">No knowledge sources added yet.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {bot.documents.map((doc: any) => (
                  <Card
                    key={doc.id}
                    className="group hover:border-zinc-300 transition-all shadow-sm bg-white"
                  >
                    <CardContent className="p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="h-10 w-10 rounded-xl bg-zinc-100 flex items-center justify-center shrink-0 border border-zinc-200 group-hover:bg-white group-hover:scale-110 transition-all">
                          {doc.title?.endsWith('.pdf') ? (
                            <FileText className="h-5 w-5 text-blue-500" />
                          ) : (
                            <FileText className="h-5 w-5 text-zinc-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-bold text-zinc-900 truncate tracking-tight">
                            {doc.title || 'Untitled Knowledge'}
                          </h4>
                          <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1 opacity-80 leading-relaxed Myanmar-font font-medium">
                            {doc.content}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-10 sm:group-hover:opacity-100 transition-opacity">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 rounded-xl text-zinc-500 hover:text-blue-500 hover:bg-blue-50 transition-all"
                          onClick={() =>
                            setEditingDoc({ id: doc.id, content: doc.content, title: doc.title })
                          }
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 rounded-xl text-zinc-500 hover:text-rose-500 hover:bg-rose-50 transition-all"
                          onClick={() => handleDeleteDoc(doc.id)}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="telegram" className="mt-6">
          <Card className="border-none shadow-xl bg-white overflow-hidden">
            <CardHeader className="border-b border-zinc-50 pb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-sky-500 text-white flex items-center justify-center shadow-lg shrink-0">
                    <MessageCircle className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-bold">Telegram Integration</CardTitle>
                    <CardDescription>
                      {bot?.telegramBotToken
                        ? 'Connected to Telegram'
                        : 'Connect your AI agent to a Telegram Bot.'}
                    </CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-8 space-y-8">
              {bot?.telegramBotToken && (
                <div className="bg-green-50 border border-green-100 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-green-500 text-white flex items-center justify-center shadow-md">
                      <Check className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="font-bold text-green-900">Successfully Connected</p>
                      <p className="text-xs text-green-700 opacity-80">
                        Your bot is active on Telegram.
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl border-green-200 text-green-700 hover:bg-white h-10 font-bold"
                    onClick={async () => {
                      if (confirm('Disconnect this bot?')) {
                        await updateBot(botId, {
                          telegramBotToken: null,
                        });
                        const updated = await getBotById(botId);
                        setBot(updated);
                      }
                    }}
                  >
                    Disconnect
                  </Button>
                </div>
              )}

              <div className="space-y-6 pt-2">
                <div className="flex items-center gap-4">
                  <div className="h-px flex-1 bg-zinc-100"></div>
                  <span className="text-[10px] font-black text-zinc-300 uppercase tracking-[0.2em]">
                    Bot Configuration
                  </span>
                  <div className="h-px flex-1 bg-zinc-100"></div>
                </div>

                <form
                  onSubmit={async e => {
                    e.preventDefault();
                    setIsSaving(true);
                    const formData = new FormData(e.currentTarget);
                    const token = formData.get('telegramBotToken') as string;
                    try {
                      await updateBot(botId, {
                        telegramBotToken: token,
                      });
                      if (token) {
                        const baseUrl =
                          process.env.NEXT_PUBLIC_APP_URL ||
                          (typeof window !== 'undefined' ? window.location.origin : '');
                        const webhookUrl = `${baseUrl}/api/webhooks/telegram?botId=${botId}`;
                        const response = await fetch(
                          `https://api.telegram.org/bot${token}/setWebhook?url=${webhookUrl}`
                        );
                        const resData = await response.json();
                        if (!resData.ok) {
                          toast.error('Failed to set webhook in Telegram API. Check your token.');
                        } else {
                          toast.success('Telegram Webhook set successfully!');
                        }
                      } else {
                        toast.success('Telegram settings saved');
                      }
                      const updated = await getBotById(botId);
                      setBot(updated);
                    } catch (err) {
                      toast.error('Failed to save settings');
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                  className="space-y-6"
                >
                  <div className="space-y-2">
                    <Label
                      htmlFor="telegramBotToken"
                      className="text-xs font-bold uppercase tracking-widest text-zinc-500"
                    >
                      Telegram Bot Token
                    </Label>
                    <Input
                      id="telegramBotToken"
                      name="telegramBotToken"
                      defaultValue={bot?.telegramBotToken || ''}
                      placeholder="e.g. 123456789:ABCdefGHIjklmNOPqrstUVWxyz"
                      className="h-12 rounded-xl border-zinc-100 bg-zinc-50 focus:bg-white transition-all font-mono"
                      required
                    />
                    <p className="text-xs text-zinc-500 mt-2">
                      Get your token from{' '}
                      <a
                        href="https://t.me/BotFather"
                        target="_blank"
                        rel="noreferrer"
                        className="text-sky-500 hover:underline"
                      >
                        @BotFather
                      </a>{' '}
                      on Telegram.
                    </p>
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button
                      disabled={isSaving}
                      className="rounded-xl h-12 px-8 font-bold bg-zinc-900 hover:bg-zinc-800 shadow-xl shadow-zinc-100 transition-all"
                    >
                      {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save & Connect
                    </Button>
                  </div>
                </form>
              </div>
            </CardContent>
          </Card>
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
    data-bot-id="${bot?.id}" 
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
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/widget/${bot?.id}`}
                    className="h-12 rounded-xl border-zinc-100 bg-zinc-50 font-mono text-xs pr-10"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400">
                    <ExternalLink className="h-4 w-4" />
                  </div>
                </div>
                <Button className="rounded-xl h-12 px-6 font-bold" asChild>
                  <Link href={`/widget/${bot?.id}`} target="_blank">
                    Open Preview
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!editingDoc} onOpenChange={open => !open && setEditingDoc(null)}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden border-none shadow-2xl rounded-3xl">
          <div className="bg-zinc-900 px-6 py-8 text-white relative">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold tracking-tight">
                Edit Knowledge
              </DialogTitle>
              <DialogDescription className="text-zinc-400 font-medium">
                Refine the information your AI bot uses to answer questions.
              </DialogDescription>
            </DialogHeader>
            <div className="absolute top-6 right-6 h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center backdrop-blur-sm border border-white/10">
              <Pencil className="h-6 w-6 text-white" />
            </div>
          </div>

          <form onSubmit={handleUpdateDoc} className="bg-white">
            <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
              <div className="space-y-2.5">
                <Label
                  htmlFor="editTitle"
                  className="text-xs font-bold uppercase tracking-widest text-zinc-500 ml-1"
                >
                  Reference Title
                </Label>
                <Input
                  id="editTitle"
                  value={editingDoc?.title || ''}
                  onChange={e =>
                    setEditingDoc(prev => (prev ? { ...prev, title: e.target.value } : null))
                  }
                  placeholder="e.g. Service Pricing PDF"
                  className="h-12 rounded-2xl border-zinc-200 bg-zinc-50/50 focus:bg-white transition-all font-medium text-zinc-900"
                  required
                />
              </div>

              <div className="space-y-2.5">
                <Label
                  htmlFor="editContent"
                  className="text-xs font-bold uppercase tracking-widest text-zinc-500 ml-1"
                >
                  Knowledge Content
                </Label>
                <div className="relative group">
                  <Textarea
                    id="editContent"
                    value={editingDoc?.content || ''}
                    onChange={e =>
                      setEditingDoc(prev => (prev ? { ...prev, content: e.target.value } : null))
                    }
                    className="min-h-75 rounded-2xl border-zinc-200 bg-zinc-50/50 focus:bg-white transition-all font-medium text-zinc-900 leading-relaxed Myanmar-font p-5"
                    placeholder="Enter the knowledge content here..."
                    required
                  />
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-zinc-100 bg-zinc-50/50 flex items-center justify-end gap-3">
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-xl h-12 px-6 font-bold text-zinc-500 hover:bg-white hover:text-zinc-900 transition-all"
                  disabled={isSaving}
                >
                  Discard Changes
                </Button>
              </DialogClose>
              <Button
                type="submit"
                disabled={isSaving || !editingDoc?.content.trim()}
                className="rounded-xl h-12 px-8 font-bold bg-zinc-900 text-white hover:bg-zinc-800 shadow-xl shadow-zinc-200 transition-all active:scale-95"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Update Knowledge'
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
