import { z } from 'zod';
import type { Locale } from './auth.js';
import { isCountryCode } from './countries.js';

/** Lifecycle statuses of a job (decisions §5). A new job starts as `draft`. */
export const JOB_STATUSES = ['draft', 'open', 'paused', 'closed'] as const;

export const jobStatusSchema = z.enum(JOB_STATUSES);

export type JobStatus = z.infer<typeof jobStatusSchema>;

/**
 * Who can see a job (decisions §3): `normal` jobs are visible to every admin and recruiter,
 * `restricted` ones only to admins and assigned members. Collaborators see assigned jobs only.
 */
export const JOB_ACCESS_SCOPES = ['normal', 'restricted'] as const;

export const jobAccessScopeSchema = z.enum(JOB_ACCESS_SCOPES);

export type JobAccessScope = z.infer<typeof jobAccessScopeSchema>;

/** Longest job title accepted, after trimming. */
export const JOB_TITLE_MAX_LENGTH = 200;

/** A job title: trimmed, 1–200 characters. */
export const jobTitleSchema = z.string().trim().min(1).max(JOB_TITLE_MAX_LENGTH);

/** Longest city name of a job location, after trimming. */
export const JOB_CITY_MAX_LENGTH = 100;

/**
 * One location row of a job (decisions §5): an ISO 3166-1 alpha-2 country and an optional
 * free-text city. A city always comes with a country.
 */
export const jobLocationSchema = z.strictObject({
  country: z.string().refine(isCountryCode),
  city: z.string().trim().min(1).max(JOB_CITY_MAX_LENGTH).optional(),
});

export type JobLocation = z.infer<typeof jobLocationSchema>;

/**
 * The stages a new job gets (decisions §6), named in the creator's language and stored as data:
 * renamed per job afterwards, never translated per viewer.
 */
export const DEFAULT_STAGE_NAMES: Readonly<Record<Locale, readonly string[]>> = {
  vi: ['Mới', 'Sơ loại', 'Phỏng vấn', 'Đề nghị'],
  en: ['New', 'Screening', 'Interview', 'Offer'],
};

/** A job as lists and headers show it. `owner` is display only and grants no access. */
export const jobSummarySchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  title: z.string(),
  status: jobStatusSchema,
  owner: z.object({ id: z.string().min(1), name: z.string() }).nullable(),
});

export type JobSummary = z.infer<typeof jobSummarySchema>;
