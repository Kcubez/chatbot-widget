'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Facebook,
  Check,
  Loader2,
  Trash,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Copy,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  Server,
  Network
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { updateBot } from '@/lib/actions/bot';

interface N8NWorkflowBotDetailsProps {
  bot: any;
  setBot: (bot: any) => void;
  botId: string;
  setIsDeleteModalOpen: (open: boolean) => void;
}

export default function N8NWorkflowBotDetails({
  bot,
  setBot,
  botId,
  setIsDeleteModalOpen,
}: N8NWorkflowBotDetailsProps) {
  const router = useRouter();
  const [isSavingUrl, setIsSavingUrl] = useState(false);
  const [isTestingUrl, setIsTestingUrl] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState(bot.n8nWebhookUrl || '');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; status?: number } | null>(null);
  const [copiedHeader, setCopiedHeader] = useState<string | null>(null);

  const handleSaveWebhookUrl = async () => {
    if (webhookUrl && !webhookUrl.startsWith('https://')) {
      toast.error('Webhook URL must start with https:// for secure message forwarding');
      return;
    }

    setIsSavingUrl(true);
    setTestResult(null);
    try {
      await updateBot(botId, { n8nWebhookUrl: webhookUrl || null });
      setBot({ ...bot, n8nWebhookUrl: webhookUrl || null });
      toast.success('n8n Webhook URL updated successfully!');
    } catch (err) {
      toast.error('Failed to update Webhook URL');
    } finally {
      setIsSavingUrl(false);
    }
  };

  const handleTestConnection = async () => {
    if (!bot.n8nWebhookUrl) {
      toast.error('Please save your Webhook URL first before testing');
      return;
    }

    setIsTestingUrl(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/bots/${botId}/test-n8n`, {
        method: 'POST',
      });
      const data = await res.json();
      setTestResult(data);
      if (data.success) {
        toast.success('Connection test succeeded!');
      } else {
        toast.error(data.message || 'Connection test failed');
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Network error occurred while testing connection.',
      });
      toast.error('Failed to test connection');
    } finally {
      setIsTestingUrl(false);
    }
  };

  const handleFacebookConnect = () => {
    const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
    if (!appId) {
      toast.error(
        'Facebook App ID is not configured. Add NEXT_PUBLIC_FACEBOOK_APP_ID to environment variables.'
      );
      return;
    }
    const redirectUri = `${window.location.origin}/api/auth/facebook/callback`;
    const state = botId;
    const scope = 'pages_messaging,pages_read_engagement,pages_manage_metadata,pages_show_list';
    const fbAuthUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${state}&response_type=code`;
    window.open(fbAuthUrl, '_blank');
  };

  const handleDisconnectFacebook = async () => {
    try {
      await updateBot(botId, {
        messengerPageId: null,
        messengerPageToken: null,
        messengerEnabled: false,
      });
      setBot({
        ...bot,
        messengerPageId: null,
        messengerPageToken: null,
        messengerEnabled: false,
      });
      toast.success('Disconnected from Facebook Page');
    } catch {
      toast.error('Failed to disconnect from Facebook');
    }
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHeader(type);
    toast.success(`${type} copied to clipboard!`);
    setTimeout(() => setCopiedHeader(null), 2000);
  };

  const samplePayload = `{
  "object": "page",
  "entry": [
    {
      "id": "${bot.messengerPageId || 'PAGE_ID'}",
      "time": 1718000000000,
      "messaging": [
        {
          "sender": { "id": "USER_PSID" },
          "recipient": { "id": "${bot.messengerPageId || 'PAGE_ID'}" },
          "timestamp": 1718000000000,
          "message": {
            "mid": "mid.gB...",
            "text": "Hello, this is a test message!"
          }
        }
      ]
    }
  ]
}`;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Premium Gradient Header Card */}
      <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 p-8 text-white shadow-xl shadow-orange-100">
        <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full blur-3xl -translate-y-1/3 translate-x-1/3 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-60 h-60 bg-yellow-300/20 rounded-full blur-2xl translate-y-1/2 -translate-x-1/3 pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-xs font-black tracking-widest uppercase backdrop-blur-md">
              ⚡ n8n Integration Hub
            </span>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight">{bot.name}</h1>
            <p className="text-white/80 font-medium max-w-xl text-sm leading-relaxed">
              Synchronize incoming Facebook messages directly to your external n8n workflow server. Perfect for multi-tenant setups and customizable automation.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="rounded-full bg-white/10 hover:bg-white/20 border-white/20 text-white font-bold h-11 backdrop-blur-md"
              onClick={() => setIsDeleteModalOpen(true)}
            >
              <Trash className="mr-2 h-4 w-4" />
              Delete Bot
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="setup" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md h-12 bg-zinc-100/50 rounded-2xl p-1 border border-zinc-100/50 shadow-sm">
          <TabsTrigger
            value="setup"
            className="rounded-xl text-xs sm:text-sm font-bold transition-all data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm data-[state=inactive]:text-zinc-500 hover:text-zinc-700 h-full"
          >
            ⚡ Setup Pipeline
          </TabsTrigger>
          <TabsTrigger
            value="status"
            className="rounded-xl text-xs sm:text-sm font-bold transition-all data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm data-[state=inactive]:text-zinc-500 hover:text-zinc-700 h-full"
          >
            📊 Connection Status
          </TabsTrigger>
        </TabsList>

        {/* ── Setup Tab ── */}
        <TabsContent value="setup" className="mt-6">
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Facebook Connection Card */}
            <Card className="rounded-[24px] border-zinc-200/80 shadow-md bg-white overflow-hidden">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <Facebook className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-black text-zinc-900">Facebook Page</CardTitle>
                    <CardDescription className="text-xs">
                      Connect your Facebook Page to begin receiving events
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {bot.messengerPageId ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-4 bg-emerald-50/50 rounded-2xl p-4 border border-emerald-100">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                          <Check className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-black text-emerald-900 text-sm">Linked to Page</p>
                          <p className="text-xs text-emerald-700">Page ID: {bot.messengerPageId}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={async () => {
                            const enabled = !bot.messengerEnabled;
                            await fetch(`/api/bots/${bot.id}/messenger`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ messengerEnabled: enabled }),
                            });
                            setBot({ ...bot, messengerEnabled: enabled });
                            toast.success(enabled ? 'Forwarding enabled' : 'Forwarding paused');
                          }}
                          className={`relative w-11 h-6 rounded-full transition-colors ${bot.messengerEnabled ? 'bg-emerald-500' : 'bg-zinc-300'}`}
                        >
                          <div
                            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${bot.messengerEnabled ? 'translate-x-5' : ''}`}
                          />
                        </button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-full text-red-500 hover:text-red-600 hover:bg-red-50 font-bold"
                          onClick={handleDisconnectFacebook}
                        >
                          Disconnect
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 border border-dashed border-zinc-200 rounded-2xl bg-zinc-50/50">
                    <Facebook className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
                    <h4 className="font-bold text-zinc-800 text-sm mb-1">No Facebook Page Connected</h4>
                    <p className="text-xs text-zinc-500 max-w-sm mx-auto mb-4 leading-normal">
                      Grant us access to subscribe to messages. Your external n8n webhook will receive all page payload.
                    </p>
                    <Button
                      className="rounded-full bg-blue-600 hover:bg-blue-700 font-bold shadow-lg shadow-blue-100 text-xs px-6 h-9"
                      onClick={handleFacebookConnect}
                    >
                      Connect Facebook Page
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Webhook Configuration Card */}
            <Card className="rounded-[24px] border-zinc-200/80 shadow-md bg-white">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                    <Network className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-black text-zinc-900">n8n Destination Webhook</CardTitle>
                    <CardDescription className="text-xs">
                      Enter your external n8n active webhook URL endpoint
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="webhookUrl" className="text-xs font-black text-zinc-700">Webhook Target URL</Label>
                  <div className="flex gap-2">
                    <Input
                      id="webhookUrl"
                      type="url"
                      placeholder="https://n8n.yourserver.com/webhook/..."
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      className="rounded-xl border-zinc-200 text-sm focus-visible:ring-orange-500"
                    />
                    <Button
                      className="rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold px-6 shrink-0 h-10 text-xs"
                      onClick={handleSaveWebhookUrl}
                      disabled={isSavingUrl}
                    >
                      {isSavingUrl ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                    </Button>
                  </div>
                </div>

                {bot.n8nWebhookUrl && (
                  <div className="pt-2 flex flex-col gap-3">
                    <div className="flex items-center justify-between border-t border-zinc-100 pt-3">
                      <span className="text-xs text-zinc-500 font-medium">Verify webhook endpoint connectivity:</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full border-orange-200 hover:bg-orange-50 text-orange-600 font-bold text-xs h-8"
                        onClick={handleTestConnection}
                        disabled={isTestingUrl}
                      >
                        {isTestingUrl ? (
                          <>
                            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                            Pinging...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                            Test Connection
                          </>
                        )}
                      </Button>
                    </div>

                    {/* Test Result Display */}
                    {testResult && (
                      <div
                        className={`rounded-2xl p-4 border text-xs leading-relaxed transition-all ${
                          testResult.success
                            ? 'bg-emerald-50/60 border-emerald-100 text-emerald-800'
                            : 'bg-red-50/60 border-red-100 text-red-800'
                        }`}
                      >
                        <div className="flex gap-2 items-start">
                          {testResult.success ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                          ) : (
                            <ShieldAlert className="h-5 w-5 text-red-600 shrink-0" />
                          )}
                          <div>
                            <p className="font-black text-sm">
                              {testResult.success ? 'Success!' : 'Connection Failed'}
                            </p>
                            <p className="mt-1 font-medium">{testResult.message}</p>
                            {testResult.status && (
                              <p className="mt-2 text-[10px] text-zinc-500 font-mono">
                                Status Code: {testResult.status}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Connection Status Tab ── */}
        <TabsContent value="status" className="mt-6 space-y-6">
          <Card className="rounded-[24px] border-zinc-200/80 shadow-md bg-white">
            <CardHeader>
              <CardTitle className="text-lg font-black text-zinc-900">Live Connection Map</CardTitle>
              <CardDescription className="text-xs">
                Real-time tracking of message synchronization paths
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              {/* Network flow diagram */}
              <div className="flex flex-col md:flex-row items-center justify-center gap-4 py-8 bg-zinc-50 border border-zinc-100 rounded-3xl relative overflow-hidden">
                <div className="flex flex-col items-center p-4 bg-white border border-zinc-200/80 rounded-2xl w-40 text-center shadow-sm relative z-10">
                  <div className="h-10 w-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-2">
                    <Facebook className="h-5 w-5" />
                  </div>
                  <p className="font-black text-zinc-800 text-xs">Facebook Page</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black mt-2 uppercase ${
                    bot.messengerPageId ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                  }`}>
                    {bot.messengerPageId ? 'Connected' : 'Missing'}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <ChevronRight className={`h-6 w-6 hidden md:block ${bot.messengerPageId ? 'text-emerald-500 animate-pulse' : 'text-zinc-300'}`} />
                </div>

                <div className="flex flex-col items-center p-4 bg-zinc-900 border border-zinc-800 rounded-2xl w-48 text-center shadow-md text-white relative z-10">
                  <div className="h-10 w-10 rounded-full bg-orange-500 text-white flex items-center justify-center mb-2">
                    <Network className="h-5 w-5" />
                  </div>
                  <p className="font-black text-xs">Chatbot Hub Widget</p>
                  <p className="text-[9px] text-zinc-400 mt-1 max-w-[120px] truncate">{bot.name}</p>
                </div>

                <div className="flex items-center gap-1">
                  <ChevronRight className={`h-6 w-6 hidden md:block ${bot.n8nWebhookUrl ? 'text-emerald-500 animate-pulse' : 'text-zinc-300'}`} />
                </div>

                <div className="flex flex-col items-center p-4 bg-white border border-zinc-200/80 rounded-2xl w-40 text-center shadow-sm relative z-10">
                  <div className="h-10 w-10 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center mb-2">
                    <Server className="h-5 w-5" />
                  </div>
                  <p className="font-black text-zinc-800 text-xs">n8n Workflow</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black mt-2 uppercase ${
                    bot.n8nWebhookUrl ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                  }`}>
                    {bot.n8nWebhookUrl ? 'Configured' : 'Missing'}
                  </span>
                </div>
              </div>

              {/* Status Checklist */}
              <div className="max-w-xl mx-auto">
                <div className="p-5 border border-zinc-100 rounded-2xl space-y-2">
                  <h4 className="font-black text-sm text-zinc-800">Pipeline Verification Checklist</h4>
                  <ul className="space-y-3 pt-2">
                    <li className="flex items-center gap-2.5 text-xs text-zinc-600">
                      {bot.messengerPageId ? (
                        <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-4.5 w-4.5 text-amber-500 shrink-0" />
                      )}
                      <span>Facebook OAuth Authorization page permissions connected</span>
                    </li>
                    <li className="flex items-center gap-2.5 text-xs text-zinc-600">
                      {bot.n8nWebhookUrl ? (
                        <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-4.5 w-4.5 text-amber-500 shrink-0" />
                      )}
                      <span>Destination workflow active webhook URL registered</span>
                    </li>
                    <li className="flex items-center gap-2.5 text-xs text-zinc-600">
                      {bot.messengerEnabled ? (
                        <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-4.5 w-4.5 text-amber-500 shrink-0" />
                      )}
                      <span>Next.js webhook routing forwarder switch active</span>
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
