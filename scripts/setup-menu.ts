import 'dotenv/config'; // Must be first!
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 2,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const bot = await prisma.bot.findFirst({
    where: { name: { contains: 'Test' } },
  });

  if (!bot || !bot.messengerPageToken) {
    console.log('Found no test bot with messenger page token');
    return;
  }

  const res = await fetch(
    `https://graph.facebook.com/v21.0/me/messenger_profile?access_token=${bot.messengerPageToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        persistent_menu: [
          {
            locale: 'default',
            composer_input_disabled: false,
            call_to_actions: [
              {
                type: 'postback',
                title: 'မှာထားတာတွေစစ်ချင်တယ်',
                payload: 'check_orders',
              },
              {
                type: 'postback',
                title: 'Online Payment',
                payload: 'online_payment',
              },
              {
                type: 'postback',
                title: 'ဆက်သွယ်ရန်',
                payload: 'contact_us',
              },
              {
                type: 'postback',
                title: 'အစသို့',
                payload: 'home',
              },
            ],
          },
        ],
      }),
    }
  );

  if (res.ok) {
    console.log('Menu successfully configured!');
  } else {
    console.log('Error:', await res.json());
  }
}

main().finally(() => prisma.$disconnect());
