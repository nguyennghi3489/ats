# Roadmap

The order the triage agent files issues in. Each step is split into small, mostly parallel issues;
triage moves to the next step only when the current one is fully covered by issues.
Scope details live in `docs/decisions.md` (section numbers below) and the screens in `docs/design/`.

Milestones: steps 1–8 and 10–11 are **M1 Core hiring loop**; the rest are **M2 Complete v1**.
"Out of v1" in decisions §16 is **Later** and is not filed.

| # | Step | Decisions | Design |
|---|---|---|---|
| 1 | **Repo foundation** — monorepo, Docker Compose (postgres, redis, versitygw, mailpit, docling-serve), CI, test setup | §1, §14 | — |
| 2 | **UI foundations** — tokens, light/dark/system theme, vue-i18n (vi/en), then one issue per component: Button, Icon button, Text field, Select, Textarea, Navigation item, Tab, Radio, Badge, Notice, Table, Empty state, Menu, Dialog | §12 | `01-foundations` |
| 3 | **Accounts** — sign-up + verification, sign-in, recovery, email queue, session handling | §2 | `03-authentication-onboarding` |
| 4 | **Workspaces** — create/choose/resume, global access guard, codes, audit log | §3, §4, §5 Codes | `03-authentication-onboarding` (WS) |
| 5 | **App shell** — sidebar, mobile nav, workspace menu, account menu, personal settings | §12, §13 | `02-app-shell` |
| 6 | **Jobs** — list, create, lifecycle, header | §5 | `02-app-shell` |
| 7 | **Stages** — Quy trình tab | §6 | `05-hiring-process` |
| 8 | **Candidates** — list, create, profile, edit, history, archive | §7 | `08-candidates` |
| 9 | **Job editor** — Nội dung, Kế hoạch | §5 Fields | `04-job-editor` |
| 10 | **Applications** — add application, list, detail | §9 | `09-applications` (Ticket05/06) |
| 11 | **Board & outcomes** — kanban, moves, outcomes, void | §6 | `09-applications` (Ticket07) |
| 12 | **Members & team** — invitations, roles, deactivation, Team & access tab | §3, §4 | `06-team-access` |
| 13 | **CVs** — storage, versions, viewer, application CVs | §7 CVs | `08-candidates` |
| 14 | **Create from CV** — Docling pipeline, then the optional Claude fallback | §8 | `08-candidates` (CV) |
| 15 | **Notes & activity** | §7 | `08-candidates` (N) |
| 16 | **Notifications, search polish, erase, social sign-in** | §2, §10, §11, §7 Erase | — |
| 17 | **Production deploy & backups** | §14 | — |
