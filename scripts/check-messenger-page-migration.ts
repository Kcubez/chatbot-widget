import 'dotenv/config';
import pg from 'pg';

// Read-only preflight. Do not print Page IDs, access tokens, or connection URLs.
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
async function main() {
  await client.connect();
  await client.query('BEGIN READ ONLY');
  const { rows } = await client.query(`
    SELECT
      count(*)::int AS total_bots,
      count(*) FILTER (WHERE "messengerPageId" IS NOT NULL)::int AS connected_bots,
      count(*) FILTER (WHERE "messengerPageId" IS NOT NULL AND "messengerEnabled")::int AS enabled_connected_bots,
      count(*) FILTER (WHERE "messengerPageId" IS NOT NULL AND "messengerPageId" !~ '^[0-9]+$')::int AS invalid_page_ids
    FROM bot
  `);
  const duplicates = await client.query(`SELECT count(*)::int AS duplicate_page_groups FROM (SELECT "messengerPageId" FROM bot WHERE "messengerPageId" IS NOT NULL GROUP BY "messengerPageId" HAVING count(*) > 1) d`);
  const index = await client.query(`SELECT count(*)::int AS unique_index_present FROM pg_indexes WHERE tablename = 'bot' AND indexname = 'bot_messengerPageId_key'`);
  console.log(JSON.stringify({ ...rows[0], ...duplicates.rows[0], ...index.rows[0] }, null, 2));
  await client.query('ROLLBACK');
}
main().catch(error => { console.error('Read-only preflight failed:', error.code || error.name); process.exitCode = 1; }).finally(() => client.end());
