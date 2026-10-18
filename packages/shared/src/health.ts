import { z } from 'zod';

/** Payload of the API health check. Placeholder schema proving the shared pipeline works. */
export const healthSchema = z.object({
  status: z.literal('ok'),
});

export type Health = z.infer<typeof healthSchema>;
