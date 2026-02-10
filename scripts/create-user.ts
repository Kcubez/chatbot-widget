import 'dotenv/config';
import { auth } from '../src/lib/auth';

async function createUser() {
  const email = process.argv[2];
  const password = process.argv[3];
  const name = process.argv[4] || 'User';

  if (!email || !password) {
    console.log('Usage: npx tsx scripts/create-user.ts <email> <password> <name?>');
    process.exit(1);
  }

  console.log(`Attempting to create user: ${email}...`);

  try {
    // Use Better Auth's own API to ensure correct hashing and database insertion
    const user = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
      },
    });

    console.log('\n✅ User created successfully via Better Auth!');
    console.log(`   ID: ${user.user.id}`);
    console.log(`   Email: ${user.user.email}`);

    console.log('\nNow promoting to ADMIN...');

    // We can use the existing role update logic in create-admin.ts
    // or just tell the user to run it.
    console.log(`\nNext step: npx tsx scripts/create-admin.ts ${email}`);
  } catch (error: any) {
    if (error.message?.includes('already exists') || error.status === 400) {
      console.log('\nℹ️ User already exists. You can just promote them:');
      console.log(`   npx tsx scripts/create-admin.ts ${email}`);
    } else {
      console.error('\n❌ Error creating user:', error);
    }
  }

  process.exit(0);
}

createUser();
