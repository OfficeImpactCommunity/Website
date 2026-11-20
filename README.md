# Office Impact Community website

The Office Impact Community website is a static site hosted on GitHub Pages. Supabase provides the content database, media storage and administrator sign-in.

## Architecture

- **Website:** static HTML, CSS and JavaScript on GitHub Pages.
- **Content:** Supabase stores events, stories and team profiles. The public website reads published content directly from Supabase.
- **Admin:** Google sign-in is used for the administration area. Editors manage drafts; Admins can manage access and publish content.
- **Images:** existing site images remain in the repository. New images uploaded from Admin are stored in Supabase Storage.

## Branches and publishing

- **`Develop`** is the development and review branch.
- Changes to this branch deploy automatically to the [preview website](https://officeimpactcommunity.github.io/Website-preview/).
- **`main`** is production. Preview changes should be reviewed and approved before they are merged into `main`.

Check the preview after changes to content, dates, images and layout. Drafts are not publicly visible until an Admin publishes them.

## Admin access

Open the Admin link on the website or visit `/admin/`. Sign in with an approved Google account.

Admins can grant Editor or Admin access to an email address. If the person has not signed in before, the grant remains pending until they first sign in with that same Google account. The console does not send invitation emails.

Editors can create and update drafts. Admins can publish or unpublish content and manage user access.

## Content

The content sections are Events, Stories and Team. An Event + Story record can appear in both the event calendar and the stories section. An event needs a valid date to appear in the calendar.

The calendar shows upcoming events in its date range; past events are available from the Past events view.

## Local preview

From the repository folder, run:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/`. Use a local web server rather than opening `index.html` directly.

## Content and privacy

The repository and its Git history are public. Do not commit confidential drafts, private contact details, internal notes, credentials, tokens or private event links. Only use approved images and profile information.

See [SECURITY.md](SECURITY.md) for a short overview of the safeguards and operating responsibilities.
