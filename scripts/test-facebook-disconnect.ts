import assert from 'node:assert/strict';
import { disconnectFacebookPage } from '../src/lib/disconnect-facebook';

async function main() {
  const originalFetch = globalThis.fetch;
  try {
    for (const status of [401, 403, 404, 500]) {
      globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Disconnect was not saved' }), { status });
      await assert.rejects(disconnectFacebookPage('bot-a'), /Disconnect was not saved/);
    }
    globalThis.fetch = async () => new Response('Internal Server Error', { status: 500 });
    await assert.rejects(disconnectFacebookPage('bot-a'), /Failed to disconnect/);
    globalThis.fetch = async () => new Response('{}', { status: 200 });
    await assert.rejects(disconnectFacebookPage('bot-a'), /Failed to disconnect/);
    globalThis.fetch = async (url, options) => {
      assert.equal(url, '/api/bots/bot-a/messenger/connect');
      assert.equal(options?.method, 'DELETE');
      return new Response(JSON.stringify({ success: true }));
    };
    await disconnectFacebookPage('bot-a');
    console.log('PASS: failed HTTP responses and invalid success bodies cannot report a successful disconnect');
  } finally {
    globalThis.fetch = originalFetch;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
