import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';

async function main() {
  let owned = true;
  let duplicate = false;
  let race = false;
  let writes = 0;
  let duplicateOwner = 'owner';
  const fake = {
    bot: {
      async findFirst(args: any) {
        if ('userId' in args.where) return owned ? { id: 'bot-a' } : null;
        assert.equal(args.where.id.not, 'bot-a');
        assert.equal(args.where.messengerPageId, '123');
        // Disabled bots must reserve their Page too.
        assert.equal(args.where.messengerEnabled, undefined);
        return duplicate ? { id: 'bot-b', name: 'Existing Education Bot', userId: duplicateOwner } : null;
      },
      async update(args: any) {
        assert.deepEqual(args.where, { id: 'bot-a', userId: 'owner' });
        if (race) throw new Prisma.PrismaClientKnownRequestError('Unique constraint', { code: 'P2002', clientVersion: '7.3.0' });
        writes++;
        return args.data;
      },
    },
  };
  (globalThis as any).prisma = fake;
  const { updateOwnedBot, MessengerPageConflictError } = await import('../src/lib/messenger-page-connection');
  const update = (data: any) => updateOwnedBot('bot-a', 'owner', data);
  assert.deepEqual(await update({ messengerPageId: ' 123 ' }), { messengerPageId: '123' });
  duplicate = true;
  await assert.rejects(update({ messengerPageId: '123' }), MessengerPageConflictError);
  assert.equal(writes, 1);
  await assert.rejects(update({ messengerPageId: '123' }), /Existing Education Bot/);
  duplicateOwner = 'someone-else';
  await assert.rejects(update({ messengerPageId: '123' }), error => {
    assert.ok(error instanceof MessengerPageConflictError);
    assert.ok(!error.message.includes('Existing Education Bot'));
    return true;
  });
  duplicate = false;
  race = true;
  await assert.rejects(update({ messengerPageId: '123' }), MessengerPageConflictError);
  race = false;
  assert.deepEqual(await update({ messengerPageId: null, messengerEnabled: false }), { messengerPageId: null, messengerEnabled: false });
  await assert.rejects(update({ messengerPageId: { set: '123' } }), /Invalid Facebook Page ID/);
  await assert.rejects(update({ messengerPageId: '' }), /Invalid Facebook Page ID/);
  owned = false;
  await assert.rejects(update({ messengerPageId: '123' }), /Unauthorized/);
  assert.equal(writes, 2);
  console.log('PASS: assignment, normalization, duplicate reservation, race conflict, disconnect, invalid IDs, ownership');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
