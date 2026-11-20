# Website architecture, efficiency and security audit

**Audit date:** 19 November 2026  
**Audited source:** `DevelopSupabase`  
**Outcome branch:** `Develop`  
**Production branch:** `main` (not changed)  
**Preview site:** GitHub Pages repository `Website-preview`  
**Supabase project:** Office Impact Website (EU region)

## Executive summary

The current architecture is reasonable for a small community website: static HTML/CSS/JavaScript on GitHub Pages, Supabase for content and Google authentication, and a separate admin interface. A framework rewrite is not justified by the current size or traffic assumptions.

The most important issue is environment isolation. The public production site and the preview site currently use the same Supabase project and the same content database. The preview is isolated as a website deployment, but not as a content or database environment. A user with admin rights in preview can publish content that the production site reads.

Security controls inside Supabase are generally well structured: row-level security is enabled on all application tables, public reads are limited to live content, editor operations are draft-scoped, and publishing/access-management operations use admin checks in private database functions. The current Supabase security advisor reported no high-severity exposure; its findings are listed below.

This branch contains a conservative repository cleanup and this report. It does not change database permissions, OAuth configuration, the production branch, or the live site.

## Current architecture

- **Public site:** static HTML, CSS and JavaScript, deployed from GitHub Pages.
- **Preview:** a separate GitHub Pages repository receives a snapshot from `DevelopSupabase`.
- **Content:** Supabase tables hold event/story records and people profiles, with separate `draft` and `live` stages.
- **Admin:** Google OAuth sign-in; approved editors work with drafts; admins publish and manage access.
- **Media:** existing images are served from the GitHub Pages site; a public-read Supabase Storage bucket is configured for future uploads.
- **Legacy compatibility:** static JSON files remain as a fallback while the migration is incomplete.

The public and admin JavaScript bundles are each approximately 43–51 KB and about 1,200 lines. This is still a modest static site, but the admin bundle has become a second substantial application.

## Findings and priorities

### High priority

**1. Preview and production share one Supabase database**

Both deployments load the same Supabase project URL. The preview admin therefore operates on the same drafts, live records, users and publishing functions as production. Publishing from the preview is not a staging-only action.

**Recommendation:** create a separate Supabase staging project or a supported Supabase development branch, and configure the preview site to use it. Keep production credentials/configuration separate. Test publishing and schema changes in staging before promoting them.

**2. Production branch requires a pull request but no approval**

The active `Protect production` ruleset targets `main` and requires pull requests, but its required approval count is zero. It does not require code-owner review. This is weaker than a human-reviewed production release.

**Recommendation:** require at least one approval, ideally from an owner/maintainer, and require the relevant validation/deployment checks before merge. Keep bypass disabled unless there is a documented emergency process.

**3. Database changes are not represented as migrations in the repository**

The Supabase project records five applied migrations, but no corresponding SQL migration files or Supabase project configuration are present in this repository. A new developer or replacement environment cannot reliably recreate the database from Git alone.

**Recommendation:** introduce a Supabase CLI project and commit a reviewed baseline plus subsequent migrations under version control. Treat the database schema, policies, functions and triggers as code. Apply changes to staging first, then promote through the reviewed migration process.

### Medium priority

**4. Static JSON fallback can display stale content**

When the Supabase public-content request fails, the homepage silently loads `content/entries.json` and `content/people.json`. These snapshots can be older than the database. A record that has been unpublished or changed in Supabase can reappear in the public site if Supabase is temporarily unavailable.

**Recommendation:** once the migration is stable, remove the fallback and display a clear content-unavailable state instead. During transition, make the fallback development-only or explicitly label it as a stale snapshot.

**5. No published-content revision history**

Publishing updates the live copy; unpublishing deletes the live row while retaining a draft. The current schema has audit timestamps/user IDs, but no durable revision history of prior published versions.

**Recommendation:** before the content volume grows, consider a revision/history table or an append-only publication record. This would support rollback, traceability and recovery from accidental publication.

**6. Duplicate rendering and business logic**

The public site and admin preview each implement their own event/story/person detail rendering, date handling, image selection and rich-text sanitisation. This has already led to inconsistent fixes and regressions.

**Recommendation:** extract shared, framework-free modules for:
- content normalization and field fallbacks;
- event/story/person view models;
- rich-text sanitisation and URL validation;
- image selection and date formatting.

Keep the actual public and admin layouts separate, but make them consume the same normalized data and safe rendering helpers. Add small tests for empty rich-text fallbacks, online events, past events, images, and event/story combined records.

**7. Editor access invitations have no expiry**

Pending email access grants remain until used or revoked. This is workable for a small team, but long-lived unused invitations can become stale.

**Recommendation:** add an expiry (for example, 30 days), surface expiry in the admin access list, and allow an admin to renew an invitation.

**8. Admin recovery depends on a very small admin group**

At audit time, Supabase contained one active editor/admin account and two pending access invitations. No MFA factors were registered in Supabase.

**Recommendation:** maintain at least two trusted administrators and enforce strong multi-factor authentication on the underlying Google accounts. Consider Supabase MFA enforcement for admin actions if/when the sign-in model supports it.

### Low priority / watch list

**9. External JavaScript dependency**

The Supabase browser SDK is pinned to an exact jsDelivr package version, which is good. The Content Security Policy trusts the jsDelivr origin. This means the browser still relies on a third-party CDN to deliver executable code.

**Recommendation:** consider vendoring the pinned SDK into the repository or adding a controlled dependency/update process. If retaining the CDN, keep the exact version pin and review updates deliberately.

**10. HTTP response headers**

A Content Security Policy is present in HTML meta tags. Some security headers (notably HSTS, `X-Content-Type-Options`, and framing restrictions) are better delivered as HTTP response headers; meta CSP cannot express every directive such as `frame-ancestors`.

**Recommendation:** review Cloudflare response-header rules for the custom domain and preview host. This audit did not have access to the Cloudflare configuration.

**11. Supabase advisor findings**

The Supabase advisor reported:
- leaked-password protection is disabled; currently there are no password-based Auth users and Google is the only observed identity provider, so this is not an immediate exposure, but enabling it is sensible defence-in-depth;
- two overlapping permissive SELECT policies on each content table (public live reads and authenticated live/draft reads); this can be simplified by making the public policy `anon`-only and keeping authenticated access in the editor policy;
- seven unindexed foreign keys on audit-user columns and pending-invite creator; at the current data size this is not a practical performance problem, but indexes should be considered before growth;
- two indexes reported unused on `content_items`; the database is very new and has very few rows, so do not remove them based only on this observation;
- one INFO finding for `private.editor_access_invites` having RLS enabled with no policies. This appears intentional: the table is in a non-exposed schema and access is performed only through tightly scoped private functions.

## Security review

### Controls verified

- RLS is enabled on the application tables: `content_items`, `people`, `editors`, and the private access-invitation table.
- Anonymous table reads are limited to rows at `stage = 'live'`.
- Editor create/update/delete policies are limited to drafts and require an active editor record.
- Admin-only operations check the caller's active admin role inside database functions.
- Privileged implementations are in a non-exposed `private` schema; exposed public RPC wrappers run as invoker functions.
- The `private` schema is not usable by the anonymous role.
- Storage is configured as public-read for intended public media, with editor-only upload/update/delete policies, a 10 MB limit and an image MIME allow-list.
- The browser uses a Supabase publishable key; no service-role key, database password or Google OAuth client secret was found in the inspected website source files.
- Rich text is sanitized before rendering; links are restricted to HTTPS or same-origin links.
- A Content Security Policy is present on the public and admin pages.
- An active GitHub ruleset protects `main` from direct pushes by requiring pull requests, although approval requirements should be strengthened as noted above.

### Items not verifiable from this audit connection

- GitHub Actions secret values and their exact token scopes were not inspected.
- Cloudflare Access, DNS, TLS and response-header configuration were not inspected.
- Google Cloud OAuth client settings and Supabase Auth dashboard settings (including password protection and provider redirect allow-lists) were not inspected.
- A browser-based penetration test, external scanner, dependency vulnerability scan, and formal RLS test suite were not run.
- The audit does not certify the application as penetration-tested or compliant with a formal security standard.

## Branch and workflow observations

- At audit time, `DevelopSupabase` was **91 commits ahead and 1 commit behind `main`** (diverged), so a production merge is not a simple fast-forward. Reconcile and review the one production-side commit before opening a merge request.
- `DevelopSupabase` was 52 commits ahead of the older `Develop` branch. Avoid treating the two development branches as interchangeable.
- The active preview deployment workflow runs only for `DevelopSupabase`; `DevelopAudit` does not auto-deploy.
- The retained `.pages.yml` still describes a Pages CMS production action that points to `publish-production.yml`, but that workflow file is absent from the repository. This is another reason to confirm the Pages CMS integration is retired before removing the config.
- No `package.json`, lockfile, build tool, lint configuration or automated frontend test suite was found. The current site is served directly as static assets; JavaScript syntax checks and manual smoke tests are not a substitute for repeatable tests.

## Repository cleanup performed on this branch

The following files were verified as unused by the active website code and current Pages CMS content paths, and removed from `DevelopAudit` only:

- `content/events.json` and `content/posts.json`: legacy formats superseded by `content/entries.json`;
- `media/office-impact-logo.jpg`: replaced by the transparent PNG;
- `media/old_office-impact-hero.jpg`: no active references;
- `media/hibob-1.webp` and `media/hibob.webp`: duplicates not referenced by current content;
- `media/photo-2026-09-30-17-29-24-2.jpg` and `media/photo-2026-09-30-17-29-24-2.png`: unused duplicates of the active `-2-1.jpg` profile asset.

The following were deliberately retained:
- `.pages.yml`: not used by the current application or deployment workflow, but may still be read by an external Pages CMS integration. Remove only after confirming that integration is retired.
- `content/entries.json` and `content/people.json`: still used as the current static fallback.
- `media/OLD_office-impact-logo.jpg` and its logo-generation script/workflow: retained as the source for regenerating the transparent logo.
- Other legacy/duplicated event images that are still referenced by the current content payload.

## Recommended order of work

1. **Separate preview from production Supabase data.**
2. **Require at least one approval for production merges.**
3. **Add database migrations and reproducible staging setup to Git.**
4. **Remove or development-gate the stale JSON fallback.**
5. **Extract shared data normalization/sanitisation helpers and add lightweight tests.**
6. **Add publication history/rollback support and invitation expiry.**
7. **Review Cloudflare response headers, Google security settings, GitHub Actions token scope, and SDK delivery strategy.**
8. **Revisit the unused indexes and audit-column foreign-key indexes after real query usage has accumulated.**

## Recommendation

Do not rewrite the site or introduce a frontend framework solely for efficiency. Keep the static-site approach. The best next investment is separation of staging and production data, reproducible database migrations, and a small shared rendering/sanitisation layer. This delivers the largest improvements in safety and maintainability without adding unnecessary infrastructure.


---

## Addendum — 20 November 2026 cleanup on `Develop`

This addendum supersedes the earlier repository-cleanup file list and any branch/workflow references above that conflict with the current state. The original 19 November security and architecture findings are retained as a dated historical assessment.

- Created recovery branch `backup/develop-pre-cleanup-2026-11-20` before cleanup.
- Removed Pages CMS configuration `.pages.yml`, its unused static JSON snapshots, and the public-site JSON fallback. Supabase is now the only content source; failures use the existing content-unavailable UI.
- Removed legacy `show_in_calendar` / `show_in_posts` compatibility handling.
- Added `shared.js` for common escaping, text cleanup, date formatting, initials, boolean parsing, URL validation, rich-text sanitisation and content fallback helpers. Public and admin code import these helpers.
- Removed the old logo source, its image-adjustment workflow/script, unused snapshot-only images and obsolete QR variants.
- Updated the preview deployment workflow and README to use the actual `Develop` branch.
- Current repository media inventory: eight image assets remain. Five are referenced by current Supabase content and three support the active site layout (logo, hero, WhatsApp QR).
- Supabase Storage has 15 objects; two unique object paths are referenced by current people records. The remaining 13 objects were deliberately retained pending historical-asset review.
- No Supabase schema, RLS policy, authentication setting, storage object, or `main` production branch was changed.

The cleanup commit is `f9ae146a8b6f0b9c91ddedbadefc2dfe8cd7fa6a`; the follow-up documentation correction is `6326fcecb215da54a4f7967a5c17215d5d70fa42`.

The GitHub Actions preview deployment for the cleanup completed successfully on 20 November 2026. This confirms the deployment workflow completed, but it is not a substitute for manual browser testing of public and admin flows.
