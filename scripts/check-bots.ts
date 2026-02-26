import { prisma } from '../src/lib/prisma';

async function main() {
  const bots = await prisma.bot.findMany();
  console.log('--- Bots in Database ---');
  if (bots.length === 0) console.log('No bots found.');
  bots.forEach(bot => {
    console.log(`Bot ID: ${bot.id}`);
    console.log(`Name: ${bot.name}`);
    console.log(`Telegram Bot Token: ${bot.telegramBotToken ? 'SET' : 'NOT SET'}`);
    console.log('------------------------');
  });
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
