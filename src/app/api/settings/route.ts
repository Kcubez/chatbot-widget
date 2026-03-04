import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';

// GET /api/settings — fetch current user settings
export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      googleApiKey: true,
    },
  });

  return NextResponse.json({
    name: user?.name || '',
    email: user?.email || '',
    googleApiKey: user?.googleApiKey || '',
  });
}

// PATCH /api/settings — update user name and/or API key
export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { name, googleApiKey } = body;

  const updateData: any = {};
  if (name !== undefined) updateData.name = name;
  if (googleApiKey !== undefined) updateData.googleApiKey = googleApiKey;

  await prisma.user.update({
    where: { id: session.user.id },
    data: updateData,
  });

  return NextResponse.json({ success: true });
}
