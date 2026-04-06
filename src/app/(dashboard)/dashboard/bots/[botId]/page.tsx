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
  GraduationCap,
  GripVertical,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  Users,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Wand2,
  Pin,
  Lock,
  AlertTriangle,
  Send,
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

import { use, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';


export default function BotDetailsPage({
  params: paramsPromise,
}: {
  params: Promise<{ botId: string }>;
}) {
  const params = use(paramsPromise);
  const botId = params.botId;

  const isSaleBot = (cat: string) => cat === 'messenger_sale' || cat === 'telegram_sale' || cat === 'telegram_agentic_sale';

  const [bot, setBot] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingDoc, setIsAddingDoc] = useState(false);
  const [isUploadingPDF, setIsUploadingPDF] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [newDoc, setNewDoc] = useState('');
  const [newDocTitle, setNewDocTitle] = useState('');
  const [editingDoc, setEditingDoc] = useState<{
    id: string;
    content: string;
    title: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [primaryColor, setPrimaryColor] = useState('#3b82f6');

  // Onboarding State
  const [onboardingEnabled, setOnboardingEnabled] = useState(false);
  const [onboardingWelcome, setOnboardingWelcome] = useState('');
  const [onboardingTopics, setOnboardingTopics] = useState<
    {
      id: string;
      icon: string;
      label: string;
      prompt: string;
      content?: string;
      buttonText?: string;
      useAI?: boolean;
      images?: string[];
      requireUpload?: boolean;
      verificationPrompt?: string;
      uploadInstruction?: string;
      requiredUploads?: number;
    }[]
  >([]);
  const [editingTopic, setEditingTopic] = useState<{
    index: number;
    icon: string;
    label: string;
    prompt: string;
    content: string;
    buttonText: string;
    useAI: boolean;
    images: string[];
    requireUpload: boolean;
    verificationPrompt: string;
    uploadInstruction: string;
    requiredUploads: number;
  } | null>(null);
  const [isAddingTopic, setIsAddingTopic] = useState(false);
  const [newTopic, setNewTopic] = useState({
    icon: '📋',
    label: '',
    content: '',
    buttonText: '',
    useAI: false,
    prompt: '',
    images: [] as string[],
    requireUpload: false,
    verificationPrompt: '',
    uploadInstruction: '',
    requiredUploads: 1,
  });


  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [docToDelete, setDocToDelete] = useState<string | null>(null);
  const [topicToDelete, setTopicToDelete] = useState<number | null>(null);
  const [isDisconnectTelegramOpen, setIsDisconnectTelegramOpen] = useState(false);
  const [isDisconnectFacebookOpen, setIsDisconnectFacebookOpen] = useState(false);

  // Completion Tracker State
  const [completionData, setCompletionData] = useState<any>(null);
  const [isLoadingCompletions, setIsLoadingCompletions] = useState(false);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  const fetchCompletions = async () => {
    setIsLoadingCompletions(true);
    try {
      const res = await fetch(`/api/bots/${botId}/completions`);
      if (res.ok) {
        const data = await res.json();
        setCompletionData(data);
      }
    } catch (err) {
      console.error('Failed to load completions:', err);
    } finally {
      setIsLoadingCompletions(false);
    }
  };

  // ─── Members & Announcements State ───
  const [members, setMembers] = useState<any[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState(false);
  const [newAnnTitle, setNewAnnTitle] = useState('');
  const [newAnnContent, setNewAnnContent] = useState('');
  const [isSavingAnn, setIsSavingAnn] = useState(false);
  const [broadcastingId, setBroadcastingId] = useState<string | null>(null);
  const [unpinningId, setUnpinningId] = useState<string | null>(null);
  const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);
  const [pendingBroadcastAnnId, setPendingBroadcastAnnId] = useState<string | null>(null);
  const [shouldPin, setShouldPin] = useState(false);

  const [deleteMemberModalOpen, setDeleteMemberModalOpen] = useState(false);
  const [pendingDeleteMemberId, setPendingDeleteMemberId] = useState<string | null>(null);

  const [deleteAnnModalOpen, setDeleteAnnModalOpen] = useState(false);
  const [pendingDeleteAnnId, setPendingDeleteAnnId] = useState<string | null>(null);

  const [unpinModalOpen, setUnpinModalOpen] = useState(false);
  const [pendingUnpinAnnId, setPendingUnpinAnnId] = useState<string | null>(null);

  const [menuAction, setMenuAction] = useState<'setup' | 'remove' | null>(null);
  const [removeMenuModalOpen, setRemoveMenuModalOpen] = useState(false);
  const [telegramMenuAction, setTelegramMenuAction] = useState<'setup' | 'remove' | null>(null);
  const [telegramRemoveMenuModalOpen, setTelegramRemoveMenuModalOpen] = useState(false);

  const fetchMembers = async () => {
    setIsLoadingMembers(true);
    try {
      const res = await fetch(`/api/bots/${botId}/members`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
      }
    } catch (err) {
      console.error('Failed to load members:', err);
    } finally {
      setIsLoadingMembers(false);
    }
  };

  const fetchAnnouncements = async () => {
    setIsLoadingAnnouncements(true);
    try {
      const res = await fetch(`/api/bots/${botId}/announcements`);
      if (res.ok) {
        const data = await res.json();
        setAnnouncements(data.announcements || []);
      }
    } catch (err) {
      console.error('Failed to load announcements:', err);
    } finally {
      setIsLoadingAnnouncements(false);
    }
  };

  useEffect(() => {
    if (botId) {
      fetchMembers();
      fetchAnnouncements();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId]);

  const confirmDeleteMember = (memberId: string) => {
    setPendingDeleteMemberId(memberId);
    setDeleteMemberModalOpen(true);
  };

  const executeDeleteMember = async () => {
    if (!pendingDeleteMemberId) return;
    const memberId = pendingDeleteMemberId;
    setDeleteMemberModalOpen(false);
    try {
      await fetch(`/api/bots/${botId}/members/${memberId}`, { method: 'DELETE' });
      setMembers(prev => prev.filter(m => m.id !== memberId));
      toast.success('Member removed');
    } catch {
      toast.error('Failed to remove member');
    } finally {
      setPendingDeleteMemberId(null);
    }
  };

  const handleCreateAnnouncement = async () => {
    if (!newAnnTitle.trim() || !newAnnContent.trim()) {
      toast.error('Please enter title and content');
      return;
    }
    setIsSavingAnn(true);
    try {
      const res = await fetch(`/api/bots/${botId}/announcements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newAnnTitle, content: newAnnContent }),
      });
      if (res.ok) {
        const data = await res.json();
        setAnnouncements(prev => [data.announcement, ...prev]);
        setNewAnnTitle('');
        setNewAnnContent('');
        toast.success('Announcement created');
      }
    } catch {
      toast.error('Failed to create announcement');
    } finally {
      setIsSavingAnn(false);
    }
  };

  const confirmDeleteAnnouncement = (annId: string) => {
    setPendingDeleteAnnId(annId);
    setDeleteAnnModalOpen(true);
  };

  const executeDeleteAnnouncement = async () => {
    if (!pendingDeleteAnnId) return;
    const annId = pendingDeleteAnnId;
    setDeleteAnnModalOpen(false);
    try {
      await fetch(`/api/bots/${botId}/announcements/${annId}`, { method: 'DELETE' });
      setAnnouncements(prev => prev.filter(a => a.id !== annId));
      toast.success('Announcement deleted');
    } catch {
      toast.error('Failed to delete announcement');
    } finally {
      setPendingDeleteAnnId(null);
    }
  };
  const confirmBroadcast = (annId: string) => {
    const ann = announcements.find(a => a.id === annId);
    if (!ann) return;

    const oldMembersCount = members.filter(m => m.memberType === 'old').length;
    if (oldMembersCount === 0) {
      toast.error('No old members to broadcast to. Mark some members as "Old Member" first.');
      return;
    }
    setPendingBroadcastAnnId(annId);
    setShouldPin(ann.isPinned ?? false); // Default to false for first-time or respect current state
    setBroadcastModalOpen(true);
  };

  const executeBroadcast = async () => {
    if (!pendingBroadcastAnnId) return;
    const annId = pendingBroadcastAnnId;
    setBroadcastModalOpen(false);
    setBroadcastingId(annId);
    try {
      const res = await fetch(`/api/bots/${botId}/announcements/${annId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: shouldPin }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(
          `Sent to ${data.sent} member(s)! ${data.failed > 0 ? `(${data.failed} failed)` : ''}`
        );
        await fetchAnnouncements();
      } else {
        toast.error(data.error || 'Broadcast failed');
      }
    } catch {
      toast.error('Broadcast failed');
    } finally {
      setBroadcastingId(null);
      setPendingBroadcastAnnId(null);
    }
  };

  const handleUnpin = (annId: string) => {
    setPendingUnpinAnnId(annId);
    setUnpinModalOpen(true);
  };

  const executeUnpin = async () => {
    if (!pendingUnpinAnnId) return;
    const annId = pendingUnpinAnnId;
    setUnpinModalOpen(false);
    setUnpinningId(annId);

    try {
      const res = await fetch(`/api/bots/${botId}/announcements/${annId}/unpin`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Unpinned for ${data.unpinned} member(s)!`);
        await fetchAnnouncements();
      } else {
        toast.error(data.error || 'Unpin failed');
      }
    } catch {
      toast.error('Unpin failed');
    } finally {
      setUnpinningId(null);
      setPendingUnpinAnnId(null);
    }
  };

  const router = useRouter();
  const searchParams = useSearchParams();

  // Handle Facebook OAuth callback redirect
  useEffect(() => {
    const fbConnected = searchParams.get('fb_connected');
    const fbError = searchParams.get('fb_error');

    if (fbConnected) {
      toast.success(`Connected to "${fbConnected}"!`);
      // Clean URL
      router.replace(`/dashboard/bots/${botId}`, { scroll: false });
      // Reload bot data
      getBotById(botId).then(data => {
        if (data) setBot(data);
      });
    } else if (fbError) {
      const messages: Record<string, string> = {
        cancelled: 'Facebook login was cancelled',
        not_configured: 'Facebook App not configured on server',
        token_exchange: 'Failed to exchange auth token',
        no_pages: 'No Facebook Pages found on your account',
        server_error: 'Server error during connection',
      };
      toast.error(messages[fbError] || 'Facebook connection failed');
      router.replace(`/dashboard/bots/${botId}`, { scroll: false });
    }
  }, [searchParams, botId, router]);

  useEffect(() => {
    async function loadBot() {
      try {
        const data = await getBotById(botId);
        setBot(data);
        if (data?.primaryColor) setPrimaryColor(data.primaryColor);
        if (data?.onboardingEnabled != null) setOnboardingEnabled(data.onboardingEnabled);
        if (data?.onboardingWelcome) setOnboardingWelcome(data.onboardingWelcome);
        if (data?.onboardingTopics) setOnboardingTopics(data.onboardingTopics as any);
      } catch (err) {
        toast.error('Failed to load bot');
        router.push('/dashboard/bots');
      } finally {
        setIsLoading(false);
      }
    }
    loadBot();
  }, [botId, router]);

  const handleEnhancePrompt = async (e: React.MouseEvent) => {
    e.preventDefault();
    const systemPromptInput = document.getElementById('systemPrompt') as HTMLTextAreaElement;
    const rawPrompt = systemPromptInput?.value;

    if (!rawPrompt || rawPrompt.trim() === '') {
      toast.error('Please enter some text in the System Prompt first');
      return;
    }

    setIsEnhancing(true);
    try {
      const res = await fetch(`/api/bots/${botId}/enhance-prompt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rawPrompt }),
      });

      if (!res.ok) {
        throw new Error('Failed to enhance prompt');
      }

      const data = await res.json();

      // Update the textarea value and bot state
      systemPromptInput.value = data.enhancedPrompt;
      setBot((prev: any) => ({ ...prev, systemPrompt: data.enhancedPrompt }));

      toast.success('Prompt enhanced successfully!');
    } catch (err) {
      toast.error('Failed to enhance prompt. Please try again.');
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      storeName: formData.get('storeName') as string,
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
    setIsAddingDoc(true);
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
      setIsAddingDoc(false);
    }
  };

  const handlePDFUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error('Please upload a PDF file');
      return;
    }

    setIsUploadingPDF(true);
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
      setIsUploadingPDF(false);
      // Reset input
      e.target.value = '';
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    setDocToDelete(docId);
  };

  const confirmDeleteDoc = async () => {
    if (!docToDelete) return;
    const docId = docToDelete;
    setDocToDelete(null);
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
            onClick={() => setIsDeleteModalOpen(true)}
          >
            <Trash className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <Tabs defaultValue="settings" className="w-full">
        <TabsList className={`flex flex-wrap md:grid w-full h-auto md:h-12 bg-zinc-100/50 rounded-2xl p-1 border border-zinc-100/50 shadow-sm md:max-w-4xl md:mx-auto ${
          bot.botCategory === 'website_bot' ? 'md:grid-cols-3' : 
          bot.botCategory === 'first_day_pro' ? 'md:grid-cols-4' : 
          bot.botCategory === 'telegram_agentic_sale' ? 'md:grid-cols-4' : 
          isSaleBot(bot?.botCategory || '') ? 'md:grid-cols-3' : 'md:grid-cols-4'
        }`}>
          <TabsTrigger
            value="settings"
            className="flex-1 md:rounded-xl text-xs sm:text-sm font-bold transition-all data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm data-[state=inactive]:text-zinc-500 hover:text-zinc-700"
          >
            Settings
          </TabsTrigger>

          {/* Platform Tab (Messenger / Telegram / Website) */}
          <TabsTrigger
            value="platform"
            className="flex-1 md:rounded-xl text-xs sm:text-sm font-bold transition-all data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm data-[state=inactive]:text-zinc-500 hover:text-zinc-700"
          >
            {bot?.botCategory === 'website_bot' ? 'Website' : 
             bot?.botCategory === 'messenger_sale' ? 'Messenger' : 'Telegram'}
          </TabsTrigger>

          {/* Store Tab (Sale bots only) */}
          {isSaleBot(bot?.botCategory || '') && (
            <TabsTrigger
              value="store"
              className="flex-1 md:rounded-xl text-xs sm:text-sm font-bold transition-all data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm data-[state=inactive]:text-zinc-500 hover:text-zinc-700"
            >
              Store Management
            </TabsTrigger>
          )}

          {/* Knowledge Tab (Website Bot or Onboarding Bot or Agentic) */}
          {(bot.botCategory === 'website_bot' || bot.botCategory === 'first_day_pro' || bot.botCategory === 'telegram_agentic_sale') && (
            <TabsTrigger
              value="knowledge"
              className="flex-1 md:rounded-xl text-xs sm:text-sm font-bold transition-all data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm data-[state=inactive]:text-zinc-500 hover:text-zinc-700"
            >
              Knowledge
            </TabsTrigger>
          )}

          {/* Onboarding Tab (First Day Pro only) */}
          {bot.botCategory === 'first_day_pro' && (
            <TabsTrigger
              value="onboarding"
              className="flex-1 md:rounded-xl text-xs sm:text-sm font-bold transition-all data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm data-[state=inactive]:text-zinc-500 hover:text-zinc-700"
            >
              Onboarding
            </TabsTrigger>
          )}
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

                {/* ── Bot Type (Immutable) ── */}
                {isSaleBot(bot?.botCategory || '') && (
                  <div className="space-y-4 pt-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-black text-zinc-900 uppercase tracking-widest">
                        Bot Type
                      </Label>
                      <span className="text-[10px] bg-zinc-900 text-white px-3 py-1 rounded-full font-black flex items-center gap-2 uppercase tracking-widest shadow-sm">
                        <Lock className="h-2.5 w-2.5" /> Immutable
                      </span>
                    </div>

                    <div className="group relative">
                      <div className="absolute inset-0 bg-linear-to-br from-blue-50 to-emerald-50 rounded-2xl blur-xl opacity-20 group-hover:opacity-40 transition-opacity" />
                      <div className="relative flex items-center p-6 rounded-2xl bg-white border border-zinc-100/80 gap-5 shadow-sm group-hover:shadow-md transition-all">
                        <div className="h-16 w-16 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform duration-500 shrink-0">
                          <span className="text-4xl">
                            {bot?.botType === 'appointment' ? '📅' : bot?.botType === 'ecommerce' ? '🛒' : '📞'}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div className="text-base font-black text-zinc-900 tracking-tight">
                            {bot?.botType === 'appointment'
                              ? 'Booking Agent'
                              : bot?.botType === 'ecommerce'
                                ? 'Online Shop Agent'
                                : 'Service & Info Agent'}
                          </div>
                          <p className="text-sm text-zinc-500 font-medium leading-relaxed">
                            This agent is optimized for{' '}
                            <span className="text-zinc-800 font-bold">
                              {bot?.botType === 'ecommerce'
                                ? 'products & orders'
                                : bot?.botType === 'appointment'
                                  ? 'slots & bookings'
                                  : 'information & services'}
                            </span>
                            . The core logic is locked for stability.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 px-1">
                      <div className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                      <p className="text-xs text-zinc-400 font-bold italic">
                        Tip: If you need a{' '}
                        {bot?.botType === 'ecommerce' ? 'Service' : 'Shop'} bot, please create a new agent.
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="systemPrompt">System Prompt</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleEnhancePrompt}
                      disabled={isEnhancing}
                      className="h-8 gap-1.5 text-xs font-medium border-violet-200 text-violet-700 hover:bg-violet-50 hover:text-violet-800"
                    >
                      {isEnhancing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Wand2 className="h-3.5 w-3.5" />
                      )}
                      ✨ Enhance Prompt
                    </Button>
                  </div>
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
                  disabled={isAddingDoc || !newDoc.trim()}
                  className="w-full h-11 rounded-xl font-bold transition-all active:scale-95 bg-zinc-900 hover:bg-zinc-800 text-white shadow-lg shadow-zinc-100"
                >
                  {isAddingDoc ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Text
                    </>
                  )}
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
                    disabled={isUploadingPDF}
                    className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  />
                  {isUploadingPDF && (
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

        {/* ─── ONBOARDING TAB ─── */}
        <TabsContent value="onboarding" className="mt-6 space-y-6">
          {/* Enable/Disable Toggle */}
          <Card className="border-none shadow-xl bg-white overflow-hidden">
            <CardHeader className="border-b border-zinc-50 pb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-linear-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center shadow-lg shrink-0">
                    <GraduationCap className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-bold">Onboarding</CardTitle>
                    <CardDescription>
                      Guide new employees with interactive menu buttons on Telegram.
                    </CardDescription>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const newValue = !onboardingEnabled;
                    setOnboardingEnabled(newValue);
                    try {
                      await updateBot(botId, { onboardingEnabled: newValue });
                      toast.success(newValue ? 'Onboarding enabled' : 'Onboarding disabled');
                    } catch {
                      setOnboardingEnabled(!newValue);
                      toast.error('Failed to update');
                    }
                  }}
                  className="flex items-center gap-2 transition-all"
                >
                  {onboardingEnabled ? (
                    <ToggleRight className="h-10 w-10 text-violet-500" />
                  ) : (
                    <ToggleLeft className="h-10 w-10 text-zinc-300" />
                  )}
                </button>
              </div>
            </CardHeader>

            {onboardingEnabled && (
              <CardContent className="pt-8 space-y-8">
                {/* Status Badge */}
                <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4 flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-violet-500" />
                  <p className="text-sm text-violet-800 font-medium">
                    Onboarding is <span className="font-bold">active</span>. When users type{' '}
                    <code className="bg-violet-100 px-1.5 py-0.5 rounded text-violet-700">
                      /start
                    </code>{' '}
                    on Telegram, they&apos;ll see your custom menu buttons.
                  </p>
                </div>

                {/* Welcome Message */}
                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                    Welcome Message
                  </Label>
                  <Textarea
                    value={onboardingWelcome}
                    onChange={e => setOnboardingWelcome(e.target.value)}
                    placeholder={`🎉 ${bot?.name || 'Bot'} မှ ကြိုဆိုပါတယ်!\n\nဘယ်အကြောင်း သိချင်ပါသလဲ? 👇`}
                    className="min-h-24 rounded-xl"
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl"
                      disabled={isSaving}
                      onClick={async () => {
                        setIsSaving(true);
                        try {
                          await updateBot(botId, { onboardingWelcome });
                          toast.success('Welcome message saved');
                        } catch {
                          toast.error('Failed to save');
                        } finally {
                          setIsSaving(false);
                        }
                      }}
                    >
                      {isSaving && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                      Save Message
                    </Button>
                  </div>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-4">
                  <div className="h-px flex-1 bg-zinc-100" />
                  <span className="text-[10px] font-black text-zinc-300 uppercase tracking-[0.2em]">
                    Menu Topics ({onboardingTopics.length})
                  </span>
                  <div className="h-px flex-1 bg-zinc-100" />
                </div>

                {/* Topics List */}
                <div className="space-y-3">
                  {onboardingTopics.length === 0 ? (
                    <div className="border-2 border-dashed border-zinc-200 rounded-2xl p-8 text-center">
                      <GraduationCap className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
                      <p className="text-sm text-zinc-500 font-medium">No topics added yet.</p>
                      <p className="text-xs text-zinc-400 mt-1">
                        Add topics to create menu buttons for Telegram.
                      </p>
                    </div>
                  ) : (
                    onboardingTopics.map((topic, index) => (
                      <Card
                        key={topic.id}
                        className="group hover:border-violet-200 transition-all shadow-sm bg-white"
                      >
                        <CardContent className="p-4 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-4 flex-1 min-w-0">
                            <div className="h-10 w-10 rounded-xl bg-violet-50 flex items-center justify-center shrink-0 border border-violet-100 text-lg">
                              {topic.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-bold text-zinc-900 truncate">
                                {topic.label}
                              </h4>
                              <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">
                                {topic.prompt}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-10 sm:group-hover:opacity-100 transition-opacity">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 rounded-xl text-zinc-500 hover:text-violet-500 hover:bg-violet-50"
                              onClick={() =>
                                setEditingTopic({
                                  index,
                                  icon: topic.icon,
                                  label: topic.label,
                                  prompt: topic.prompt || '',
                                  content: topic.content || '',
                                  buttonText: topic.buttonText || '',
                                  useAI: !!topic.useAI,
                                  images: topic.images || [],
                                  requireUpload: !!topic.requireUpload,
                                  verificationPrompt: topic.verificationPrompt || '',
                                  uploadInstruction: topic.uploadInstruction || '',
                                  requiredUploads: topic.requiredUploads || 1,
                                })
                              }
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 rounded-xl text-zinc-500 hover:text-rose-500 hover:bg-rose-50"
                              onClick={() => setTopicToDelete(index)}
                            >
                              <Trash className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>

                {/* Add New Topic */}
                {isAddingTopic ? (
                  <Card className="border-violet-200 bg-violet-50/30">
                    <CardContent className="p-6 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="space-y-1 w-20">
                          <Label className="text-xs font-bold text-zinc-500">Icon</Label>
                          <Input
                            value={newTopic.icon}
                            onChange={e => setNewTopic(prev => ({ ...prev, icon: e.target.value }))}
                            className="text-center text-lg h-12 rounded-xl"
                            maxLength={2}
                          />
                        </div>
                        <div className="space-y-1 flex-1">
                          <Label className="text-xs font-bold text-zinc-500">Button Name</Label>
                          <Input
                            value={newTopic.label}
                            onChange={e =>
                              setNewTopic(prev => ({ ...prev, label: e.target.value }))
                            }
                            placeholder="e.g. Company Info"
                            className="h-12 rounded-xl"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                        <Label className="text-sm font-bold text-zinc-700 flex-1">
                          Use AI to generate response?
                        </Label>
                        <button
                          type="button"
                          onClick={() => setNewTopic(prev => ({ ...prev, useAI: !prev.useAI }))}
                          className="flex items-center"
                        >
                          {newTopic.useAI ? (
                            <ToggleRight className="h-8 w-8 text-violet-500" />
                          ) : (
                            <ToggleLeft className="h-8 w-8 text-zinc-300" />
                          )}
                        </button>
                      </div>

                      {newTopic.useAI ? (
                        <div className="space-y-1">
                          <Label className="text-xs font-bold text-zinc-500">
                            AI Prompt (What should AI answer about this topic?)
                          </Label>
                          <Textarea
                            value={newTopic.prompt}
                            onChange={e =>
                              setNewTopic(prev => ({ ...prev, prompt: e.target.value }))
                            }
                            placeholder="e.g. Explain the company's history, mission, values, and culture to the new employee."
                            className="min-h-20 rounded-xl"
                          />
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <Label className="text-xs font-bold text-zinc-500">
                            Exact Message Content (Supports links and emoji)
                          </Label>
                          <Textarea
                            value={newTopic.content}
                            onChange={e =>
                              setNewTopic(prev => ({ ...prev, content: e.target.value }))
                            }
                            placeholder="e.g. Here is the orientation video: https://youtu.be/..."
                            className="min-h-20 rounded-xl"
                          />
                        </div>
                      )}

                      <div className="space-y-1">
                        <Label className="text-xs font-bold text-zinc-500">
                          Completion Button Text
                        </Label>
                        <Input
                          value={newTopic.buttonText}
                          onChange={e =>
                            setNewTopic(prev => ({ ...prev, buttonText: e.target.value }))
                          }
                          placeholder="e.g. already watched & process done (Default: ✅ ပြီးပါပြီ)"
                          className="h-12 rounded-xl"
                        />
                      </div>

                      {/* Photo URLs */}
                      <div className="space-y-2">
                        <Label className="text-xs font-bold text-zinc-500">
                          📸 Photos (Image URLs — Telegram မှာ album အနေနဲ့ ပို့ပေးမယ်)
                        </Label>
                        {newTopic.images.map((url, i) => (
                          <div key={i} className="flex gap-2">
                            <Input
                              value={url}
                              onChange={e => {
                                const imgs = [...newTopic.images];
                                imgs[i] = e.target.value;
                                setNewTopic(prev => ({ ...prev, images: imgs }));
                              }}
                              placeholder="https://example.com/photo.jpg"
                              className="rounded-xl flex-1"
                            />
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-10 w-10 rounded-xl text-rose-400 hover:bg-rose-50"
                              onClick={() => {
                                const imgs = newTopic.images.filter((_, j) => j !== i);
                                setNewTopic(prev => ({ ...prev, images: imgs }));
                              }}
                            >
                              <Trash className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-xl border-dashed text-xs"
                          onClick={() =>
                            setNewTopic(prev => ({ ...prev, images: [...prev.images, ''] }))
                          }
                        >
                          <Plus className="h-3 w-3 mr-1" /> Add Photo URL
                        </Button>
                      </div>

                      {/* Upload Verification */}
                      <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-xl border border-amber-100">
                        <Label className="text-sm font-bold text-amber-800 flex-1">
                          📸 Require Photo Upload for Verification?
                        </Label>
                        <button
                          type="button"
                          onClick={() =>
                            setNewTopic(prev => ({ ...prev, requireUpload: !prev.requireUpload }))
                          }
                          className="flex items-center"
                        >
                          {newTopic.requireUpload ? (
                            <ToggleRight className="h-8 w-8 text-amber-500" />
                          ) : (
                            <ToggleLeft className="h-8 w-8 text-zinc-300" />
                          )}
                        </button>
                      </div>
                      {newTopic.requireUpload && (
                        <>
                          <div className="space-y-1">
                            <Label className="text-xs font-bold text-zinc-500">
                              AI Verification Prompt (AI ကို ဘာစစ်ခိုင်းမလဲ?)
                            </Label>
                            <Textarea
                              value={newTopic.verificationPrompt}
                              onChange={e =>
                                setNewTopic(prev => ({
                                  ...prev,
                                  verificationPrompt: e.target.value,
                                }))
                              }
                              placeholder="e.g. Check if the screenshot shows 2FA has been enabled"
                              className="min-h-20 rounded-xl"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-bold text-zinc-500">
                              User ကို ပြမယ့် Instruction (bot message)
                            </Label>
                            <Input
                              value={newTopic.uploadInstruction}
                              onChange={e =>
                                setNewTopic(prev => ({
                                  ...prev,
                                  uploadInstruction: e.target.value,
                                }))
                              }
                              placeholder="e.g. 📸 2FA enable ပြီးကြောင်း screenshot ရိုက်ပို့ပေးပါ။"
                              className="rounded-xl"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-bold text-zinc-500">
                              Required Upload Count (ဘယ်နှစ်ခု ပို့ရမလဲ?)
                            </Label>
                            <Input
                              type="number"
                              min={1}
                              value={newTopic.requiredUploads}
                              onChange={e =>
                                setNewTopic(prev => ({
                                  ...prev,
                                  requiredUploads: parseInt(e.target.value) || 1,
                                }))
                              }
                              className="rounded-xl w-32"
                            />
                          </div>
                        </>
                      )}

                      <div className="flex justify-end gap-2 mt-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-xl"
                          onClick={() => {
                            setIsAddingTopic(false);
                            setNewTopic({
                              icon: '📋',
                              label: '',
                              prompt: '',
                              content: '',
                              buttonText: '',
                              useAI: false,
                              images: [],
                              requireUpload: false,
                              verificationPrompt: '',
                              uploadInstruction: '',
                              requiredUploads: 1,
                            });
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="rounded-xl bg-violet-600 hover:bg-violet-700"
                          disabled={
                            !newTopic.label.trim() ||
                            (newTopic.useAI ? !newTopic.prompt.trim() : !newTopic.content.trim()) ||
                            isSaving
                          }
                          onClick={async () => {
                            setIsSaving(true);
                            const topic = {
                              id: `topic_${Date.now()}`,
                              icon: newTopic.icon || '📋',
                              label: newTopic.label,
                              prompt: newTopic.prompt,
                              content: newTopic.content,
                              buttonText: newTopic.buttonText,
                              useAI: newTopic.useAI,
                              images: newTopic.images,
                              requireUpload: newTopic.requireUpload,
                              verificationPrompt: newTopic.verificationPrompt,
                              uploadInstruction: newTopic.uploadInstruction,
                              requiredUploads: newTopic.requiredUploads,
                            };
                            const updated = [...onboardingTopics, topic];
                            setOnboardingTopics(updated);
                            try {
                              await updateBot(botId, { onboardingTopics: updated });
                              toast.success('Topic added');
                              setNewTopic({
                                icon: '📋',
                                label: '',
                                prompt: '',
                                content: '',
                                buttonText: '',
                                useAI: false,
                                images: [],
                                requireUpload: false,
                                verificationPrompt: '',
                                uploadInstruction: '',
                                requiredUploads: 1,
                              });
                              setIsAddingTopic(false);
                            } catch {
                              setOnboardingTopics(onboardingTopics);
                              toast.error('Failed to add topic');
                            } finally {
                              setIsSaving(false);
                            }
                          }}
                        >
                          {isSaving && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                          Add Topic
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full rounded-xl h-12 border-dashed border-2 border-violet-200 text-violet-600 hover:bg-violet-50 hover:border-violet-300 font-bold"
                    onClick={() => setIsAddingTopic(true)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add New Topic
                  </Button>
                )}

                {/* Telegram Preview — Step-by-Step */}
                {onboardingTopics.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-4">
                      <div className="h-px flex-1 bg-zinc-100" />
                      <span className="text-[10px] font-black text-zinc-300 uppercase tracking-[0.2em]">
                        Telegram Preview (Step-by-Step)
                      </span>
                      <div className="h-px flex-1 bg-zinc-100" />
                    </div>
                    <div className="bg-[#17212b] rounded-2xl p-6 space-y-3 max-w-sm mx-auto">
                      {/* Welcome Message */}
                      <div className="bg-[#2b5278] rounded-2xl rounded-tl-sm p-3">
                        <p className="text-white text-sm whitespace-pre-line">
                          {onboardingWelcome ||
                            `🎉 ${bot?.name || 'Bot'} မှ ကြိုဆိုပါတယ်!\n\nOnboarding process ကို တစ်ဆင့်ချင်း လုပ်သွားပါမယ်။`}
                        </p>
                      </div>
                      {/* Step Card */}
                      <div className="bg-[#2b5278] rounded-2xl rounded-tl-sm p-3 space-y-2">
                        <p className="text-white text-sm font-bold">
                          📋 Step 1 / {onboardingTopics.length}
                        </p>
                        <p className="text-xs">
                          {onboardingTopics.map((_, i) => (
                            <span key={i}>{i === 0 ? '🔵' : '⚪'}</span>
                          ))}
                        </p>
                        <p className="text-white text-sm">
                          {onboardingTopics[0]?.icon}{' '}
                          <span className="font-bold">{onboardingTopics[0]?.label}</span>
                        </p>
                        <p className="text-zinc-400 text-xs">
                          အောက်က button ကိုနှိပ်ပြီး ဖတ်ပါ / ကြည့်ပါ 👇
                        </p>
                      </div>
                      <div className="bg-[#2b5278] hover:bg-[#3a6a9e] rounded-lg p-2.5 text-center cursor-pointer transition-colors">
                        <span className="text-[#64b5ef] text-xs font-medium">
                          ▶️ ဖတ်ရန် / ကြည့်ရန်
                        </span>
                      </div>
                      {/* Steps Overview */}
                      <div className="border-t border-zinc-700 pt-3 mt-2">
                        <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider mb-2">
                          Steps Flow:
                        </p>
                        {onboardingTopics.map((topic, i) => (
                          <div key={topic.id} className="flex items-center gap-2 py-1">
                            <span className="text-zinc-500 text-xs">{i === 0 ? '🔵' : '⚪'}</span>
                            <span className="text-zinc-400 text-xs">
                              Step {i + 1}: {topic.icon} {topic.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ─── Completion Tracker ─── */}
                <div className="flex items-center gap-4 pt-4">
                  <div className="h-px flex-1 bg-zinc-100" />
                  <span className="text-[10px] font-black text-zinc-300 uppercase tracking-[0.2em]">
                    Completion Tracker
                  </span>
                  <div className="h-px flex-1 bg-zinc-100" />
                </div>

                <Card className="border border-zinc-100 shadow-sm bg-zinc-50/50">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center border border-emerald-100">
                          <Users className="h-5 w-5 text-emerald-600" />
                        </div>
                        <div>
                          <CardTitle className="text-base font-bold">Employee Progress</CardTitle>
                          <CardDescription className="text-xs">
                            Track who has completed onboarding topics
                          </CardDescription>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-xl gap-2"
                        onClick={fetchCompletions}
                        disabled={isLoadingCompletions}
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${isLoadingCompletions ? 'animate-spin' : ''}`}
                        />
                        {completionData ? 'Refresh' : 'Load Data'}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {!completionData && !isLoadingCompletions && (
                      <div className="border-2 border-dashed border-zinc-200 rounded-2xl p-8 text-center">
                        <Users className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
                        <p className="text-sm text-zinc-500 font-medium">
                          Click &quot;Load Data&quot; to see employee progress
                        </p>
                        <p className="text-xs text-zinc-400 mt-1">
                          Tracks when users tap &quot;✅ ဖတ်ပြီးပါပြီ&quot; after reading a topic.
                        </p>
                      </div>
                    )}

                    {isLoadingCompletions && (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
                      </div>
                    )}

                    {completionData && !isLoadingCompletions && (
                      <>
                        {/* Summary Stats */}
                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-white rounded-xl p-4 border border-zinc-100 text-center">
                            <p className="text-2xl font-black text-zinc-900">
                              {completionData.totalUsers}
                            </p>
                            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mt-1">
                              Total Users
                            </p>
                          </div>
                          <div className="bg-white rounded-xl p-4 border border-emerald-100 text-center">
                            <p className="text-2xl font-black text-emerald-600">
                              {completionData.fullyCompleted}
                            </p>
                            <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mt-1">
                              Completed
                            </p>
                          </div>
                          <div className="bg-white rounded-xl p-4 border border-amber-100 text-center">
                            <p className="text-2xl font-black text-amber-600">
                              {completionData.totalUsers - completionData.fullyCompleted}
                            </p>
                            <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider mt-1">
                              In Progress
                            </p>
                          </div>
                        </div>

                        {/* User List */}
                        {completionData.users.length === 0 ? (
                          <div className="border-2 border-dashed border-zinc-200 rounded-2xl p-6 text-center">
                            <p className="text-sm text-zinc-500">
                              No users have started onboarding yet.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {completionData.users.map((user: any) => (
                              <div
                                key={user.telegramChatId}
                                className="bg-white rounded-xl border border-zinc-100 overflow-hidden transition-all"
                              >
                                <button
                                  type="button"
                                  className="w-full p-4 flex items-center justify-between gap-3 hover:bg-zinc-50 transition-colors"
                                  onClick={() =>
                                    setExpandedUser(
                                      expandedUser === user.telegramChatId
                                        ? null
                                        : user.telegramChatId
                                    )
                                  }
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div
                                      className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${
                                        user.isComplete
                                          ? 'bg-emerald-100 text-emerald-600'
                                          : 'bg-amber-100 text-amber-600'
                                      }`}
                                    >
                                      {user.isComplete ? (
                                        <CheckCircle2 className="h-4.5 w-4.5" />
                                      ) : (
                                        <Clock className="h-4.5 w-4.5" />
                                      )}
                                    </div>
                                    <div className="text-left min-w-0">
                                      <p className="text-sm font-bold text-zinc-900 truncate">
                                        {user.telegramUsername
                                          ? `@${user.telegramUsername}`
                                          : `User ${user.telegramChatId}`}
                                      </p>
                                      <p className="text-xs text-zinc-400">
                                        {user.completedCount}/{user.totalTopics} topics
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    {/* Progress Bar */}
                                    <div className="w-24 h-2 bg-zinc-100 rounded-full overflow-hidden hidden sm:block">
                                      <div
                                        className={`h-full rounded-full transition-all ${
                                          user.isComplete ? 'bg-emerald-500' : 'bg-amber-400'
                                        }`}
                                        style={{
                                          width: `${(user.completedCount / user.totalTopics) * 100}%`,
                                        }}
                                      />
                                    </div>
                                    <span
                                      className={`text-xs font-bold px-2 py-1 rounded-lg ${
                                        user.isComplete
                                          ? 'bg-emerald-50 text-emerald-700'
                                          : 'bg-amber-50 text-amber-700'
                                      }`}
                                    >
                                      {user.isComplete
                                        ? '✅ Done'
                                        : `${Math.round((user.completedCount / user.totalTopics) * 100)}%`}
                                    </span>
                                    {expandedUser === user.telegramChatId ? (
                                      <ChevronUp className="h-4 w-4 text-zinc-400" />
                                    ) : (
                                      <ChevronDown className="h-4 w-4 text-zinc-400" />
                                    )}
                                  </div>
                                </button>

                                {/* Expanded Details */}
                                {expandedUser === user.telegramChatId && (
                                  <div className="px-4 pb-4 pt-0 border-t border-zinc-50">
                                    <div className="space-y-2 mt-3">
                                      {onboardingTopics.map(topic => {
                                        const completed = user.completedTopics.find(
                                          (ct: any) => ct.topicId === topic.id
                                        );
                                        return (
                                          <div
                                            key={topic.id}
                                            className={`flex items-center justify-between p-2.5 rounded-lg text-sm ${
                                              completed
                                                ? 'bg-emerald-50 text-emerald-800'
                                                : 'bg-zinc-50 text-zinc-400'
                                            }`}
                                          >
                                            <div className="flex items-center gap-2">
                                              {completed ? (
                                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                              ) : (
                                                <div className="h-4 w-4 rounded-full border-2 border-zinc-300" />
                                              )}
                                              <span className="font-medium">
                                                {topic.icon} {topic.label}
                                              </span>
                                            </div>
                                            {completed && (
                                              <span className="text-[10px] font-medium text-emerald-600">
                                                {new Date(completed.completedAt).toLocaleDateString(
                                                  'en-US',
                                                  {
                                                    month: 'short',
                                                    day: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                  }
                                                )}
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              </CardContent>
            )}
          </Card>
        </TabsContent>

        {(bot.botCategory === 'first_day_pro' || bot.botCategory === 'telegram_sale' || bot.botCategory === 'telegram_agentic_sale') && (
          <TabsContent value="platform" className="mt-6">
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
                    onClick={() => setIsDisconnectTelegramOpen(true)}
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

          {(bot.botCategory === 'telegram_sale' || bot.botCategory === 'telegram_agentic_sale') && (
            <div className="space-y-6 mt-6">
              {/* ── Welcome Message ── */}
              <Card className="border-none shadow-xl bg-white overflow-hidden">
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-zinc-800 flex items-center gap-2">
                        <span className="text-xl">🏪</span> Shop Name
                      </p>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Your brand name used in conversations.
                      </p>
                    </div>
                  </div>
                  <Input
                    id="telegramStoreName"
                    defaultValue={bot.storeName || ''}
                    placeholder="e.g. My Awesome Shop"
                    className="rounded-xl border-zinc-100 bg-zinc-50/50 text-sm h-12"
                  />

                  <div className="flex items-center justify-between pt-2">
                    <div>
                      <p className="font-bold text-zinc-800 flex items-center gap-2">
                        <span className="text-xl">👋</span> Welcome Message
                      </p>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Sent when a new user starts your Telegram bot.
                      </p>
                    </div>
                  </div>
                  <Textarea
                    id="telegramWelcomeMessage"
                    defaultValue={
                      bot.telegramWelcomeMessage ??
                      (bot.botCategory === 'telegram_agentic_sale'
                        ? `🙏 မင်္ဂလာပါရှင်! ${bot.storeName ? `"${bot.storeName}"` : 'ကျွန်မတို့ဆိုင်'} မှ ကြိုဆိုပါတယ်။\n\nကျွန်မတို့ရဲ့ ထုတ်ကုန်လေးတွေနဲ့ ပတ်သက်ပြီး သိချင်တာရှိရင် ကျွန်မကို တိုက်ရိုက် မေးမြန်းနိုင်ပါတယ်ရှင်။ ဘာများ ကူညီပေးရမလဲရှင့်? 😊`
                        : `🙏 မင်္ဂလာပါရှင်! ${bot.storeName ? `"${bot.storeName}"` : 'ကျွန်မတို့ဆိုင်'} မှ ကြိုဆိုပါတယ်။\n\nမည်သည်များကို ကူညီပေးရမလဲဆိုတာ Menu မှတစ်ဆင့် ရွေးချယ်နိုင်ပါတယ်ရှင်။ 😊`)
                    }
                    rows={4}
                    className="rounded-xl border-zinc-100 bg-zinc-50/50 text-sm resize-none"
                    placeholder="Enter welcome message..."
                  />
                  <Button
                    size="sm"
                    variant="default"
                    className="rounded-full px-6 font-bold bg-sky-600 hover:bg-sky-700 h-10 shadow-lg shadow-sky-200"
                    disabled={isSaving}
                    onClick={async () => {
                      setIsSaving(true);
                      const msg = (
                        document.getElementById('telegramWelcomeMessage') as HTMLTextAreaElement
                      )?.value;
                      const sName = (
                        document.getElementById('telegramStoreName') as HTMLInputElement
                      )?.value;
                      
                      try {
                        const res = await fetch(`/api/bots/${bot.id}/telegram`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ 
                            telegramWelcomeMessage: msg,
                            storeName: sName 
                          }),
                        });
                        if (res.ok) {
                          setBot({ ...bot, telegramWelcomeMessage: msg, storeName: sName });
                          toast.success('Settings saved!');
                        } else {
                          toast.error('Failed to save settings');
                        }
                      } finally {
                        setIsSaving(false);
                      }
                    }}
                  >
                    {isSaving && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                    Save Settings
                  </Button>
                </CardContent>
              </Card>

              {/* ── Contact Message ── */}
              <Card className="border-none shadow-xl bg-white overflow-hidden">
                <CardContent className="pt-6 space-y-4">
                  <div>
                    <p className="font-bold text-zinc-800 flex items-center gap-2">
                      <span className="text-xl">📞</span> Contact Us Message
                    </p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Sent when a user asks to contact the business.
                    </p>
                  </div>
                  <Textarea
                    id="telegramContactMessage"
                    defaultValue={
                      bot.telegramContactMessage ??
                      '📞 အသေးစိတ်သိရှိလိုပါက ကျွန်မတို့ဆီကို Chat မှတစ်ဆင့်ဖြစ်စေ၊ ဖုန်းဆက်၍ဖြစ်စေ တိုက်ရိုက် ဆက်သွယ်မေးမြန်းနိုင်ပါတယ်နော်။ 😊'
                    }
                    rows={3}
                    className="rounded-xl border-zinc-100 bg-zinc-50/50 text-sm resize-none"
                    placeholder="Enter contact message..."
                  />
                  <Button
                    size="sm"
                    variant="default"
                    className="rounded-full px-6 font-bold bg-sky-600 hover:bg-sky-700 h-10 shadow-lg shadow-sky-200"
                    onClick={async () => {
                      const msg = (
                        document.getElementById('telegramContactMessage') as HTMLTextAreaElement
                      )?.value;
                      const res = await fetch(`/api/bots/${bot.id}/telegram`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ telegramContactMessage: msg }),
                      });
                      if (res.ok) {
                        setBot({ ...bot, telegramContactMessage: msg });
                        toast.success('Contact message saved!');
                      } else {
                        toast.error('Failed to save contact message');
                      }
                    }}
                  >
                    Save Contact Message
                  </Button>
                </CardContent>
              </Card>

              {/* ── Payment Instructions Message ── */}
              <Card className="border-none shadow-xl bg-white overflow-hidden">
                <CardContent className="pt-6 space-y-4">
                  <div>
                    <p className="font-bold text-zinc-800 flex items-center gap-2">
                      <span className="text-xl">💳</span> Payment Instructions Message
                    </p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Sent to request a screenshot of payment or transaction text when checking out.
                    </p>
                  </div>
                  <Textarea
                    id="telegramPaymentMessage"
                    defaultValue={
                      bot.telegramPaymentMessage ??
                      '🏦 ငွေလွှဲရန် အချက်အလက်များ:\n1. KBZ Pay (KPay)\nAccount Name: Your Shop Name\nPhone Number: 09-123456789\n\n2. Wave Pay\nAccount Name: Your Shop Name\nPhone Number: 09-123456789\n\n3. KBZ Bank\nAccount Name: Your Shop Name\nAccount Number: 999 999 999 999 999\n\n4. CB Bank\nAccount Name: Your Shop Name\nAccount Number: 000 000 000 000 000\n\nမှတ်ချက်။ ငွေလွှဲပြီးပါက ငွေလွှဲပြေစာ (Screenshot) သိုမဟုတ် ငွေလွှဲ Transaction နံပါတ်ကို ပေးပို့ပေးပါခင်ဗျာ။'
                    }
                    rows={12}
                    className="rounded-xl border-zinc-100 bg-zinc-50/50 text-sm resize-none Myanmar-font"
                    placeholder="Enter payment instructions..."
                  />
                  <Button
                    size="sm"
                    variant="default"
                    className="rounded-full px-6 font-bold bg-sky-600 hover:bg-sky-700 h-10 shadow-lg shadow-sky-200"
                    onClick={async () => {
                      const msg = (
                        document.getElementById('telegramPaymentMessage') as HTMLTextAreaElement
                      )?.value;
                      const res = await fetch(`/api/bots/${bot.id}/telegram`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ telegramPaymentMessage: msg }),
                      });
                      if (res.ok) {
                        setBot({ ...bot, telegramPaymentMessage: msg });
                        toast.success('Payment instructions saved!');
                      } else {
                        toast.error('Failed to save payment instructions');
                      }
                    }}
                  >
                    Save Payment Instructions
                  </Button>
                </CardContent>
              </Card>

              {/* ── Persistent Menu ── */}
              <Card className="border-none shadow-xl bg-white overflow-hidden">
                <CardContent className="pt-6 space-y-4">
                  <div>
                    <p className="font-bold text-zinc-800 flex items-center gap-2">
                      <span className="text-xl">☰</span> Persistent Menu
                    </p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Commands that appear in the Telegram menu button.
                    </p>
                  </div>

                  <div className="bg-zinc-50 border border-zinc-100 rounded-2xl overflow-hidden divide-y divide-zinc-100 shadow-sm">
                    <div className="bg-white/50 px-5 py-3 border-b border-zinc-100">
                      <p className="text-[10px] uppercase font-black text-zinc-400 tracking-widest">
                        {bot.botCategory === 'telegram_agentic_sale'
                          ? 'Agentic Minimal Menu'
                          : bot.botType === 'service'
                           ? 'Fixed Service Menu'
                           : bot.botType === 'appointment'
                             ? 'Fixed Appointment Menu'
                             : 'Fixed E-Commerce Menu'}
                      </p>
                    </div>
                    {(bot.botCategory === 'telegram_agentic_sale'
                      ? [
                          { emoji: '🏠', label: 'အစသို့', payload: 'start' },
                          { emoji: '📞', label: 'ဆက်သွယ်ရန်', payload: 'contact' },
                        ]
                      : (bot.botType === 'appointment'
                        ? [
                            { emoji: '🏠', label: 'အစသို့', payload: 'start' },
                            { emoji: '📅', label: 'ရက်ချိန်းယူမည်', payload: 'view_services' },
                            { emoji: '🧾', label: 'ရက်ချိန်းစစ်ရန်', payload: 'check_orders' },
                            { emoji: '📞', label: 'ဆက်သွယ်ရန်', payload: 'contact_us' },
                          ]
                        : bot.botType === 'service'
                          ? [
                              { emoji: '🏠', label: 'အစသို့', payload: 'start' },
                              { emoji: '🛠️', label: 'ဝန်ဆောင်မှုများ', payload: 'view_services' },
                              { emoji: '🧾', label: 'မှာထားတာတွေစစ်ရန်', payload: 'check_orders' },
                              { emoji: '📞', label: 'ဆက်သွယ်ရန်', payload: 'contact_us' },
                            ]
                          : [
                              { emoji: '🏠', label: 'အစသို့', payload: 'start' },
                              { emoji: '📦', label: 'ပစ္စည်းများကြည့်ရန်', payload: 'view_products' },
                              { emoji: '🛒', label: 'Cart ကြည့်ရန်', payload: 'view_cart' },
                              { emoji: '🧾', label: 'မှာထားတာတွေစစ်ရန်', payload: 'check_orders' },
                              { emoji: '📞', label: 'ဆက်သွယ်ရန်', payload: 'contact_us' },
                            ]
                      )
                    ).map((item, idx) => (
                      <div
                        key={'fixed-tg' + idx}
                        className="flex items-center gap-3 px-5 py-3 text-sm text-zinc-700 bg-white"
                      >
                        <span className="text-lg">{item.emoji}</span>
                        <span className="font-bold text-zinc-900">{item.label}</span>
                        <code className="ml-auto text-[10px] text-zinc-400 bg-zinc-100/80 px-2 py-0.5 rounded-full font-mono">
                          /{item.payload}
                        </code>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-zinc-100 mt-2">
                    <Button
                      size="sm"
                      variant="default"
                      className="rounded-full px-6 font-bold bg-sky-600 hover:bg-sky-700 h-10 shadow-lg shadow-sky-200"
                      disabled={telegramMenuAction !== null}
                      onClick={async () => {
                        setTelegramMenuAction('setup');
                        try {
                          const res = await fetch(`/api/bots/${bot.id}/telegram/menu`, {
                            method: 'POST',
                          });
                          if (res.ok) {
                            toast.success('Menu pushed to Telegram successfully!');
                          } else {
                            const data = await res.json();
                            toast.error(data.error || 'Failed to push menu');
                          }
                        } catch (err) {
                          toast.error('Network error');
                        } finally {
                          setTelegramMenuAction(null);
                        }
                      }}
                    >
                      {telegramMenuAction === 'setup' ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-1.5 h-4 w-4" />
                      )}
                      {telegramMenuAction === 'setup' ? 'Pushing...' : 'Push to Telegram'}
                    </Button>

                    <div className="flex-1" />

                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full px-5 font-bold h-10 border-rose-100 text-rose-600 hover:bg-rose-50 hover:border-rose-200"
                      disabled={telegramMenuAction !== null}
                      onClick={async () => {
                        setTelegramMenuAction('remove');
                        try {
                          const res = await fetch(`/api/bots/${bot.id}/telegram/menu`, {
                            method: 'DELETE',
                          });
                          if (res.ok) {
                            toast.success('Telegram menu removed!');
                          } else {
                            const data = await res.json();
                            toast.error(data.error || 'Failed to remove menu');
                          }
                        } catch (err) {
                          toast.error('Network error');
                        } finally {
                          setTelegramMenuAction(null);
                        }
                      }}
                    >
                      {telegramMenuAction === 'remove' ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : null}
                      {telegramMenuAction === 'remove' ? 'Removing...' : 'Remove Menu'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ─── Members Management (First Day Pro only) ─── */}
          {bot.botCategory === 'first_day_pro' && (<Card className="border-none shadow-xl bg-white overflow-hidden mt-6">
            <CardHeader className="border-b border-zinc-50 pb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-indigo-500 text-white flex items-center justify-center shadow-lg shrink-0">
                    <Users className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-bold">Members</CardTitle>
                    <CardDescription>
                      Manage old &amp; new members. Old members receive HR announcements.
                    </CardDescription>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl h-9 gap-2 border-indigo-100 text-indigo-700 hover:bg-indigo-50"
                  onClick={() => fetchMembers()}
                  disabled={isLoadingMembers}
                  id="refresh-members-btn"
                >
                  {isLoadingMembers ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {/* Info banner */}
              <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex gap-3 mb-6">
                <div className="h-5 w-5 rounded-full bg-indigo-500 flex items-center justify-center shrink-0 mt-0.5">
                  <Users className="h-3 w-3 text-white" />
                </div>
                <div className="text-sm text-indigo-800 leading-relaxed">
                  <p className="font-bold mb-1">Member Registration</p>
                  <p className="text-indigo-700 text-xs">
                    When users type <code className="bg-indigo-100 px-1 rounded">/start</code> in
                    your Telegram bot for the first time,
                    <span className="font-semibold">
                      they will be asked to choose if they are a New or Old Member.
                    </span>
                  </p>
                </div>
              </div>

              {members.length === 0 ? (
                <div className="border-2 border-dashed border-zinc-200 rounded-2xl p-10 text-center">
                  {isLoadingMembers ? (
                    <Loader2 className="h-8 w-8 text-zinc-300 mx-auto animate-spin" />
                  ) : (
                    <>
                      <Users className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
                      <p className="text-sm text-zinc-500 font-medium">No members yet.</p>
                      <p className="text-xs text-zinc-400 mt-1">
                        Members appear here when they use /start in your Telegram bot.
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-4 rounded-xl"
                        onClick={fetchMembers}
                        id="load-members-btn"
                      >
                        Load Members
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Stats row */}
                  <div className="flex gap-3 mb-4">
                    <div className="flex-1 bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
                      <p className="text-2xl font-black text-amber-600">
                        {members.filter(m => m.memberType === 'old').length}
                      </p>
                      <p className="text-xs text-amber-700 font-medium mt-0.5">Old Members</p>
                    </div>
                    <div className="flex-1 bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
                      <p className="text-2xl font-black text-emerald-600">
                        {members.filter(m => m.memberType === 'new').length}
                      </p>
                      <p className="text-xs text-emerald-700 font-medium mt-0.5">New Members</p>
                    </div>
                    <div className="flex-1 bg-zinc-50 border border-zinc-100 rounded-xl p-3 text-center">
                      <p className="text-2xl font-black text-zinc-700">{members.length}</p>
                      <p className="text-xs text-zinc-500 font-medium mt-0.5">Total</p>
                    </div>
                  </div>

                  {members.map((member: any) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between gap-3 p-4 rounded-xl border border-zinc-100 bg-zinc-50/50 hover:bg-white hover:border-zinc-200 transition-all group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 shadow ${member.memberType === 'old' ? 'bg-amber-400' : 'bg-sky-400'}`}
                        >
                          {(member.firstName || member.telegramUsername || '?')[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-zinc-900 truncate">
                            {member.firstName
                              ? `${member.firstName}${member.lastName ? ' ' + member.lastName : ''}`
                              : member.telegramUsername
                                ? `@${member.telegramUsername}`
                                : `Chat ${member.telegramChatId}`}
                          </p>
                          <p className="text-xs text-zinc-400 font-mono">
                            ID: {member.telegramChatId}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {member.memberType === 'old' ? (
                          <div className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border bg-amber-50 border-amber-200 text-amber-700 cursor-default">
                            ⭐ Old Member
                          </div>
                        ) : member.isComplete ? (
                          <div className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border bg-emerald-50 border-emerald-200 text-emerald-700 cursor-default">
                            ✅ Completed
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border bg-sky-50 border-sky-200 text-sky-700 cursor-default">
                            🆕 Step {member.completedSteps} / {member.totalSteps}
                          </div>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-50 transition-all"
                          onClick={() => confirmDeleteMember(member.id)}
                          id={`delete-member-${member.id}`}
                        >
                          <Trash className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>)}

          {/* ─── Announcements (First Day Pro only) ─── */}
          {bot.botCategory === 'first_day_pro' && (<Card className="border-none shadow-xl bg-white overflow-hidden mt-6">
            <CardHeader className="border-b border-zinc-50 pb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-rose-500 text-white flex items-center justify-center shadow-lg shrink-0">
                    <MessageSquare className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-bold">HR Announcements</CardTitle>
                    <CardDescription>
                      Create and broadcast announcements to all old members via Telegram.
                    </CardDescription>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl h-9 gap-2 border-rose-100 text-rose-700 hover:bg-rose-50"
                  onClick={() => fetchAnnouncements()}
                  disabled={isLoadingAnnouncements}
                  id="refresh-announcements-btn"
                >
                  {isLoadingAnnouncements ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              {/* Create new announcement */}
              <div className="bg-rose-50/50 border border-rose-100 rounded-2xl p-5 space-y-4">
                <p className="text-sm font-bold text-rose-900 flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  New Announcement
                </p>
                <div className="space-y-3">
                  <Input
                    id="ann-title"
                    placeholder="Announcement title (e.g. Company Holiday Notice)"
                    value={newAnnTitle}
                    onChange={e => setNewAnnTitle(e.target.value)}
                    className="h-11 rounded-xl border-rose-100 bg-white focus:border-rose-300 transition-all"
                  />
                  <Textarea
                    id="ann-content"
                    placeholder="Write your announcement content here in Myanmar or English..."
                    value={newAnnContent}
                    onChange={e => setNewAnnContent(e.target.value)}
                    className="min-h-24 rounded-xl border-rose-100 bg-white focus:border-rose-300 transition-all"
                  />
                  <Button
                    onClick={handleCreateAnnouncement}
                    disabled={isSavingAnn || !newAnnTitle.trim() || !newAnnContent.trim()}
                    className="w-full rounded-xl h-11 font-bold bg-rose-600 hover:bg-rose-700 text-white"
                    id="create-announcement-btn"
                  >
                    {isSavingAnn ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-2 h-4 w-4" />
                    )}
                    Create Announcement
                  </Button>
                </div>
              </div>

              {/* Announcements list */}
              <div>
                <div className="flex items-center gap-4 mb-4">
                  <div className="h-px flex-1 bg-zinc-100" />
                  <span className="text-[10px] font-black text-zinc-300 uppercase tracking-[0.2em]">
                    Announcements ({announcements.length})
                  </span>
                  <div className="h-px flex-1 bg-zinc-100" />
                </div>

                {isLoadingAnnouncements ? (
                  <div className="border-2 border-dashed border-zinc-200 rounded-[32px] p-16 text-center bg-zinc-50/30">
                    <Loader2 className="h-10 w-10 text-violet-200 mx-auto animate-spin" />
                  </div>
                ) : announcements.length === 0 ? (
                  <div className="border-2 border-dashed border-zinc-200 rounded-[32px] p-16 text-center bg-zinc-50/30">
                    <div className="max-w-xs mx-auto space-y-4">
                      <div className="h-20 w-20 bg-white rounded-[28px] shadow-xl shadow-zinc-200/50 flex items-center justify-center mx-auto mb-6">
                        <MessageSquare className="h-10 w-10 text-zinc-300" />
                      </div>
                      <p className="text-lg font-bold text-zinc-900">No announcements yet</p>
                      <p className="text-sm text-zinc-500 font-medium">
                        Create your first announcement above and broadcast it to all old members.
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-4 rounded-xl border-zinc-200"
                        onClick={fetchAnnouncements}
                        id="load-announcements-btn"
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Refresh List
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {announcements.map((ann: any) => (
                      <div
                        key={ann.id}
                        className="group relative border border-zinc-100 rounded-[28px] p-6 bg-white hover:border-violet-100 hover:shadow-2xl hover:shadow-zinc-200/50 transition-all duration-300"
                      >
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                          <div className="flex-1 min-w-0 space-y-3">
                            <div className="flex items-center flex-wrap gap-2.5">
                              <h4 className="font-bold text-zinc-900 text-[15px] truncate max-w-sm">
                                {ann.title}
                              </h4>
                              <div className="flex gap-2">
                                {ann.isSent ? (
                                  <span className="flex items-center gap-1.5 text-[10px] font-black text-emerald-600 bg-emerald-50/50 border border-emerald-100 px-2.5 py-1 rounded-full uppercase tracking-wider">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Sent
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1.5 text-[10px] font-black text-amber-600 bg-amber-50/50 border border-amber-100 px-2.5 py-1 rounded-full uppercase tracking-wider">
                                    <Clock className="h-3 w-3" />
                                    Draft
                                  </span>
                                )}
                              </div>
                            </div>

                            <p className="text-sm text-zinc-500 leading-relaxed Myanmar-font wrap-break-words">
                              {ann.content}
                            </p>

                            {ann.sentAt && (
                              <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400">
                                <Clock className="h-3 w-3" />
                                {new Date(ann.sentAt).toLocaleDateString('en-GB', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0 md:bg-zinc-50/50 md:p-2 md:rounded-2xl transition-all group-hover:bg-violet-50/50">
                            <Button
                              variant="default"
                              size="sm"
                              className="rounded-xl font-bold shadow-xl shadow-violet-100 bg-violet-600 hover:bg-violet-700 h-10 px-5 transition-all active:scale-95"
                              onClick={() => confirmBroadcast(ann.id)}
                              disabled={broadcastingId === ann.id}
                              id={`broadcast-ann-${ann.id}`}
                            >
                              {broadcastingId === ann.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MessageCircle className="h-4 w-4 mr-2" />
                              )}
                              {broadcastingId === ann.id ? 'Sending...' : 'Broadcast'}
                            </Button>

                            {ann.isSent && ann.isPinned && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-xl font-bold border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 h-10 px-5 transition-all active:scale-95"
                                onClick={() => handleUnpin(ann.id)}
                                disabled={unpinningId === ann.id}
                                id={`unpin-ann-${ann.id}`}
                              >
                                {unpinningId === ann.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                  <Pin className="h-4 w-4 mr-2" />
                                )}
                                {unpinningId === ann.id ? 'Unpinning...' : 'Unpin'}
                              </Button>
                            )}

                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-10 w-10 rounded-xl text-zinc-300 hover:text-rose-500 hover:bg-rose-50 transition-all active:scale-95"
                              onClick={() => confirmDeleteAnnouncement(ann.id)}
                              id={`delete-ann-${ann.id}`}
                            >
                              <Trash className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>)}
        </TabsContent>
        )}

        {bot.botCategory === 'website_bot' && (
          <TabsContent value="platform" className="mt-8 space-y-6">
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
        )}

        {bot.botCategory === 'messenger_sale' && (
          <TabsContent value="platform" className="mt-6 space-y-6">
          {/* Connect / Status Card */}
          <Card className="border-none shadow-xl bg-white overflow-hidden">
            <CardHeader className="border-b border-zinc-50 pb-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg">
                  <Facebook className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle className="text-xl font-bold">Facebook Messenger</CardTitle>
                  <CardDescription>
                    Connect your Facebook Page to enable the Messenger bot
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-5">


              {bot.messengerPageId ? (
                /* ── Connected State ── */
                <div className="space-y-4">
                  <div className="flex items-center gap-4 bg-emerald-50 rounded-2xl p-5 border border-emerald-100">
                    <div className="h-12 w-12 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                      <Check className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-emerald-800">Connected!</p>
                      <p className="text-sm text-emerald-600">Page ID: {bot.messengerPageId}</p>
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
                          toast.success(enabled ? 'Messenger enabled' : 'Messenger disabled');
                        }}
                        className={`relative w-12 h-6 rounded-full transition-colors ${bot.messengerEnabled ? 'bg-emerald-500' : 'bg-zinc-300'}`}
                      >
                        <div
                          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${bot.messengerEnabled ? 'translate-x-6' : ''}`}
                        />
                      </button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full text-red-500 border-red-200 hover:bg-red-50"
                        onClick={() => setIsDisconnectFacebookOpen(true)}
                      >
                        Disconnect
                      </Button>
                    </div>
                  </div>

                  {/* ── Welcome Message ── */}
                  <div className="border border-zinc-100 rounded-2xl p-5 space-y-3">
                    <div>
                      <p className="font-bold text-zinc-800 flex items-center gap-2">
                        <span className="text-xl">👋</span> Welcome Message
                      </p>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Sent when a new user clicks &quot;Get Started&quot; or no keyword matches
                        (Rule-Based mode).
                      </p>
                    </div>
                    <Textarea
                      id="messengerWelcomeMessage"
                      defaultValue={
                        bot.messengerWelcomeMessage ??
                        '🙏 မင်္ဂလာပါ! ကျွန်တော်တို့ ဆိုင်မှ ကြိုဆိုပါတယ်။\n\nMenu မှ ရွေးချယ်၍ ကြည့်ရှုနိုင်ပါတယ် 😊'
                      }
                      rows={4}
                      className="rounded-xl border-zinc-100 bg-zinc-50/50 text-sm resize-none"
                      placeholder={
                        '🙏 မင်္ဂလာပါ! ကျွန်တော်တို့ ဆိုင်မှ ကြိုဆိုပါတယ်။\n\nMenu မှ ရွေးချယ်၍ ကြည့်ရှုနိုင်ပါတယ် 😊'
                      }
                    />
                    <Button
                      size="sm"
                      variant="default"
                      className="rounded-full px-6 font-bold bg-blue-600 hover:bg-blue-700 h-10 shadow-lg shadow-blue-200"
                      onClick={async () => {
                        const msg = (
                          document.getElementById('messengerWelcomeMessage') as HTMLTextAreaElement
                        )?.value;
                        await fetch(`/api/bots/${bot.id}/messenger`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ messengerWelcomeMessage: msg }),
                        });
                        setBot({ ...bot, messengerWelcomeMessage: msg });
                        toast.success('Welcome message saved!');
                      }}
                    >
                      Save Welcome Message
                    </Button>
                  </div>

                  {/* ── Contact Message ── */}
                  <div className="border border-zinc-100 rounded-2xl p-5 space-y-3">
                    <div>
                      <p className="font-bold text-zinc-800 flex items-center gap-2">
                        <span className="text-xl">📞</span> Contact Us Message
                      </p>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Sent when a user asks to contact the business or clicks &quot;Contact
                        Us&quot; from the menu.
                      </p>
                    </div>
                    <Textarea
                      id="messengerContactMessage"
                      defaultValue={
                        bot.messengerContactMessage ??
                        '📞 အသေးစိတ်သိရှိလိုပါက Page Chat မှတဆင့်ဖြစ်စေ၊ 09876543210 ကို ဖုန်းဆက်၍ဖြစ်စေ ဆက်သွယ်မေးမြန်းနိုင်ပါတယ်။ 😊'
                      }
                      rows={3}
                      className="rounded-xl border-zinc-100 bg-zinc-50/50 text-sm resize-none"
                      placeholder={
                        '📞 အသေးစိတ်သိရှိလိုပါက Page Chat မှတဆင့်ဖြစ်စေ၊ 09876543210 ကို ဖုန်းဆက်၍ဖြစ်စေ ဆက်သွယ်မေးမြန်းနိုင်ပါတယ်။ 😊'
                      }
                    />
                    <Button
                      size="sm"
                      variant="default"
                      className="rounded-full px-6 font-bold bg-blue-600 hover:bg-blue-700 h-10 shadow-lg shadow-blue-200"
                      onClick={async () => {
                        const msg = (
                          document.getElementById('messengerContactMessage') as HTMLTextAreaElement
                        )?.value;
                        await fetch(`/api/bots/${bot.id}/messenger`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ messengerContactMessage: msg }),
                        });
                        setBot({ ...bot, messengerContactMessage: msg });
                        toast.success('Contact message saved!');
                      }}
                    >
                      Save Contact Message
                    </Button>
                  </div>

                  {/* ── Payment Instructions Message ── */}
                  <div className="border border-zinc-100 rounded-2xl p-5 space-y-3">
                    <div>
                      <p className="font-bold text-zinc-800 flex items-center gap-2">
                        <span className="text-xl">💳</span> Payment Instructions Message
                      </p>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Sent to request a screenshot of payment or transaction text when checking
                        out with KPay / Bank Transfer.
                      </p>
                    </div>
                    <Textarea
                      id="messengerPaymentMessage"
                      defaultValue={
                        bot.messengerPaymentMessage ??
                        '🏦 ငွေလွှဲရန် အချက်အလက်များ:\n1. KBZ Pay (KPay)\nAccount Name: Your Shop Name\nPhone Number: 09-123456789\n\n2. Wave Pay\nAccount Name: Your Shop Name\nPhone Number: 09-123456789\n\n3. KBZ Bank\nAccount Name: Your Shop Name\nAccount Number: 999 999 999 999 999\n\n4. CB Bank\nAccount Name: Your Shop Name\nAccount Number: 000 000 000 000 000\n\nမှတ်ချက်။ ငွေလွှဲပြီးပါက ငွေလွှဲပြေစာ (Screenshot) သို့မဟုတ် ငွေလွှဲ Transaction နံပါတ်ကို ပေးပို့ပေးပါခင်ဗျာ။'
                      }
                      rows={12}
                      className="rounded-xl border-zinc-100 bg-zinc-50/50 text-sm resize-none"
                      placeholder={
                        '🏦 KBZ Bank: 0123456789 (U Mya)\nKPay: 09876543210\n\nငွေလွှဲထားသော Screenshot သို့မဟုတ် Transaction အချက်အလက်များကို ပေးပို့ပေးပါခင်ဗျာ။'
                      }
                    />
                    <Button
                      size="sm"
                      variant="default"
                      className="rounded-full px-6 font-bold bg-blue-600 hover:bg-blue-700 h-10 shadow-lg shadow-blue-200"
                      onClick={async () => {
                        const msg = (
                          document.getElementById('messengerPaymentMessage') as HTMLTextAreaElement
                        )?.value;
                        await fetch(`/api/bots/${bot.id}/messenger`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ messengerPaymentMessage: msg }),
                        });
                        setBot({ ...bot, messengerPaymentMessage: msg });
                        toast.success('Payment instructions saved!');
                      }}
                    >
                      Save Payment Instructions
                    </Button>
                  </div>

                  {/* ── Persistent Menu Customization ── */}
                  <div className="border border-zinc-100 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-zinc-800 flex items-center gap-2">
                          <span className="text-xl">☰</span> Persistent Menu
                        </p>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          {bot.botType === 'service'
                            ? 'Service bots use a fixed menu for optimal experience.'
                            : bot.botType === 'appointment'
                              ? 'Booking bots use a fixed menu for optimal experience.'
                              : 'E-commerce bots use a fixed menu for optimal experience.'}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="bg-zinc-50 border border-zinc-100 rounded-2xl overflow-hidden divide-y divide-zinc-100 shadow-sm">
                        <div className="bg-white/50 px-5 py-3 border-b border-zinc-100 mb-0">
                          <p className="text-[10px] uppercase font-black text-zinc-400 tracking-widest">
                            {bot.botType === 'service'
                              ? 'Fixed Service Menu'
                              : bot.botType === 'appointment'
                                ? 'Fixed Appointment Menu'
                                : 'Fixed E-Commerce Menu'}
                          </p>
                        </div>
                        {(bot.botType === 'appointment'
                          ? [
                              { emoji: '🏠', label: 'အစသို့', payload: 'MENU_HOME' },
                              {
                                emoji: '📅',
                                label: 'ရက်ချိန်းယူမည်',
                                payload: 'MENU_VIEW_SERVICES',
                              },
                              {
                                emoji: '🧾',
                                label: 'ရက်ချိန်းစစ်ရန်',
                                payload: 'MENU_CHECK_ORDERS',
                              },
                              { emoji: '📞', label: 'ဆက်သွယ်ရန်', payload: 'MENU_CONTACT_US' },
                            ]
                          : bot.botType === 'service'
                            ? [
                                { emoji: '🏠', label: 'အစသို့', payload: 'MENU_HOME' },
                                {
                                  emoji: '🛠️',
                                  label: 'ဝန်ဆောင်မှုများ',
                                  payload: 'MENU_VIEW_SERVICES',
                                },
                                {
                                  emoji: '🧾',
                                  label: 'မှာထားတာတွေစစ်ရန်',
                                  payload: 'MENU_CHECK_ORDERS',
                                },
                                { emoji: '📞', label: 'ဆက်သွယ်ရန်', payload: 'MENU_CONTACT_US' },
                              ]
                            : [
                                { emoji: '🏠', label: 'အစသို့', payload: 'MENU_HOME' },
                                {
                                  emoji: '📦',
                                  label: 'ပစ္စည်းများကြည့်ရန်',
                                  payload: 'MENU_VIEW_PRODUCTS',
                                },
                                { emoji: '🛒', label: 'Cart ကြည့်ရန်', payload: 'VIEW_CART' },
                                {
                                  emoji: '🧾',
                                  label: 'မှာထားတာတွေစစ်ရန်',
                                  payload: 'MENU_CHECK_ORDERS',
                                },
                                { emoji: '📞', label: 'ဆက်သွယ်ရန်', payload: 'MENU_CONTACT_US' },
                              ]
                        ).map((item, idx) => (
                          <div
                            key={'fixed' + idx}
                            className="flex items-center gap-3 px-5 py-3 text-sm text-zinc-700 bg-white"
                          >
                            <span className="text-lg">{item.emoji}</span>
                            <span className="font-bold text-zinc-900">{item.label}</span>
                            <code className="ml-auto text-[10px] text-zinc-400 bg-zinc-100/80 px-2 py-0.5 rounded-full font-mono">
                              {item.payload}
                            </code>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-zinc-100 mt-2">
                      {bot.botType !== 'ecommerce' && !!bot.botType ? (
                        <Button
                          size="sm"
                          variant="default"
                          className="rounded-full px-6 font-bold bg-blue-600 hover:bg-blue-700 h-10 shadow-lg shadow-blue-200"
                          disabled={menuAction !== null}
                          onClick={async () => {
                            setMenuAction('setup');
                            try {
                              // First, save custom menu to DB to avoid "cached" feel
                              const saveRes = await fetch(`/api/bots/${bot.id}/messenger`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ messengerMenu: bot.messengerMenu }),
                              });
                              if (!saveRes.ok) throw new Error('Failed to save menu to Database');

                              // Then, push to Facebook
                              const pushRes = await fetch(`/api/bots/${bot.id}/messenger/menu`, {
                                method: 'POST',
                              });
                              if (pushRes.ok) {
                                toast.success('Menu saved and pushed to Messenger!');
                              } else {
                                const data = await pushRes.json();
                                toast.error(data.error || 'Failed to push to Facebook');
                              }
                            } catch (err) {
                              toast.error('Network error. Please try again.');
                            } finally {
                              setMenuAction(null);
                            }
                          }}
                        >
                          {menuAction === 'setup' ? (
                            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                          ) : (
                            <Facebook className="mr-1.5 h-4 w-4" />
                          )}
                          {menuAction === 'setup' ? 'Pushing...' : 'Push to Messenger'}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="default"
                          className="rounded-full px-6 font-bold bg-blue-600 hover:bg-blue-700 h-10 shadow-lg shadow-blue-200"
                          id="setup-messenger-menu-btn"
                          disabled={menuAction !== null}
                          onClick={async () => {
                            setMenuAction('setup');
                            try {
                              const res = await fetch(`/api/bots/${bot.id}/messenger/menu`, {
                                method: 'POST',
                              });
                              if (res.ok) {
                                toast.success('Pushed default menu to Facebook successfully!');
                              } else {
                                const data = await res.json();
                                toast.error(data.error || 'Failed to push menu');
                              }
                            } catch (err) {
                              toast.error('Network error. Please try again.');
                            } finally {
                              setMenuAction(null);
                            }
                          }}
                        >
                          {menuAction === 'setup' ? (
                            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                          ) : (
                            <Facebook className="mr-1.5 h-4 w-4" />
                          )}
                          {menuAction === 'setup' ? 'Pushing...' : 'Push to Messenger'}
                        </Button>
                      )}

                      <div className="flex-1" />

                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full px-5 font-bold h-10 border-rose-100 text-rose-600 hover:bg-rose-50 hover:border-rose-200"
                        id="remove-messenger-menu-btn"
                        disabled={menuAction !== null}
                        onClick={() => setRemoveMenuModalOpen(true)}
                      >
                        {menuAction === 'remove' ? (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        ) : null}
                        {menuAction === 'remove' ? 'Removing...' : 'Remove Menu'}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                /* ── Disconnected State ── */
                <div className="text-center py-8 space-y-6">
                  <div className="h-20 w-20 rounded-3xl bg-blue-100 text-blue-600 flex items-center justify-center mx-auto">
                    <Facebook className="h-10 w-10" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-900">Connect Your Facebook Page</h3>
                    <p className="text-zinc-500 text-sm mt-1 max-w-md mx-auto">
                      Click the button below to log in with Facebook and select your business page.
                      Everything will be set up automatically.
                    </p>
                  </div>
                  <Button
                    className="rounded-full bg-blue-600 px-10 h-12 text-base font-bold shadow-xl shadow-blue-200 hover:bg-blue-700"
                    onClick={() => {
                      const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
                      if (!appId) {
                        toast.error(
                          'Facebook App ID is not configured. Add NEXT_PUBLIC_FACEBOOK_APP_ID to environment variables and redeploy.'
                        );
                        return;
                      }
                      const redirectUri = `${window.location.origin}/api/auth/facebook/callback`;
                      const state = bot.id;
                      const scope =
                        'pages_messaging,pages_read_engagement,pages_manage_metadata,pages_show_list';
                      const fbAuthUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${state}&response_type=code`;
                      window.open(fbAuthUrl, '_blank');
                    }}
                  >
                    <Facebook className="mr-2 h-5 w-5" />
                    Connect Facebook Page
                  </Button>
                  <p className="text-xs text-zinc-400">
                    You&apos;ll be redirected to Facebook to authorize access to your page
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

        </TabsContent>
        )}

        {isSaleBot(bot.botCategory) && (
          <TabsContent value="store" className="mt-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {bot.botType === 'appointment' ? (
                /* ── Appointment Bot Links ── */
                <>
                  <Link href={`/dashboard/bots/${bot.id}/appointments`}>
                    <Card className="border-none shadow-lg bg-white hover:shadow-xl transition-all cursor-pointer group h-full">
                      <CardContent className="p-6 text-center">
                        <div className="h-12 w-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                          <span className="text-2xl">📅</span>
                        </div>
                        <h3 className="font-bold text-zinc-900">Appointments</h3>
                        <p className="text-xs text-zinc-400 mt-1">Manage patient bookings</p>
                      </CardContent>
                    </Card>
                  </Link>

                  <Link href={`/dashboard/bots/${bot.id}/services`}>
                    <Card className="border-none shadow-lg bg-white hover:shadow-xl transition-all cursor-pointer group h-full">
                      <CardContent className="p-6 text-center">
                        <div className="h-12 w-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                          <span className="text-2xl">🏥</span>
                        </div>
                        <h3 className="font-bold text-zinc-900">Staff / Services</h3>
                        <p className="text-xs text-zinc-400 mt-1">Doctors & departments</p>
                      </CardContent>
                    </Card>
                  </Link>
                </>
              ) : bot.botType === 'service' ? (
                /* ── Service Bot Links ── */
                <>
                  <Link href={`/dashboard/bots/${bot.id}/services`}>
                    <Card className="border-none shadow-lg bg-white hover:shadow-xl transition-all cursor-pointer group h-full">
                      <CardContent className="p-6 text-center">
                        <div className="h-12 w-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                          <span className="text-2xl">🛠️</span>
                        </div>
                        <h3 className="font-bold text-zinc-900">Services</h3>
                        <p className="text-xs text-zinc-400 mt-1">Manage service offerings</p>
                      </CardContent>
                    </Card>
                  </Link>

                  <Link href={`/dashboard/bots/${bot.id}/orders`}>
                    <Card className="border-none shadow-lg bg-white hover:shadow-xl transition-all cursor-pointer group h-full">
                      <CardContent className="p-6 text-center">
                        <div className="h-12 w-12 rounded-2xl bg-violet-100 text-violet-600 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                          <span className="text-2xl">🧾</span>
                        </div>
                        <h3 className="font-bold text-zinc-900">Orders</h3>
                        <p className="text-xs text-zinc-400 mt-1">View & manage orders</p>
                      </CardContent>
                    </Card>
                  </Link>
                </>
              ) : (
                /* ── E-Commerce Bot Links ── */
                <>
                  <Link href={`/dashboard/bots/${bot.id}/products`}>
                    <Card className="border-none shadow-lg bg-white hover:shadow-xl transition-all cursor-pointer group h-full">
                      <CardContent className="p-6 text-center">
                        <div className="h-12 w-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                          <span className="text-2xl">📦</span>
                        </div>
                        <h3 className="font-bold text-zinc-900">Products</h3>
                        <p className="text-xs text-zinc-400 mt-1">Manage product catalog & stock</p>
                      </CardContent>
                    </Card>
                  </Link>

                  <Link href={`/dashboard/bots/${bot.id}/delivery-zones`}>
                    <Card className="border-none shadow-lg bg-white hover:shadow-xl transition-all cursor-pointer group h-full">
                      <CardContent className="p-6 text-center">
                        <div className="h-12 w-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                          <span className="text-2xl">🚗</span>
                        </div>
                        <h3 className="font-bold text-zinc-900">Delivery Zones</h3>
                        <p className="text-xs text-zinc-400 mt-1">Township fees & areas</p>
                      </CardContent>
                    </Card>
                  </Link>

                  <Link href={`/dashboard/bots/${bot.id}/orders`}>
                    <Card className="border-none shadow-lg bg-white hover:shadow-xl transition-all cursor-pointer group h-full">
                      <CardContent className="p-6 text-center">
                        <div className="h-12 w-12 rounded-2xl bg-violet-100 text-violet-600 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                          <span className="text-2xl">🛒</span>
                        </div>
                        <h3 className="font-bold text-zinc-900">Orders</h3>
                        <p className="text-xs text-zinc-400 mt-1">View & manage orders</p>
                      </CardContent>
                    </Card>
                  </Link>
                </>
              )}
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* Edit Knowledge Dialog */}
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

      {/* Edit Onboarding Topic Dialog */}
      <Dialog open={!!editingTopic} onOpenChange={open => !open && setEditingTopic(null)}>
        <DialogContent className="max-w-lg p-0 overflow-hidden border-none shadow-2xl rounded-3xl max-h-[85vh] flex flex-col">
          <div className="bg-linear-to-br from-violet-600 to-purple-700 px-6 py-8 text-white relative shrink-0">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold tracking-tight">Edit Topic</DialogTitle>
              <DialogDescription className="text-violet-200 font-medium">
                Customize the menu button and AI prompt.
              </DialogDescription>
            </DialogHeader>
            <div className="absolute top-6 right-6 h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center backdrop-blur-sm border border-white/10">
              <Pencil className="h-6 w-6 text-white" />
            </div>
          </div>

          <div className="p-6 space-y-4 bg-white overflow-y-auto flex-1">
            <div className="flex items-center gap-3">
              <div className="space-y-1 w-20">
                <Label className="text-xs font-bold text-zinc-500">Icon</Label>
                <Input
                  value={editingTopic?.icon || ''}
                  onChange={e =>
                    setEditingTopic(prev => (prev ? { ...prev, icon: e.target.value } : null))
                  }
                  className="text-center text-lg h-12 rounded-xl"
                  maxLength={2}
                />
              </div>
              <div className="space-y-1 flex-1">
                <Label className="text-xs font-bold text-zinc-500">Button Name</Label>
                <Input
                  value={editingTopic?.label || ''}
                  onChange={e =>
                    setEditingTopic(prev => (prev ? { ...prev, label: e.target.value } : null))
                  }
                  placeholder="e.g. Company Info"
                  className="h-12 rounded-xl"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 bg-zinc-50 rounded-xl border border-zinc-100">
              <Label className="text-sm font-bold text-zinc-700 flex-1">
                Use AI to generate response?
              </Label>
              <button
                type="button"
                onClick={() =>
                  setEditingTopic(prev => (prev ? { ...prev, useAI: !prev.useAI } : null))
                }
                className="flex items-center"
              >
                {editingTopic?.useAI ? (
                  <ToggleRight className="h-8 w-8 text-violet-500" />
                ) : (
                  <ToggleLeft className="h-8 w-8 text-zinc-300" />
                )}
              </button>
            </div>

            {editingTopic?.useAI ? (
              <div className="space-y-1">
                <Label className="text-xs font-bold text-zinc-500">AI Prompt</Label>
                <Textarea
                  value={editingTopic?.prompt || ''}
                  onChange={e =>
                    setEditingTopic(prev => (prev ? { ...prev, prompt: e.target.value } : null))
                  }
                  placeholder="What should AI answer about this topic?"
                  className="min-h-24 rounded-xl"
                />
              </div>
            ) : (
              <div className="space-y-1">
                <Label className="text-xs font-bold text-zinc-500">Exact Message Content</Label>
                <Textarea
                  value={editingTopic?.content || ''}
                  onChange={e =>
                    setEditingTopic(prev => (prev ? { ...prev, content: e.target.value } : null))
                  }
                  placeholder="e.g. Here is the orientation video: https://youtu.be/..."
                  className="min-h-24 rounded-xl"
                />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs font-bold text-zinc-500">Completion Button Text</Label>
              <Input
                value={editingTopic?.buttonText || ''}
                onChange={e =>
                  setEditingTopic(prev => (prev ? { ...prev, buttonText: e.target.value } : null))
                }
                placeholder="Default: ✅ ပြီးပါပြီ, နောက်တစ်ဆင့်သွားမည်"
                className="h-12 rounded-xl"
              />
            </div>

            {/* Photo URLs */}
            <div className="space-y-2">
              <Label className="text-xs font-bold text-zinc-500">📸 Photos (Image URLs)</Label>
              {(editingTopic?.images || []).map((url, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={url}
                    onChange={e => {
                      setEditingTopic(prev => {
                        if (!prev) return null;
                        const imgs = [...prev.images];
                        imgs[i] = e.target.value;
                        return { ...prev, images: imgs };
                      });
                    }}
                    placeholder="https://example.com/photo.jpg"
                    className="rounded-xl flex-1"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-10 w-10 rounded-xl text-rose-400 hover:bg-rose-50"
                    onClick={() => {
                      setEditingTopic(prev => {
                        if (!prev) return null;
                        return { ...prev, images: prev.images.filter((_, j) => j !== i) };
                      });
                    }}
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl border-dashed text-xs"
                onClick={() =>
                  setEditingTopic(prev => (prev ? { ...prev, images: [...prev.images, ''] } : null))
                }
              >
                <Plus className="h-3 w-3 mr-1" /> Add Photo URL
              </Button>
            </div>

            {/* Upload Verification */}
            <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-xl border border-amber-100">
              <Label className="text-sm font-bold text-amber-800 flex-1">
                📸 Require Photo Upload for Verification?
              </Label>
              <button
                type="button"
                onClick={() =>
                  setEditingTopic(prev =>
                    prev ? { ...prev, requireUpload: !prev.requireUpload } : null
                  )
                }
                className="flex items-center"
              >
                {editingTopic?.requireUpload ? (
                  <ToggleRight className="h-8 w-8 text-amber-500" />
                ) : (
                  <ToggleLeft className="h-8 w-8 text-zinc-300" />
                )}
              </button>
            </div>
            {editingTopic?.requireUpload && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-zinc-500">AI Verification Prompt</Label>
                  <Textarea
                    value={editingTopic?.verificationPrompt || ''}
                    onChange={e =>
                      setEditingTopic(prev =>
                        prev ? { ...prev, verificationPrompt: e.target.value } : null
                      )
                    }
                    placeholder="e.g. Check if the screenshot shows 2FA has been enabled"
                    className="min-h-20 rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-zinc-500">
                    User ကို ပြမယ့် Instruction
                  </Label>
                  <Input
                    value={editingTopic?.uploadInstruction || ''}
                    onChange={e =>
                      setEditingTopic(prev =>
                        prev ? { ...prev, uploadInstruction: e.target.value } : null
                      )
                    }
                    placeholder="e.g. 📸 2FA enable ပြီးကြောင်း screenshot ရိုက်ပို့ပေးပါ။"
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-zinc-500">
                    Required Upload Count (ဘယ်နှစ်ခု ပို့ရမလဲ?)
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    value={editingTopic?.requiredUploads || 1}
                    onChange={e =>
                      setEditingTopic(prev =>
                        prev ? { ...prev, requiredUploads: parseInt(e.target.value) || 1 } : null
                      )
                    }
                    className="rounded-xl w-32"
                  />
                </div>
              </>
            )}
          </div>

          <div className="p-6 border-t border-zinc-100 bg-zinc-50/50 flex items-center justify-end gap-3 shrink-0">
            <DialogClose asChild>
              <Button type="button" variant="ghost" className="rounded-xl h-12 px-6 font-bold">
                Cancel
              </Button>
            </DialogClose>
            <Button
              disabled={
                isSaving ||
                !editingTopic?.label.trim() ||
                (editingTopic?.useAI ? !editingTopic?.prompt.trim() : !editingTopic?.content.trim())
              }
              className="rounded-xl h-12 px-8 font-bold bg-violet-600 hover:bg-violet-700 shadow-xl shadow-violet-100"
              onClick={async () => {
                if (!editingTopic) return;
                setIsSaving(true);
                const updated = [...onboardingTopics];
                updated[editingTopic.index] = {
                  ...updated[editingTopic.index],
                  icon: editingTopic.icon,
                  label: editingTopic.label,
                  prompt: editingTopic.prompt,
                  content: editingTopic.content,
                  buttonText: editingTopic.buttonText,
                  useAI: editingTopic.useAI,
                  images: editingTopic.images,
                  requireUpload: editingTopic.requireUpload,
                  verificationPrompt: editingTopic.verificationPrompt,
                  uploadInstruction: editingTopic.uploadInstruction,
                  requiredUploads: editingTopic.requiredUploads,
                };
                setOnboardingTopics(updated);
                try {
                  await updateBot(botId, { onboardingTopics: updated });
                  toast.success('Topic updated');
                  setEditingTopic(null);
                } catch {
                  toast.error('Failed to update');
                } finally {
                  setIsSaving(false);
                }
              }}
            >
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Broadcast Confirm Modal */}
      <Dialog open={broadcastModalOpen} onOpenChange={setBroadcastModalOpen}>
        <DialogContent className="max-w-md rounded-[32px] p-0 overflow-hidden border-0 shadow-2xl">
          <div className="p-8 pb-6 bg-white shrink-0">
            <div className="h-14 w-14 rounded-2xl bg-indigo-100 flex items-center justify-center mb-6 shadow-inner mx-auto">
              <MessageCircle className="h-7 w-7 text-indigo-600" />
            </div>
            <DialogTitle className="text-xl font-bold text-center text-zinc-900 mb-2">
              Broadcast Announcement
            </DialogTitle>
            <DialogDescription className="text-zinc-500 font-medium text-center text-sm">
              Are you sure you want to send this announcement to{' '}
              <span className="font-bold text-indigo-600">
                {members.filter(m => m.memberType === 'old').length} old member(s)
              </span>{' '}
              via Telegram?
            </DialogDescription>

            <div className="mt-8 pt-6 border-t border-zinc-50 space-y-4">
              <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-50 border border-zinc-100 transition-all">
                <div className="flex items-center gap-3">
                  <div
                    className={`h-10 w-10 rounded-xl flex items-center justify-center transition-all ${shouldPin ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-zinc-200 text-zinc-500'}`}
                  >
                    <Pin className={`h-5 w-5 ${shouldPin ? 'animate-bounce' : ''}`} />
                  </div>
                  <div>
                    <label
                      htmlFor="pin-toggle"
                      className="text-sm font-bold text-zinc-900 cursor-pointer"
                    >
                      Pin Message
                    </label>
                    <p className="text-[11px] text-zinc-500 font-medium">Keep at the top of chat</p>
                  </div>
                </div>

                <button
                  type="button"
                  id="pin-toggle"
                  onClick={() => setShouldPin(!shouldPin)}
                  className={`relative w-12 h-6 rounded-full transition-all duration-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${shouldPin ? 'bg-indigo-600' : 'bg-zinc-300'}`}
                >
                  <div
                    className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white shadow-md transition-transform duration-300 ${shouldPin ? 'translate-x-6' : ''}`}
                  />
                </button>
              </div>
            </div>
          </div>
          <div className="p-6 border-t border-zinc-100 bg-zinc-50/50 flex items-center justify-center gap-4 shrink-0 px-8">
            <Button
              variant="ghost"
              className="rounded-2xl h-14 px-8 font-bold flex-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-all"
              onClick={() => setBroadcastModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-2xl h-14 px-8 font-bold bg-indigo-600 hover:bg-indigo-700 shadow-2xl shadow-indigo-200 flex-1 transition-all active:scale-95"
              onClick={executeBroadcast}
              disabled={!!broadcastingId}
            >
              {broadcastingId ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <MessageCircle className="mr-2 h-5 w-5" />
              )}
              {broadcastingId ? 'Broadcasting...' : 'Broadcast'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Member Confirm Modal */}
      <Dialog open={deleteMemberModalOpen} onOpenChange={setDeleteMemberModalOpen}>
        <DialogContent className="max-w-md rounded-[32px] p-0 overflow-hidden border-0 shadow-2xl">
          <div className="p-8 pb-6 bg-white shrink-0">
            <div className="h-14 w-14 rounded-2xl bg-red-100 flex items-center justify-center mb-6 shadow-inner mx-auto">
              <Trash className="h-7 w-7 text-red-600" />
            </div>
            <DialogTitle className="text-xl font-bold text-center text-zinc-900 mb-2">
              Remove Member
            </DialogTitle>
            <DialogDescription className="text-zinc-500 font-medium text-center text-sm">
              Are you sure you want to remove this member? This action cannot be undone.
            </DialogDescription>
          </div>
          <div className="p-6 border-t border-zinc-100 bg-zinc-50/50 flex items-center justify-center gap-3 shrink-0">
            <Button
              variant="ghost"
              className="rounded-xl h-12 px-6 font-bold flex-1 max-w-35"
              onClick={() => setDeleteMemberModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl h-12 px-6 font-bold shadow-xl shadow-red-100 flex-1 max-w-35"
              onClick={executeDeleteMember}
            >
              <Trash className="mr-2 h-4 w-4" />
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Announcement Confirm Modal */}
      <Dialog open={deleteAnnModalOpen} onOpenChange={setDeleteAnnModalOpen}>
        <DialogContent className="max-w-md rounded-[32px] p-0 overflow-hidden border-0 shadow-2xl">
          <div className="p-8 pb-6 bg-white shrink-0">
            <div className="h-14 w-14 rounded-2xl bg-red-100 flex items-center justify-center mb-6 shadow-inner mx-auto">
              <Trash className="h-7 w-7 text-red-600" />
            </div>
            <DialogTitle className="text-xl font-bold text-center text-zinc-900 mb-2">
              Delete Announcement
            </DialogTitle>
            <DialogDescription className="text-zinc-500 font-medium text-center text-sm">
              Are you sure you want to delete this announcement? This action cannot be undone.
            </DialogDescription>
          </div>
          <div className="p-6 border-t border-zinc-100 bg-zinc-50/50 flex items-center justify-center gap-3 shrink-0">
            <Button
              variant="ghost"
              className="rounded-xl h-12 px-6 font-bold flex-1 max-w-35"
              onClick={() => setDeleteAnnModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl h-12 px-6 font-bold shadow-xl shadow-red-100 flex-1 max-w-35"
              onClick={executeDeleteAnnouncement}
            >
              <Trash className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Unpin Announcement Confirm Modal */}
      <Dialog open={unpinModalOpen} onOpenChange={setUnpinModalOpen}>
        <DialogContent className="max-w-md rounded-[32px] p-0 overflow-hidden border-0 shadow-2xl">
          <div className="p-8 pb-6 bg-white shrink-0">
            <div className="h-14 w-14 rounded-2xl bg-amber-100 flex items-center justify-center mb-6 shadow-inner mx-auto">
              <Pin className="h-7 w-7 text-amber-600" />
            </div>
            <DialogTitle className="text-xl font-bold text-center text-zinc-900 mb-2">
              Unpin Announcement
            </DialogTitle>
            <DialogDescription className="text-zinc-500 font-medium text-center text-sm leading-relaxed px-4">
              Are you sure you want to unpin the most recent message for all members on Telegram?
            </DialogDescription>
          </div>
          <div className="p-6 border-t border-zinc-100 bg-zinc-50/50 flex items-center justify-center gap-3 shrink-0">
            <Button
              variant="ghost"
              className="rounded-xl h-12 px-6 font-bold flex-1 max-w-35"
              onClick={() => setUnpinModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              className="rounded-xl h-12 px-6 font-bold shadow-xl shadow-amber-100 bg-amber-600 hover:bg-amber-700 text-white flex-1 max-w-35 transition-all active:scale-95"
              onClick={executeUnpin}
            >
              <Pin className="mr-2 h-4 w-4" />
              Unpin
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Remove Messenger Menu Confirm Modal */}
      <Dialog open={removeMenuModalOpen} onOpenChange={setRemoveMenuModalOpen}>
        <DialogContent className="max-w-md rounded-[32px] p-0 overflow-hidden border-0 shadow-2xl">
          <div className="p-8 pb-6 bg-white shrink-0">
            <div className="h-14 w-14 rounded-2xl bg-rose-100 flex items-center justify-center mb-6 shadow-inner mx-auto">
              <Trash className="h-7 w-7 text-rose-600" />
            </div>
            <DialogTitle className="text-xl font-bold text-center text-zinc-900 mb-2">
              Remove Persistent Menu
            </DialogTitle>
            <DialogDescription className="text-zinc-500 font-medium text-center text-sm leading-relaxed px-4">
              Are you sure you want to remove the Messenger persistent menu entirely? This will
              immediately clear it from your Facebook page.
            </DialogDescription>
          </div>
          <div className="p-6 border-t border-zinc-100 bg-zinc-50/50 flex items-center justify-center gap-3 shrink-0">
            <Button
              variant="ghost"
              className="rounded-xl h-12 px-6 font-bold flex-1 max-w-35"
              onClick={() => setRemoveMenuModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl h-12 px-6 font-bold shadow-xl shadow-rose-100 flex-1 max-w-35 transition-all active:scale-95"
              onClick={async () => {
                setRemoveMenuModalOpen(false);
                setMenuAction('remove');
                try {
                  const res = await fetch(`/api/bots/${bot?.id}/messenger/menu`, {
                    method: 'DELETE',
                  });
                  const data = await res.json();
                  if (data.success) {
                    toast.success('Menu removed from Messenger.');
                  } else {
                    toast.error(`Failed: ${data.error || 'Unknown error'}`);
                  }
                } catch (err) {
                  toast.error('Network error. Please try again.');
                } finally {
                  setMenuAction(null);
                }
              }}
            >
              <Trash className="mr-2 h-4 w-4" />
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>



      {/* Delete Bot Confirm Modal */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent className="max-w-md rounded-[32px] p-0 overflow-hidden border-0 shadow-2xl">
          <div className="p-8 pb-6 bg-white shrink-0">
            <div className="h-14 w-14 rounded-2xl bg-rose-100 flex items-center justify-center mb-6 shadow-inner mx-auto">
              <Trash className="h-7 w-7 text-rose-600" />
            </div>
            <DialogTitle className="text-xl font-bold text-center text-zinc-900 mb-2 tracking-tight">
              Delete Agent?
            </DialogTitle>
            <DialogDescription className="text-zinc-500 font-medium text-center text-sm leading-relaxed px-4">
              Are you sure? This will delete all data for this agent. This action cannot be undone.
            </DialogDescription>
          </div>
          <div className="p-6 border-t border-zinc-100 bg-zinc-50/50 flex flex-col-reverse sm:flex-row items-center justify-center gap-3 shrink-0">
            <Button
              variant="outline"
              className="rounded-xl h-12 px-6 font-bold w-full sm:flex-1 border-zinc-200 text-zinc-600 hover:bg-zinc-100"
              onClick={() => setIsDeleteModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl h-12 px-6 font-bold shadow-xl shadow-rose-100 w-full sm:flex-1 transition-all active:scale-95"
              onClick={async () => {
                setIsDeleteModalOpen(false);
                await deleteBot(bot.id);
                router.push('/dashboard/bots');
                toast.success('Agent deleted successfully');
              }}
            >
              <Trash className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Knowledge Modal */}
      <Dialog open={docToDelete !== null} onOpenChange={open => !open && setDocToDelete(null)}>
        <DialogContent className="max-w-md rounded-[32px] p-0 overflow-hidden border-0 shadow-2xl">
          <div className="p-8 pb-6 bg-white shrink-0">
            <div className="h-14 w-14 rounded-2xl bg-rose-100 flex items-center justify-center mb-6 shadow-inner mx-auto">
              <Trash className="h-7 w-7 text-rose-600" />
            </div>
            <DialogTitle className="text-xl font-bold text-center text-zinc-900 mb-2 tracking-tight">
              Delete Knowledge?
            </DialogTitle>
            <DialogDescription className="text-zinc-500 font-medium text-center text-sm leading-relaxed px-4">
              Are you sure you want to delete this knowledge? This action cannot be undone.
            </DialogDescription>
          </div>
          <div className="p-6 border-t border-zinc-100 bg-zinc-50/50 flex flex-col-reverse sm:flex-row items-center justify-center gap-3 shrink-0">
            <Button
              variant="outline"
              className="rounded-xl h-12 px-6 font-bold w-full sm:flex-1 border-zinc-200 text-zinc-600 hover:bg-zinc-100"
              onClick={() => setDocToDelete(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl h-12 px-6 font-bold shadow-xl shadow-rose-100 w-full sm:flex-1 transition-all active:scale-95"
              onClick={confirmDeleteDoc}
            >
              <Trash className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Topic Modal */}
      <Dialog open={topicToDelete !== null} onOpenChange={open => !open && setTopicToDelete(null)}>
        <DialogContent className="max-w-md rounded-[32px] p-0 overflow-hidden border-0 shadow-2xl">
          <div className="p-8 pb-6 bg-white shrink-0">
            <div className="h-14 w-14 rounded-2xl bg-rose-100 flex items-center justify-center mb-6 shadow-inner mx-auto">
              <Trash className="h-7 w-7 text-rose-600" />
            </div>
            <DialogTitle className="text-xl font-bold text-center text-zinc-900 mb-2 tracking-tight">
              Delete Topic?
            </DialogTitle>
            <DialogDescription className="text-zinc-500 font-medium text-center text-sm leading-relaxed px-4">
              Are you sure you want to delete this onboarding topic?
            </DialogDescription>
          </div>
          <div className="p-6 border-t border-zinc-100 bg-zinc-50/50 flex flex-col-reverse sm:flex-row items-center justify-center gap-3 shrink-0">
            <Button
              variant="outline"
              className="rounded-xl h-12 px-6 font-bold w-full sm:flex-1 border-zinc-200 text-zinc-600 hover:bg-zinc-100"
              onClick={() => setTopicToDelete(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl h-12 px-6 font-bold shadow-xl shadow-rose-100 w-full sm:flex-1 transition-all active:scale-95"
              onClick={async () => {
                const index = topicToDelete;
                setTopicToDelete(null);
                if (index === null) return;
                const updated = onboardingTopics.filter((_, i) => i !== index);
                setOnboardingTopics(updated);
                try {
                  await updateBot(botId, { onboardingTopics: updated });
                  toast.success('Topic deleted');
                } catch {
                  toast.error('Failed to delete');
                }
              }}
            >
              <Trash className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Disconnect Telegram Modal */}
      <Dialog open={isDisconnectTelegramOpen} onOpenChange={setIsDisconnectTelegramOpen}>
        <DialogContent className="max-w-md rounded-[32px] p-0 overflow-hidden border-0 shadow-2xl">
          <div className="p-8 pb-6 bg-white shrink-0">
            <div className="h-14 w-14 rounded-2xl bg-amber-100 flex items-center justify-center mb-6 shadow-inner mx-auto">
              <AlertTriangle className="h-7 w-7 text-amber-600" />
            </div>
            <DialogTitle className="text-xl font-bold text-center text-zinc-900 mb-2 tracking-tight">
              Disconnect Bot?
            </DialogTitle>
            <DialogDescription className="text-zinc-500 font-medium text-center text-sm leading-relaxed px-4">
              Are you sure you want to disconnect this telegram bot?
            </DialogDescription>
          </div>
          <div className="p-6 border-t border-zinc-100 bg-zinc-50/50 flex flex-col-reverse sm:flex-row items-center justify-center gap-3 shrink-0">
            <Button
              variant="outline"
              className="rounded-xl h-12 px-6 font-bold w-full sm:flex-1 border-zinc-200 text-zinc-600 hover:bg-zinc-100"
              onClick={() => setIsDisconnectTelegramOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl h-12 px-6 font-bold shadow-xl shadow-rose-100 w-full sm:flex-1 transition-all active:scale-95"
              onClick={async () => {
                setIsDisconnectTelegramOpen(false);
                await updateBot(botId, {
                  telegramBotToken: null,
                });
                const updated = await getBotById(botId);
                setBot(updated);
                toast.success('Telegram disconnected');
              }}
            >
              Disconnect
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Disconnect Facebook Modal */}
      <Dialog open={isDisconnectFacebookOpen} onOpenChange={setIsDisconnectFacebookOpen}>
        <DialogContent className="max-w-md rounded-[32px] p-0 overflow-hidden border-0 shadow-2xl">
          <div className="p-8 pb-6 bg-white shrink-0">
            <div className="h-14 w-14 rounded-2xl bg-amber-100 flex items-center justify-center mb-6 shadow-inner mx-auto">
              <AlertTriangle className="h-7 w-7 text-amber-600" />
            </div>
            <DialogTitle className="text-xl font-bold text-center text-zinc-900 mb-2 tracking-tight">
              Disconnect Facebook?
            </DialogTitle>
            <DialogDescription className="text-zinc-500 font-medium text-center text-sm leading-relaxed px-4">
              Are you sure you want to disconnect this Facebook Page?
            </DialogDescription>
          </div>
          <div className="p-6 border-t border-zinc-100 bg-zinc-50/50 flex flex-col-reverse sm:flex-row items-center justify-center gap-3 shrink-0">
            <Button
              variant="outline"
              className="rounded-xl h-12 px-6 font-bold w-full sm:flex-1 border-zinc-200 text-zinc-600 hover:bg-zinc-100"
              onClick={() => setIsDisconnectFacebookOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl h-12 px-6 font-bold shadow-xl shadow-rose-100 w-full sm:flex-1 transition-all active:scale-95"
              onClick={async () => {
                setIsDisconnectFacebookOpen(false);
                try {
                  await fetch(`/api/bots/${bot.id}/messenger/connect`, {
                    method: 'DELETE',
                  });
                  setBot({
                    ...bot,
                    messengerPageId: null,
                    messengerPageToken: null,
                    messengerEnabled: false,
                  });
                  toast.success('Disconnected');
                } catch (e) {
                  toast.error('Failed to disconnect');
                }
              }}
            >
              Disconnect
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
