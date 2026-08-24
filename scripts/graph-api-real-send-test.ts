import 'dotenv/config';
import { performance } from 'node:perf_hooks';
import { prisma } from '../src/lib/prisma';

const graphVersion = process.env.GRAPH_VERSION || 'v21.0';
const pageId = process.env.PAGE_ID?.trim();
const psids = (process.env.PSIDS || '')
  .split(',')
  .map(psid => psid.trim())
  .filter(Boolean);
const messagesPerPsid = readPositiveInteger('MESSAGES_PER_PSID', 1);
const delayMs = readNonNegativeInteger('DELAY_MS', 1000);
const requestTimeoutMs = readPositiveInteger('REQUEST_TIMEOUT_MS', 15000);
const confirmRealSend = process.env.CONFIRM_REAL_SEND === 'yes';

if (!pageId) {
  console.error('PAGE_ID is required.');
  process.exit(1);
}

if (psids.length === 0) {
  console.error('PSIDS is required. Use internal test PSIDs only, comma-separated.');
  process.exit(1);
}

if (!confirmRealSend) {
  console.error('This sends real Messenger messages. Set CONFIRM_REAL_SEND=yes to continue.');
  process.exit(1);
}

type Result = {
  psid: string;
  status: number | null;
  durationMs: number;
  ok: boolean;
  error?: string;
  response?: unknown;
  usage?: string | null;
};

const results: Result[] = [];

main().catch(error => {
  console.error('Real-send test failed:', error);
  process.exitCode = 1;
});

async function main() {
  const bot = await prisma.bot.findFirst({
    where: { messengerPageId: pageId, messengerEnabled: true },
    select: { messengerPageToken: true },
  });

  if (!bot?.messengerPageToken) {
    console.error('No enabled Messenger bot with Page access token found for PAGE_ID.');
    process.exit(1);
  }

  console.log(`Graph API real-send test: ${psids.length} PSID(s), ${messagesPerPsid} message(s) each`);
  console.log(`Graph API: ${graphVersion}; delay: ${delayMs}ms`);
  console.log('This will send real Messenger messages to the supplied PSIDs.\n');

  for (let round = 1; round <= messagesPerPsid; round += 1) {
    for (const psid of psids) {
      results.push(await sendMessage(bot.messengerPageToken, psid, round));
      if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  printSummary(results);
  process.exitCode = results.some(result => !result.ok) ? 1 : 0;
}

async function sendMessage(pageToken: string, psid: string, round: number): Promise<Result> {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  const url = `https://graph.facebook.com/${graphVersion}/me/messages?access_token=${pageToken}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: psid },
        messaging_type: 'RESPONSE',
        message: {
          text: `Graph API latency test ${round}/${messagesPerPsid} at ${new Date().toISOString()}`,
        },
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    const parsed = safeJsonParse(text) ?? text;

    return {
      psid,
      status: response.status,
      durationMs: performance.now() - startedAt,
      ok: response.ok,
      response: parsed,
      usage:
        response.headers.get('x-business-use-case-usage') ||
        response.headers.get('x-app-usage') ||
        response.headers.get('x-page-usage'),
    };
  } catch (error) {
    return {
      psid,
      status: null,
      durationMs: performance.now() - startedAt,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function printSummary(allResults: Result[]) {
  const durations = allResults.map(result => result.durationMs).sort((a, b) => a - b);
  const failed = allResults.filter(result => !result.ok).length;

  console.log('\nResults');
  console.log(`Requests: ${allResults.length}`);
  console.log(`Failures: ${failed} (${percentage(failed, allResults.length)})`);
  console.log(`Latency p50: ${percentile(durations, 50).toFixed(1)}ms`);
  console.log(`Latency p95: ${percentile(durations, 95).toFixed(1)}ms`);
  console.log(`Latency max: ${(durations.at(-1) || 0).toFixed(1)}ms`);

  const lastUsage = [...allResults].reverse().find(result => result.usage)?.usage;
  if (lastUsage) console.log(`Latest usage header: ${lastUsage}`);

  const failures = allResults.filter(result => !result.ok);
  if (failures.length > 0) {
    console.log('\nFailures');
    for (const failure of failures.slice(0, 5)) {
      console.log(JSON.stringify(failure, null, 2));
    }
  }
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function percentile(sortedValues: number[], target: number) {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((target / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, index)];
}

function percentage(value: number, total: number) {
  return total === 0 ? '0.00%' : `${((value / total) * 100).toFixed(2)}%`;
}

function readPositiveInteger(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) {
    console.error(`${name} must be a positive integer.`);
    process.exit(1);
  }
  return value;
}

function readNonNegativeInteger(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 0) {
    console.error(`${name} must be a non-negative integer.`);
    process.exit(1);
  }
  return value;
}
