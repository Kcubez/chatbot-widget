'use client';

import { useEffect, useState } from 'react';
import { Users, Shield, Bot, Loader2, Search, Plus, Pencil, Trash2, X, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface User {
  id: string;
  name: string | null;
  email: string;
  role: string;
  createdAt: string;
  _count: { bots: number };
}

// ─── Create User Dialog ──────────────────────────────────────────────
function CreateUserDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name, role: 'USER' }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to create user');
        return;
      }

      toast.success(`User "${email}" created successfully!`);
      setEmail('');
      setPassword('');
      setName('');
      onCreated();
      onClose();
    } catch {
      toast.error('Failed to create user');
    } finally {
      setIsLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Plus className="h-5 w-5 text-emerald-400" />
            Create New User
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-zinc-300">Name</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="John Doe"
              className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-zinc-300">Email *</Label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="user@example.com"
              required
              className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-zinc-300">Password *</Label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min 6 characters"
              required
              minLength={6}
              className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 bg-white border-white text-black hover:bg-zinc-200 hover:text-black font-medium"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Create
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Edit User Dialog ────────────────────────────────────────────────
function EditUserDialog({
  user,
  onClose,
  onUpdated,
}: {
  user: User | null;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsLoading(true);

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to update user');
        return;
      }

      toast.success('User updated successfully!');
      onUpdated();
      onClose();
    } catch {
      toast.error('Failed to update user');
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Pencil className="h-5 w-5 text-blue-400" />
            Edit User
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 p-3 rounded-xl bg-zinc-800/50 border border-zinc-700">
          <span className="text-xs text-zinc-500">Email</span>
          <p className="text-sm text-white font-medium">{user.email}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-zinc-300">Name</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="User name"
              className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 bg-white border-white text-black hover:bg-zinc-200 hover:text-black font-medium"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete Confirm Dialog ───────────────────────────────────────────
function DeleteConfirmDialog({
  user,
  onClose,
  onDeleted,
}: {
  user: User | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');

  const handleDelete = async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to delete user');
        return;
      }

      toast.success('User deleted successfully');
      onDeleted();
      onClose();
    } catch {
      toast.error('Failed to delete user');
    } finally {
      setIsLoading(false);
      setConfirmEmail('');
    }
  };

  if (!user) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-zinc-900 border border-red-500/20 rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-red-400 flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            Delete User
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 mb-4">
          <p className="text-sm text-zinc-300">
            This will permanently delete{' '}
            <strong className="text-white">{user.name || user.email}</strong> and all their data
            including:
          </p>
          <ul className="mt-2 text-xs text-zinc-400 space-y-1">
            <li>• {user._count.bots} bot(s) and their configurations</li>
            <li>• All conversations and messages</li>
            <li>• All trained documents</li>
            <li>• Account and session data</li>
          </ul>
        </div>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-zinc-400 text-xs">
              Type <strong className="text-red-400">{user.email}</strong> to confirm
            </Label>
            <Input
              value={confirmEmail}
              onChange={e => setConfirmEmail(e.target.value)}
              placeholder={user.email}
              className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-600"
            />
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 bg-white border-white text-black hover:bg-zinc-200 hover:text-black font-medium"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleDelete}
              disabled={isLoading || confirmEmail !== user.email}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white disabled:opacity-40"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete Forever
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────
export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (Array.isArray(data)) setUsers(data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filteredUsers = users
    .filter(
      user =>
        user.name?.toLowerCase().includes(search.toLowerCase()) ||
        user.email.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      // Admin lowest (USER first, ADMIN last)
      if (a.role === 'ADMIN' && b.role !== 'ADMIN') return 1;
      if (a.role !== 'ADMIN' && b.role === 'ADMIN') return -1;
      return 0;
    });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <h1 className="text-3xl font-bold text-white tracking-tight">Users</h1>
          <p className="text-zinc-400 mt-1">{users.length} total users on the platform</p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add User
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
        <Input
          placeholder="Search users by name or email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500 focus:border-red-500/50"
        />
      </div>

      {/* Users Table */}
      <Card className="border-zinc-800 bg-zinc-900/80 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2 text-xl font-bold">
            <Users className="h-5 w-5 text-blue-400" />
            All Users
          </CardTitle>
          <CardDescription className="text-zinc-500">
            Manage all registered users — create, edit roles, or remove accounts
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 px-6 py-3 text-xs font-bold text-zinc-600 uppercase tracking-wider border-b border-zinc-800">
            <div className="col-span-3">User</div>
            <div className="col-span-3">Email</div>
            <div className="col-span-2 text-center">Role</div>
            <div className="col-span-1 text-center">Bots</div>
            <div className="col-span-1 text-center">Joined</div>
            <div className="col-span-2 text-right pr-2">Actions</div>
          </div>

          {/* Table Rows */}
          <div className="divide-y divide-zinc-800/50">
            {filteredUsers.map(user => (
              <div
                key={user.id}
                className="grid grid-cols-12 gap-4 px-6 py-5 items-center hover:bg-zinc-800/30 transition-colors"
              >
                <div className="col-span-3 flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm font-bold text-white uppercase shadow-sm">
                    {user.name?.charAt(0) || user.email.charAt(0)}
                  </div>
                  <span className="text-sm font-semibold text-white truncate tracking-wide">
                    {user.name || 'Unnamed'}
                  </span>
                </div>
                <div className="col-span-3 text-sm text-zinc-500 truncate">{user.email}</div>
                <div className="col-span-2 text-center">
                  <Badge
                    variant={user.role === 'ADMIN' ? 'destructive' : 'secondary'}
                    className={`text-[10px] font-bold tracking-widest px-2.5 py-0.5 border ${
                      user.role === 'ADMIN'
                        ? 'bg-red-500/10 border-red-500/20 text-red-500'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                    }`}
                  >
                    {user.role === 'ADMIN' && <Shield className="h-3 w-3 mr-1" />}
                    {user.role}
                  </Badge>
                </div>
                <div className="col-span-1 flex items-center justify-center gap-1.5 text-sm text-zinc-500">
                  <Bot className="h-3.5 w-3.5" />
                  {user._count.bots}
                </div>
                <div className="col-span-1 text-center text-xs text-zinc-600">
                  {new Date(user.createdAt).toLocaleDateString(undefined, {
                    month: 'numeric',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </div>
                <div className="col-span-2 flex items-center justify-end gap-3 pr-2">
                  {user.role !== 'ADMIN' && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditUser(user)}
                        className="h-8 w-8 p-0 text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteUser(user)}
                        className="h-8 w-8 p-0 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {filteredUsers.length === 0 && (
            <div className="text-center py-16 text-zinc-600 italic">
              No users found matching your search.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <CreateUserDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={fetchUsers}
      />
      <EditUserDialog user={editUser} onClose={() => setEditUser(null)} onUpdated={fetchUsers} />
      <DeleteConfirmDialog
        user={deleteUser}
        onClose={() => setDeleteUser(null)}
        onDeleted={fetchUsers}
      />
    </div>
  );
}
