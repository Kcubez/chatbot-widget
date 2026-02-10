import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function createAdmin() {
  const email = process.argv[2];

  if (!email) {
    console.log('Usage: npx tsx scripts/create-admin.ts <email>');
    console.log('Example: npx tsx scripts/create-admin.ts admin@chatbot.com');
    console.log('\nNote: User must already exist. Create user first with create-user.ts');
    process.exit(1);
  }

  try {
    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      console.log(`\n❌ User "${email}" not found.`);
      console.log(`\nPlease create the user first:`);
      console.log(`   npx tsx scripts/create-user.ts ${email} <password> "<name>"`);
      process.exit(1);
    }

    // Update role to ADMIN
    await prisma.user.update({
      where: { email },
      data: { role: 'ADMIN' },
    });

    console.log(`\n✅ User promoted to ADMIN!`);
    console.log(`   Email: ${email}`);
    console.log(`   Name: ${user.name || 'N/A'}`);
    console.log(`   Role: ADMIN`);
    console.log(`\n   Login at: http://localhost:3000/admin/login`);
  } catch (error: any) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

createAdmin();
