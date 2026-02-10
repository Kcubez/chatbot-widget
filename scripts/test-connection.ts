import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function testConnection() {
  console.log('DATABASE_URL:', process.env.DATABASE_URL?.substring(0, 50) + '...');

  try {
    const client = await pool.connect();
    console.log('✅ Database connection successful!');

    const result = await client.query('SELECT NOW()');
    console.log('Server time:', result.rows[0].now);

    client.release();
    await pool.end();
  } catch (error: any) {
    console.error('❌ Database connection failed:', error.message);
  }
}

testConnection();
