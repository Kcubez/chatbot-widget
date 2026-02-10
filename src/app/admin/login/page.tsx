'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { createAuthClient } from 'better-auth/react';

const authClient = createAuthClient();

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data, error } = await authClient.signIn.email({
        email,
        password,
      });

      if (error) {
        toast.error(error.message || 'Failed to login');
        setIsLoading(false);
        return;
      }

      // Verify the user has ADMIN role
      const res = await fetch('/api/admin/verify');
      const result = await res.json();

      if (!result.isAdmin) {
        toast.error('Access denied. Admin privileges required.');
        await authClient.signOut();
        setIsLoading(false);
        return;
      }

      toast.success('Welcome back, Admin!');
      router.push('/admin/dashboard');
    } catch (err) {
      toast.error('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-150 h-150 bg-red-600/5 rounded-full blur-[120px]" />
      <div className="absolute bottom-0 right-0 w-100 h-100 bg-orange-600/5 rounded-full blur-[100px]" />

      <div className="mb-6 flex items-center gap-3 relative z-10">
        <div className="h-12 w-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <Shield className="h-6 w-6 text-red-400" />
        </div>
        <div>
          <span className="text-2xl font-bold text-white block">Admin Panel</span>
          <span className="text-xs text-zinc-500 font-medium tracking-wider uppercase">
            Restricted Access
          </span>
        </div>
      </div>

      <Card className="w-full max-w-md border-zinc-800 bg-zinc-900/80 backdrop-blur-xl shadow-2xl relative z-10">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold text-white">Admin Login</CardTitle>
          <CardDescription className="text-zinc-400">
            Enter your admin credentials to access the control panel
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-email" className="text-zinc-300">
                Email
              </Label>
              <Input
                id="admin-email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-red-500/50 focus:ring-red-500/20"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-password" className="text-zinc-300">
                Password
              </Label>
              <Input
                id="admin-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-red-500/50 focus:ring-red-500/20"
              />
            </div>
            <Button
              className="w-full bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20"
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Authenticating...
                </>
              ) : (
                <>
                  <Shield className="mr-2 h-4 w-4" />
                  Access Admin Panel
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-sm text-zinc-600 relative z-10">
        This area is restricted to authorized administrators only.
      </p>
    </div>
  );
}
