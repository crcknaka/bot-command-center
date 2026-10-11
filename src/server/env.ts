import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  // Empty = same-origin only (the panel and API share one host). Set to allow another origin.
  CORS_ORIGIN: z.string().default(''),
});

export const env = envSchema.parse(process.env);
