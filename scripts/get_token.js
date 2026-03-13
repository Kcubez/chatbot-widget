const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.bot.findFirst({where:{name:{contains:"Test"}}}).then(b => {
  console.log(b ? b.messengerPageToken : "NOT_FOUND");
  prisma.$disconnect();
});
