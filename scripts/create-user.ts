import { auth } from '../src/lib/auth';

async function createUser() {
  const email = process.argv[2];
  const password = process.argv[3];
  const name = process.argv[4] || 'Admin User';

  if (!email || !password) {
    console.log('Usage: npx tsx scripts/create-user.ts <email> <password> <name?>');
    process.exit(1);
  }

  try {
    const user = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
      },
    });
    console.log('User created successfully:', user);
  } catch (error) {
    console.error('Error creating user:', error);
  }
}

createUser();
