/** Mailpit HTTP API of the Compose `mailpit` service. Matches `MAILPIT_URL` in `.env.example`. */
const mailpitUrl = (process.env.MAILPIT_URL || 'http://127.0.0.1:8025').replace(/\/$/, '');

export interface MailpitMessage {
  id: string;
  from: string;
  /** Recipient addresses, lower-cased as Mailpit stores them. */
  to: string[];
  subject: string;
  text: string;
  html: string;
  date: string;
}

export interface LatestMessageOptions {
  /** How long to keep polling for a matching message. Default 10 s. */
  timeoutMs?: number;
  /** Pause between polls. Default 250 ms. */
  intervalMs?: number;
}

interface Address {
  Address: string;
}

interface SearchResponse {
  messages: Array<{ ID: string }>;
}

interface MessageResponse {
  ID: string;
  From: Address;
  To: Address[];
  Subject: string;
  Text: string;
  HTML: string;
  Date: string;
}

/**
 * Returns the newest message sent to `address`, waiting for it to arrive (mail is sent by the worker,
 * so it can land after the action that triggers it). Throws if nothing arrives within the timeout.
 */
export async function latestMessageTo(
  address: string,
  { timeoutMs = 10_000, intervalMs = 250 }: LatestMessageOptions = {},
): Promise<MailpitMessage> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const id = await newestMessageId(address);
    if (id) return readMessage(id);
    if (Date.now() >= deadline) {
      throw new Error(`No Mailpit message to ${address} within ${timeoutMs} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function newestMessageId(address: string): Promise<string | undefined> {
  // Mailpit lists search results newest first.
  const query = new URLSearchParams({ query: `to:"${address}"`, limit: '1' });
  const result = await getJson<SearchResponse>(`/api/v1/search?${query}`);
  return result.messages[0]?.ID;
}

async function readMessage(id: string): Promise<MailpitMessage> {
  const message = await getJson<MessageResponse>(`/api/v1/message/${encodeURIComponent(id)}`);
  return {
    id: message.ID,
    from: message.From.Address,
    to: message.To.map((recipient) => recipient.Address.toLowerCase()),
    subject: message.Subject,
    text: message.Text,
    html: message.HTML,
    date: message.Date,
  };
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${mailpitUrl}${path}`);
  if (!response.ok) {
    throw new Error(`Mailpit ${path} answered ${response.status}`);
  }
  return (await response.json()) as T;
}
