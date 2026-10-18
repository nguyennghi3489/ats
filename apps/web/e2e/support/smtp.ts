import { connect, type Socket } from 'node:net';

/** Where the Compose Mailpit service accepts SMTP. Matches `.env.example`. */
const smtpHost = process.env.SMTP_HOST || '127.0.0.1';
const smtpPort = Number(process.env.SMTP_PORT || 1025);

export interface MailToSend {
  to: string;
  subject: string;
  text: string;
  from?: string;
}

/**
 * Sends one plain-text message over SMTP with no auth or TLS. Test-only: it lets helper tests put mail
 * into Mailpit without depending on the API's mailer. Not for anything that leaves the machine.
 */
export async function sendMail({
  to,
  subject,
  text,
  from = 'e2e@ats.example.test',
}: MailToSend): Promise<void> {
  const socket = connect({ host: smtpHost, port: smtpPort });
  socket.setEncoding('utf8');
  const replies = replyReader(socket);
  try {
    await expectReply(replies, 220);
    await command(socket, replies, 'EHLO e2e.local', 250);
    await command(socket, replies, `MAIL FROM:<${from}>`, 250);
    await command(socket, replies, `RCPT TO:<${to}>`, 250);
    await command(socket, replies, 'DATA', 354);
    const body = [
      `From: <${from}>`,
      `To: <${to}>`,
      `Subject: ${subject}`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      // Dot-stuffing: a line starting with "." would otherwise end the message early.
      ...text.split(/\r?\n/).map((line) => (line.startsWith('.') ? `.${line}` : line)),
    ].join('\r\n');
    await command(socket, replies, `${body}\r\n.`, 250);
    await command(socket, replies, 'QUIT', 221);
  } finally {
    socket.destroy();
  }
}

type ReplyReader = () => Promise<string>;

/** Yields one complete SMTP reply at a time (multi-line replies use `250-` until the last `250 `). */
function replyReader(socket: Socket): ReplyReader {
  let buffer = '';
  const waiting: Array<{ resolve: (reply: string) => void; reject: (error: Error) => void }> = [];
  let failure: Error | undefined;

  const flush = () => {
    while (waiting.length > 0) {
      const match = /(?:^|\r\n)(\d{3}) [^\r\n]*\r\n/.exec(buffer);
      if (!match) return;
      const end = match.index + match[0].length;
      const reply = buffer.slice(0, end);
      buffer = buffer.slice(end);
      waiting.shift()?.resolve(reply);
    }
  };
  const fail = (error: Error) => {
    failure = error;
    for (const pending of waiting.splice(0)) pending.reject(error);
  };

  socket.on('data', (chunk: string) => {
    buffer += chunk;
    flush();
  });
  socket.on('error', fail);
  socket.on('close', () => fail(new Error('SMTP connection closed')));

  return () =>
    new Promise<string>((resolve, reject) => {
      if (failure) return reject(failure);
      waiting.push({ resolve, reject });
      flush();
    });
}

async function expectReply(replies: ReplyReader, code: number): Promise<void> {
  const reply = await replies();
  const lastLine = reply.trimEnd().split('\r\n').at(-1) ?? '';
  if (!lastLine.startsWith(`${code} `)) {
    throw new Error(`SMTP expected ${code}, got: ${reply.trim()}`);
  }
}

async function command(
  socket: Socket,
  replies: ReplyReader,
  line: string,
  code: number,
): Promise<void> {
  socket.write(`${line}\r\n`);
  await expectReply(replies, code);
}
