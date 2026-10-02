import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute the actual private handler in isolation: no database or Facebook sends.
const path = 'src/app/api/webhooks/messenger/route.ts';
const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
const handler = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'handleAttachment');
assert.ok(handler, 'Attachment handler must exist');
const code = ts.transpileModule(handler.getText(source), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

async function main() {
  let state = 'education_human_handoff';
  const calls: { type: string; args: unknown[] }[] = [];
  const capture = (type: string) => async (...args: unknown[]) => { calls.push({ type, args }); };
  const handleAttachment = runInNewContext(`${code}; handleAttachment`, {
    getSession: async (botId: string, senderId: string) => {
      assert.equal(botId, 'bot-test');
      assert.equal(senderId, 'customer-test');
      return { state, pendingData: { township: 'Test', deliveryFee: 500 } };
    },
    sendMessengerMessage: capture('message'),
    sendMessengerQuickReplies: capture('quickReplies'),
    finishOrder: capture('finishOrder'),
  });
  const send = (type: string) => handleAttachment({ id: 'bot-test' }, 'fake-token', 'customer-test', [{ type, payload: { url: 'https://example.com/receipt.png' } }]);

  for (const type of ['image', 'file', 'audio', 'video']) await send(type);
  assert.equal(calls.length, 0, 'Handoff must suppress every attachment reply and order action');

  state = 'browsing';
  await send('image');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, 'message', 'Normal attachment acknowledgement must still work');
  calls.length = 0;

  state = 'collecting_payment_screenshot';
  await send('image');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, 'finishOrder');
  assert.equal(calls[0].args.at(-1), 'https://example.com/receipt.png');
  calls.length = 0;
  await send('file');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, 'quickReplies', 'Non-image payment uploads still prompt for an image');
  console.log('PASS: handoff attachments stay silent; normal images and payment uploads retain their behavior');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
