// Entry point for drizzle-kit (drizzle.config.ts) and for code that needs tables of several
// features. Tables are declared next to their feature in `src/<feature>/<feature>.schema.ts`
// (also picked up by the config's glob) and re-exported here.
export { jobAssignments, jobStages, jobs } from '../jobs/jobs.schema.js';
