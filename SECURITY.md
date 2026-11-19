# Security overview

This document summarises the main safeguards and operating responsibilities for the Office Impact Community website.

## Public information

The website is hosted on GitHub Pages and its source repository is public. Treat committed files and Git history as public, including legacy content files and records not currently displayed on the site.

Do not commit passwords, API secrets, private drafts, personal contact details, internal notes or confidential event information.

## Sign-in and permissions

- Administration uses Google sign-in through Supabase Auth.
- Access is granted individually to approved Editor and Admin accounts.
- Editors can manage drafts. Publishing and access management are restricted to Admins.
- Permissions are enforced by database access controls, not by whether an Admin link is visible in the website.
- Remove or disable access promptly when it is no longer needed.

## Content and media

The public site reads published content; draft content is restricted to approved editors. Content should be reviewed before publication.

User-entered rich text is sanitised before display, external links are restricted to HTTPS, and the website applies a Content Security Policy.

Images uploaded through Admin are intended for public display. Upload only approved images and check for unnecessary photo metadata before publishing.

## Credentials and deployment

The browser uses a Supabase publishable key. Never put a Supabase secret/service key, database password, Google OAuth client secret or deployment token in website files or public commits.

Deployment credentials belong in protected GitHub Actions secrets. If a credential is exposed, revoke or rotate it promptly; removing the visible file or reverting a commit is not sufficient.

## Operational practices

- Use individual accounts rather than shared logins.
- Protect GitHub and Google accounts with strong authentication.
- Review authorised Admins and Editors periodically.
- Keep more than one trusted administrator for account recovery.
- If incorrect or malicious content is published, disable affected access, correct or revert the content, verify the redeployment and rotate any exposed credentials.
