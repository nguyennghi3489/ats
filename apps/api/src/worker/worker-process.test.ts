import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Queue, QueueEvents } from 'bullmq';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PING_QUEUE, type PingJobData } from '../queue/ping.queue.js';

// Issue #30 acceptance checks against the real entry points (`worker:start` = dist/main.worker.js,
// `start` = dist/main.js) run as child processes, so SIGTERM goes through Nest's real shutdown
// hooks. Needs the Compose Redis. The processes use the default key prefix, so the tests run in
// their own Redis database to stay clear of any worker a developer has running.
const apiRoot = fileURLToPath(new URL('../..', import.meta.url));
const outDir = join(apiRoot, 'node_modules', '.cache', 'qa-worker-process');
const baseRedisUrl = (process.env.REDIS_URL ?? 'redis://127.0.0.1:6379').replace(/\/\d*$/, '');
const redisUrl = `${baseRedisUrl}/13`;

interface Running {
  child: ChildProcess;
  output: () => string;
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null; at: number }>;
}

function start(entry: string, env: Record<string, string>): Running {
  const child = spawn(process.execPath, [join(outDir, entry)], {
    cwd: apiRoot,
    env: { PATH: process.env.PATH ?? '', NODE_ENV: 'test', LOG_LEVEL: 'log', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null; at: number }>(
    (resolve) => child.on('exit', (code, signal) => resolve({ code, signal, at: Date.now() })),
  );
  return { child, output: () => output, exited };
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(typeof address === 'object' && address ? address.port : 0));
    });
  });
}

function records(output: string): Record<string, unknown>[] {
  return output
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('worker and API processes (issue #30)', () => {
  let queue: Queue<PingJobData>;
  let events: QueueEvents;
  const running: Running[] = [];

  beforeAll(async () => {
    const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
    execFileSync(process.execPath, [tsc, '-p', 'tsconfig.build.json', '--outDir', outDir], {
      cwd: apiRoot,
      stdio: 'inherit',
    });
    queue = new Queue<PingJobData>(PING_QUEUE.name, { connection: { url: redisUrl } });
    events = new QueueEvents(PING_QUEUE.name, { connection: { url: redisUrl } });
    await events.waitUntilReady();
    await queue.obliterate({ force: true });
  }, 60_000);

  afterEach(async () => {
    for (const proc of running.splice(0)) {
      if (proc.child.exitCode === null && proc.child.signalCode === null) {
        proc.child.kill('SIGKILL');
        await proc.exited;
      }
    }
    await queue.obliterate({ force: true });
  });

  afterAll(async () => {
    await events.close();
    await queue.close();
  });

  it('SIGTERM during a job lets the job finish before the worker exits', async () => {
    const worker = start('main.worker.js', { REDIS_URL: redisUrl });
    running.push(worker);
    await expect
      .poll(() => records(worker.output()).some((r) => r.message === 'worker ready'), {
        timeout: 15_000,
      })
      .toBe(true);

    const job = await queue.add('ping', { durationMs: 1_500 });
    await expect.poll(() => job.getState(), { timeout: 5_000 }).toBe('active');
    const termAt = Date.now();
    worker.child.kill('SIGTERM');
    const exit = await worker.exited;

    // Nest closes the context, then re-raises the signal: the process ends by SIGTERM.
    expect(exit.signal ?? exit.code).toBeTruthy();
    const stored = await queue.getJob(job.id ?? '');
    expect(await stored?.getState()).toBe('completed');
    expect(stored?.returnvalue).toEqual({ pong: true });
    expect(stored?.finishedOn).toBeGreaterThan(termAt);
    expect(stored?.finishedOn).toBeLessThanOrEqual(exit.at);

    const messages = records(worker.output()).map((r) => r.message);
    const processed = messages.indexOf('ping processed');
    const stopped = messages.indexOf('worker stopped');
    expect(processed).toBeGreaterThanOrEqual(0);
    expect(stopped).toBeGreaterThan(processed);
  }, 30_000);

  it('the HTTP API process serves requests but leaves ping jobs waiting', async () => {
    const port = await freePort();
    const api = start('main.js', {
      API_PORT: String(port),
      REDIS_URL: redisUrl,
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://ats:ats@127.0.0.1:5432/ats_test',
    });
    running.push(api);
    await expect
      .poll(
        async () => {
          try {
            return (await fetch(`http://127.0.0.1:${port}/health`)).status;
          } catch {
            return 0;
          }
        },
        { timeout: 15_000 },
      )
      .toBe(200);

    const job = await queue.add('ping', {});
    await new Promise((resolve) => setTimeout(resolve, 1_500));

    expect(await job.getState()).toBe('waiting');
    expect(records(api.output()).some((r) => r.message === 'worker ready')).toBe(false);

    // Positive control: the same job is picked up as soon as a worker process starts.
    const worker = start('main.worker.js', { REDIS_URL: redisUrl });
    running.push(worker);
    await expect(job.waitUntilFinished(events, 15_000)).resolves.toEqual({ pong: true });
  }, 40_000);
});
