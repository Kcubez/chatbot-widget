'use server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';

export async function getUserAllowedChannels() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return [];
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { allowedChannels: true },
  });

  return user?.allowedChannels || [];
}
