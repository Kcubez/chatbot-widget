'use client';

import { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { User, Key, Save, Eye, EyeOff, Loader2, Check } from 'lucide-react';

export default function SettingsPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [googleApiKey, setGoogleApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [apiKeySaved, setApiKeySaved] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        setName(data.name || '');
        setEmail(data.email || '');
        setGoogleApiKey(data.googleApiKey || '');
        setLoading(false);
      });
  }, []);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileSaved(false);
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save profile:', err);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveApiKey = async () => {
    setSavingApiKey(true);
    setApiKeySaved(false);
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleApiKey }),
      });
      setApiKeySaved(true);
      setTimeout(() => setApiKeySaved(false), 3000);
    } catch (err) {
      console.error('Failed to save API key:', err);
    } finally {
      setSavingApiKey(false);
    }
  };

  const maskApiKey = (key: string) => {
    if (!key) return '';
    if (key.length <= 8) return '••••••••';
    return key.substring(0, 4) + '••••••••••••••••' + key.substring(key.length - 4);
  };

  if (loading) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500 max-w-3xl">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-zinc-900">Settings</h2>
          <p className="text-zinc-500 font-medium">
            Manage your account and platform configurations
          </p>
        </div>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-3xl">
      <div>
        <h2 className="text-3xl font-black tracking-tight text-zinc-900">Settings</h2>
        <p className="text-zinc-500 font-medium">Manage your account and platform configurations</p>
      </div>

      <div className="grid gap-6">
        {/* ── Profile Details Card ── */}
        <Card className="border-none shadow-xl bg-white overflow-hidden">
          <CardHeader className="border-b border-zinc-50 pb-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-zinc-900 text-white flex items-center justify-center shadow-lg">
                <User className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold">Profile Details</CardTitle>
                <CardDescription>Your personal identity on the platform</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="grid gap-2">
              <Label className="text-xs font-black uppercase tracking-widest text-zinc-400">
                Full Name
              </Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                className="h-11 rounded-xl border-zinc-100 bg-zinc-50/50 focus:bg-white transition-all font-medium"
                placeholder="Your name"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs font-black uppercase tracking-widest text-zinc-400">
                Email Address
              </Label>
              <Input
                value={email}
                disabled
                className="h-11 rounded-xl border-zinc-100 bg-zinc-50 cursor-not-allowed opacity-70 font-medium"
              />
            </div>
          </CardContent>
          <CardFooter className="bg-zinc-50/50 border-t border-zinc-50 p-6 flex justify-end">
            <Button
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="rounded-full bg-zinc-900 px-8 h-10 font-bold shadow-lg shadow-zinc-200 disabled:opacity-70"
            >
              {savingProfile ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : profileSaved ? (
                <Check className="mr-2 h-4 w-4" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {profileSaved ? 'Saved!' : 'Save Changes'}
            </Button>
          </CardFooter>
        </Card>

        {/* ── API Configuration Card ── */}
        <Card className="border-none shadow-xl bg-white overflow-hidden">
          <CardHeader className="border-b border-zinc-50 pb-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-linear-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center shadow-lg">
                <Key className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold">API Configuration</CardTitle>
                <CardDescription>
                  Your Google Gemini API key for AI-powered features
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="grid gap-2">
              <Label className="text-xs font-black uppercase tracking-widest text-zinc-400">
                Google Gemini API Key
              </Label>
              <div className="relative">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={showApiKey ? googleApiKey : googleApiKey ? maskApiKey(googleApiKey) : ''}
                  onChange={e => {
                    setShowApiKey(true);
                    setGoogleApiKey(e.target.value);
                  }}
                  onFocus={() => setShowApiKey(true)}
                  className="h-11 rounded-xl border-zinc-100 bg-zinc-50/50 focus:bg-white transition-all font-mono text-sm pr-12"
                  placeholder="AIzaSy..."
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Get your API key from{' '}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-500 hover:underline font-semibold"
                >
                  Google AI Studio
                </a>
                . This key will be used for all your bots&apos; AI features.
              </p>
            </div>
          </CardContent>
          <CardFooter className="bg-zinc-50/50 border-t border-zinc-50 p-6 flex justify-end">
            <Button
              onClick={handleSaveApiKey}
              disabled={savingApiKey}
              className="rounded-full bg-linear-to-r from-violet-500 to-purple-600 px-8 h-10 font-bold shadow-lg shadow-violet-200 disabled:opacity-70"
            >
              {savingApiKey ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : apiKeySaved ? (
                <Check className="mr-2 h-4 w-4" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {apiKeySaved ? 'Saved!' : 'Save API Key'}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
