'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import Link from 'next/link';
import { createBot } from '@/lib/actions/bot';

const BOT_TYPES = [
  {
    id: 'ecommerce',
    label: 'Online Shop',
    icon: '🛒',
    desc: 'Perfect for selling products, managing stock, and automated ordering.',
  },
  {
    id: 'service',
    label: 'Service & Info',
    icon: '📞',
    desc: 'Ideal for customer support, service listings, and general inquiries.',
  },
  {
    id: 'appointment',
    label: 'Booking',
    icon: '📅',
    desc: 'Streamline appointments, reservations, and time-based services.',
  },
];

export default function NewBotPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [botType, setBotType] = useState('service');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    formData.append('botType', botType);
    // Default system prompt based on type
    const defaultPrompts: Record<string, string> = {
      ecommerce: 'You are a helpful e-commerce assistant. Help customers browse products, answer questions about pricing and availability, and guide them through the ordering process.',
      service: 'You are a helpful customer service assistant. Answer inquiries, provide information about services, and assist customers with their needs.',
      appointment: 'You are a booking assistant. Help customers schedule appointments, check availability, and manage their reservations.',
    };
    if (!formData.get('systemPrompt')) {
      formData.set('systemPrompt', defaultPrompts[botType]);
    }

    try {
      const bot = await createBot(formData);
      toast.success('Agent created successfully!');
      router.push(`/dashboard/bots/${bot.id}`);
    } catch (err) {
      toast.error('Failed to create agent');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild className="rounded-full shrink-0">
          <Link href="/dashboard/bots">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h2 className="text-3xl font-black tracking-tight text-zinc-900">
            Create New AI Agent
          </h2>
          <p className="text-zinc-500 font-medium">Define your agent&apos;s purpose and identity.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Step 1: Select Bot Type */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 ml-1">
            <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-black text-sm shadow-lg shadow-blue-100">
              1
            </div>
            <Label className="text-lg font-black text-zinc-800">Select Bot Type</Label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {BOT_TYPES.map(type => (
              <button
                key={type.id}
                type="button"
                onClick={() => setBotType(type.id)}
                className={`group relative p-6 rounded-3xl border-2 transition-all text-left flex flex-col items-start gap-4 overflow-hidden ${
                  botType === type.id
                    ? 'border-blue-600 bg-blue-50/30 shadow-xl shadow-blue-50 ring-4 ring-blue-600/5'
                    : 'border-zinc-100 bg-white hover:border-zinc-300 hover:shadow-lg'
                }`}
              >
                <div
                  className={`h-14 w-14 rounded-2xl flex items-center justify-center text-3xl transition-all duration-500 ${
                    botType === type.id
                      ? 'bg-blue-600 shadow-lg shadow-blue-200 scale-110 -rotate-6'
                      : 'bg-zinc-50 group-hover:bg-zinc-100'
                  }`}
                >
                  {type.icon}
                </div>

                <div>
                  <h3
                    className={`font-black text-lg ${botType === type.id ? 'text-blue-900' : 'text-zinc-800'}`}
                  >
                    {type.label}
                  </h3>
                  <p className="text-xs text-zinc-500 font-medium leading-relaxed mt-1">
                    {type.desc}
                  </p>
                </div>

                {botType === type.id && (
                  <div className="absolute top-4 right-4 h-6 w-6 bg-blue-600 rounded-full flex items-center justify-center border-2 border-white shadow-md animate-in zoom-in duration-300">
                    <Check className="h-3.5 w-3.5 text-white stroke-3" />
                  </div>
                )}

                <div
                  className={`absolute -bottom-2 -right-2 h-24 w-24 rounded-full blur-3xl opacity-20 transition-all duration-700 ${
                    botType === type.id ? 'bg-blue-400 scale-150' : 'bg-transparent'
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Step 2: Name Your Bot */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 ml-1">
            <div className="h-8 w-8 rounded-full bg-zinc-900 text-white flex items-center justify-center font-black text-sm shadow-lg shadow-zinc-100">
              2
            </div>
            <Label htmlFor="name" className="text-lg font-black text-zinc-800">
              What&apos;s your Agent&apos;s Name?
            </Label>
          </div>

          <div className="rounded-[32px] shadow-xl bg-white overflow-hidden border border-zinc-100">
            <CardContent className="p-8">
              <div className="space-y-2">
                <Input
                  id="name"
                  name="name"
                  placeholder="e.g. Smart Customer Support"
                  required
                  autoFocus
                  className="h-16 text-xl rounded-2xl bg-zinc-50/50 focus:ring-4 focus:ring-blue-50 font-bold px-6 placeholder:text-zinc-300 transition-all focus:bg-white border-2 border-transparent focus:border-blue-100"
                />
                <p className="text-xs text-zinc-400 ml-1 font-black uppercase tracking-widest leading-none mt-2">
                  Primary identity for your bot in the dashboard.
                </p>
              </div>
            </CardContent>
            <CardFooter className="bg-zinc-50/50 p-6 flex flex-col sm:flex-row gap-4 border-t border-zinc-100">
              <Button
                type="submit"
                disabled={isLoading}
                className="h-14 px-10 rounded-2xl bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-100 font-black text-lg transition-all active:scale-95 flex-1 sm:flex-none"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Initializing Agent...
                  </>
                ) : (
                  'Create AI Agent'
                )}
              </Button>
              <Button
                variant="ghost"
                asChild
                disabled={isLoading}
                className="h-14 rounded-2xl font-bold text-zinc-500 hover:text-zinc-900"
              >
                <Link href="/dashboard/bots">Cancel</Link>
              </Button>
            </CardFooter>
          </div>
        </div>
      </form>
    </div>
  );
}
