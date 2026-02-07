import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import 'dotenv/config';

async function testConn() {
  const connectionString = process.env.DATABASE_URL;
  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    console.log('Connecting...');
    await prisma.$connect();
    console.log('Connected successfully!');
    const users = await prisma.user.findMany();
    console.log('Users count:', users.length);
  } catch (e) {
    console.error('Connection failed:', e);
  } finally {
    await prisma.$disconnect();
  }
}

testConn();
