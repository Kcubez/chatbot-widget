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
    select: { role: true },
  });
  return user?.role === 'ADMIN' ? session : null;
}

// GET - List all users
export async function GET() {
  try {
    const session = await verifyAdmin();
    if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        emailVerified: true,
        _count: { select: { bots: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(users);
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST - Create a new user
export async function POST(request: Request) {
  try {
    const session = await verifyAdmin();
    if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { email, password, name, role } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    // Use Better Auth API to create user (ensures correct password hashing)
    const result = await auth.api.signUpEmail({
      body: { email, password, name: name || 'User' },
    });

    // Update role if specified
    if (role && role !== 'USER') {
      await prisma.user.update({
        where: { id: result.user.id },
        data: { role },
      });
    }

    return NextResponse.json(
      {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: role || 'USER',
      },
      { status: 201 }
    );
  } catch (error: any) {
    const message = error?.body?.message || error?.message || 'Failed to create user';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
