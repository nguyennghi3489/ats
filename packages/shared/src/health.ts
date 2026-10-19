import { z } from 'zod';

/** Payload of the API health check: overall status and database reachability. */
export const healthSchema = z.object({
  status: z.enum(['ok', 'error']),
  db: z.enum(['ok', 'down']),
});

export type Health = z.infer<typeof healthSchema>;
