# Code review and repository cleanup

**Date:** 20 November 2026  
**Repository:** `OfficeImpactCommunity/Website`  
**Working branch:** `Develop`  
**Recovery branch:** `backup/develop-pre-cleanup-2026-11-20`  
**Production:** `main` (not changed)

## Changes

- Removed Pages CMS configuration and static JSON content snapshots.
- Removed the public site's JSON fallback. Supabase is the sole content source; a Supabase read failure displays the existing content-unavailable state.
- Removed the legacy `show_in_calendar` / `show_in_posts` content-model compatibility mapping.
- Extracted common escaping, text cleanup, date formatting, initials, boolean parsing, URL validation, rich-text sanitisation and content fallback helpers to `shared.js`.
- Removed the old logo source, its image-processing script/workflow, and images only referenced by retired JSON snapshots.
- Updated README and preview workflow to match the Supabase-only content model.

## Image inventory

Kept the repository images referenced by current Supabase content or active page layout: summit post/venue images, webinar event/story images, workplace-stress post image, current transparent logo, homepage hero and WhatsApp QR.

Supabase Storage has 15 objects in `office-impact-media`. Two unique object paths are referenced by current people records. The other 13 objects are not referenced by current `content_items` or `people` records. They were left in place because they may be historical uploads.

## Review notes

- No LIGO-specific code was found in the repository search. The retired logo-processing workflow is removed; no unrelated code was labelled LIGO without evidence.
- No Supabase schema, RLS policy, authentication setting, storage object or production branch was modified.
- Common utilities were consolidated; UI-specific preview and public rendering functions remain separate to avoid coupling.
- No configured frontend test suite/build step was present. Preview deployment and manual smoke tests remain necessary before production merge.
