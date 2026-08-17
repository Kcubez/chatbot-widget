import { performance } from 'node:perf_hooks';

const targetUrl = process.env.TARGET_URL || 'http://localhost:3000/api/webhooks/messenger';
const pageId = process.env.PAGE_ID?.trim();
const payload = process.env.PAYLOAD || 'MAIN_MENU';
const virtualUsers = readPositiveInteger('VUS', 10);
const durationSeconds = readPositiveInteger('DURATION_SECONDS', 60);
const thinkTimeMs = readNonNegativeInteger('THINK_TIME_MS', 1000);
const requestTimeoutMs = readPositiveInteger('REQUEST_TIMEOUT_MS', 15000);

if (!pageId || pageId === 'YOUR_PAGE_ID') {
  console.error('PAGE_ID is required and must match an enabled Messenger bot in the database.');
  process.exit(1);
}

if (!['MAIN_MENU', 'SHOW_ALL_PRODUCTS'].includes(payload)) {
  console.error('PAYLOAD must be MAIN_MENU or SHOW_ALL_PRODUCTS for this safe browsing test.');
  process.exit(1);
}

type Result = {
  durationMs: number;
  status: number | null;
  handled: boolean;
  webhookError: boolean;
  timing?: Timing;
  error?: string;
};

type Timing = {
  parse?: number;
  bot?: number;
  event?: number;
  total?: number;
};

const results: Result[] = [];
const stopAt = performance.now() + durationSeconds * 1000;

console.log(`Messenger load test: ${virtualUsers} users for ${durationSeconds}s`);
console.log(`Target: ${targetUrl}`);
console.log(`Payload: ${payload}; think time: ${thinkTimeMs}ms`);

main().catch(error => {
  console.error('Load test failed to start:', error);
  process.exitCode = 1;
});

async function main() {
  await Promise.all(Array.from({ length: virtualUsers }, (_, index) => runUser(index + 1)));
  printSummary(results);

  const failed = results.filter(
    result => result.status !== 200 || !result.handled || result.webhookError || result.error
  ).length;
  process.exitCode = failed === 0 ? 0 : 1;
}

async function runUser(userNumber: number) {
  const senderId = `load_test_${userNumber}`;

  while (performance.now() < stopAt) {
    const startedAt = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(createWebhookPayload(senderId)),
        signal: controller.signal,
      });
      results.push({
        durationMs: performance.now() - startedAt,
        status: response.status,
        handled: Number(response.headers.get('x-messenger-handled-events') || 0) > 0,
        webhookError: response.headers.get('x-messenger-webhook-result') === 'error',
        timing: parseTimingHeader(response.headers.get('x-messenger-timing')),
      });
    } catch (error) {
      results.push({
        durationMs: performance.now() - startedAt,
        status: null,
        handled: false,
        webhookError: false,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timeout);
    }

    if (thinkTimeMs > 0 && performance.now() < stopAt) {
      await new Promise(resolve => setTimeout(resolve, thinkTimeMs));
    }
  }
}

function createWebhookPayload(senderId: string) {
  return {
    object: 'page',
    entry: [
      {
        id: pageId,
        time: Date.now(),
        messaging: [
          {
            sender: { id: senderId },
            recipient: { id: pageId },
            timestamp: Date.now(),
            postback: { payload, title: payload },
          },
        ],
      },
    ],
  };
}

function printSummary(allResults: Result[]) {
  const durations = allResults.map(result => result.durationMs).sort((a, b) => a - b);
  const failed = allResults.filter(
    result => result.status !== 200 || !result.handled || result.webhookError || result.error
  ).length;
  const totalSeconds = durationSeconds || 1;

  console.log('\nResults');
  console.log(`Requests: ${allResults.length}`);
  console.log(`Throughput: ${(allResults.length / totalSeconds).toFixed(2)} req/s`);
  console.log(`Failures: ${failed} (${percentage(failed, allResults.length)})`);
  console.log(`Not handled: ${allResults.filter(result => !result.handled).length}`);
  console.log(`Webhook errors: ${allResults.filter(result => result.webhookError).length}`);
  console.log(`Latency p50: ${percentile(durations, 50).toFixed(1)}ms`);
  console.log(`Latency p95: ${percentile(durations, 95).toFixed(1)}ms`);
  console.log(`Latency p99: ${percentile(durations, 99).toFixed(1)}ms`);
  console.log(`Latency max: ${(durations.at(-1) || 0).toFixed(1)}ms`);
  printTimingSummary(allResults);
}

function printTimingSummary(allResults: Result[]) {
  const timedResults = allResults.filter(result => result.timing);
  if (timedResults.length === 0) return;

  console.log('\nServer timing');
  for (const key of ['parse', 'bot', 'event', 'total'] as const) {
    const values = timedResults
      .map(result => result.timing?.[key])
      .filter((value): value is number => typeof value === 'number');
    if (values.length === 0) continue;
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    console.log(`${key}: avg ${avg.toFixed(1)}ms; max ${Math.max(...values).toFixed(1)}ms`);
  }
}

function parseTimingHeader(header: string | null): Timing | undefined {
  if (!header) return undefined;
  const timing: Timing = {};
  for (const part of header.split(',')) {
    const [key, rawValue] = part.split('=');
    const value = Number(rawValue);
    if (!['parse', 'bot', 'event', 'total'].includes(key) || !Number.isFinite(value)) continue;
    timing[key as keyof Timing] = value;
  }
  return timing;
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
