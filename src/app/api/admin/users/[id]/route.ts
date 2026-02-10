import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

// Helper to verify admin
async function verifyAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true },
  });
  return user?.role === 'ADMIN' ? { ...session, adminId: user.id } : null;
}

// GET - Get single user
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await verifyAdmin();
    if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        emailVerified: true,
        _count: { select: { bots: true } },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// PUT - Update user
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await verifyAdmin();
    if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id } = await params;
    const { name, role } = await request.json();

    // Prevent admin from changing their own role
    if (id === session.adminId && role && role !== 'ADMIN') {
      return NextResponse.json({ error: 'Cannot change your own admin role' }, { status: 400 });
    }

    const updateData: { name?: string; role?: string } = {};
    if (name !== undefined) updateData.name = name;
    if (role !== undefined) updateData.role = role;

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    return NextResponse.json(user);
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// DELETE - Delete user
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await verifyAdmin();
    if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id } = await params;

    // Prevent admin from deleting themselves
    if (id === session.adminId) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
    }

    // Delete user's bots, conversations, messages, documents first
    const userBots = await prisma.bot.findMany({
      where: { userId: id },
      select: { id: true },
    });

    const botIds = userBots.map(b => b.id);

    if (botIds.length > 0) {
      // Delete messages -> conversations -> documents -> bots
      await prisma.message.deleteMany({
        where: { conversation: { botId: { in: botIds } } },
      });
      await prisma.conversation.deleteMany({
        where: { botId: { in: botIds } },
      });
      await prisma.document.deleteMany({
        where: { botId: { in: botIds } },
      });
      await prisma.bot.deleteMany({
        where: { userId: id },
      });
    }

    // Delete sessions and accounts (Better Auth related)
    await prisma.session.deleteMany({ where: { userId: id } });
    await prisma.account.deleteMany({ where: { userId: id } });

    // Finally delete the user
    await prisma.user.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
