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
import { User, Key, Save } from 'lucide-react';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export default async function SettingsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) return null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-3xl">
      <div>
        <h2 className="text-3xl font-black tracking-tight text-zinc-900">Settings</h2>
        <p className="text-zinc-500 font-medium">Manage your account and platform configurations</p>
      </div>

      <div className="grid gap-6">
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
                defaultValue={session.user.name || ''}
                className="h-11 rounded-xl border-zinc-100 bg-zinc-50/50 focus:bg-white transition-all font-medium"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs font-black uppercase tracking-widest text-zinc-400">
                Email Address
              </Label>
              <Input
                defaultValue={session.user.email}
                disabled
                className="h-11 rounded-xl border-zinc-100 bg-zinc-50 cursor-not-allowed opacity-70 font-medium"
              />
            </div>
          </CardContent>
          <CardFooter className="bg-zinc-50/50 border-t border-zinc-50 p-6 flex justify-end">
            <Button className="rounded-full bg-zinc-900 px-8 h-10 font-bold shadow-lg shadow-zinc-200">
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </Button>
          </CardFooter>
        </Card>

        <Card className="border-none shadow-xl bg-white overflow-hidden opacity-60">
          <CardHeader className="border-b border-zinc-50 pb-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center">
                <Key className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold flex items-center gap-3">
                  API Configuration
                  <Badge variant="secondary" className="rounded-full px-2 py-0 text-[10px]">
                    COMING SOON
                  </Badge>
                </CardTitle>
                <CardDescription>Advanced integration settings for developers</CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}

function Badge({ children, variant, className }: any) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-hidden focus:ring-2 focus:ring-zinc-950 focus:ring-offset-2 ${
        variant === 'secondary'
          ? 'bg-zinc-100 text-zinc-900 hover:bg-zinc-100/80'
          : 'bg-zinc-900 text-zinc-50 hover:bg-zinc-900/80'
      } ${className}`}
    >
      {children}
    </span>
  );
}
