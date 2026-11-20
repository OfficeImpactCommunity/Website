import { supabase } from "../supabase-client.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const state = {
  user: null,
  role: null,
  tab: "entries",
  entries: [],
  people: [],
  accessRows: [],
  current: null,
};

const ENTRY_FIELDS = {
  common: [
    { name: "id", label: "Internal ID", type: "text", required: true, help: "Lowercase words separated by hyphens." },
    { name: "title", label: "Default title", type: "text", required: true },
  ],
  event: [
    { name: "event_date", label: "Event date", type: "date", required: true },
    { name: "event_time", label: "Event time", type: "text", help: "For example 09:00–12:00 or 11:00 CET." },
    { name: "event_type", label: "Event type", type: "select", options: ["Summit", "Webinar", "Community meetup", "Roundtable", "Workshop", "Online event", "Other"] },
    { name: "event_summary", label: "Short event description", type: "textarea" },
    { name: "event_details", label: "Event details", type: "rich", help: "Optional. Leave blank to reuse the story description when the entry is also a story." },
    { name: "event_location", label: "Venue / city", type: "text", help: "Use Online for virtual events." },
    { name: "address", label: "Physical address", type: "text" },
    { name: "map_query", label: "Map location override", type: "text" },
    { name: "venue_image", label: "Venue image", type: "image", help: "Preferred image for an upcoming physical event." },
    { name: "event_image", label: "Event photo", type: "image", help: "Preferred photo for a past event." },
    { name: "event_image_alt", label: "Event image description", type: "text" },
    { name: "registration_url", label: "Registration / event URL", type: "url" },
  ],
  story: [
    { name: "post_title", label: "Different story headline", type: "text", help: "Leave blank to use the default title." },
    { name: "publication_date", label: "Publication date", type: "date" },
    { name: "category", label: "Story category", type: "select", options: ["Community", "Learning", "Perspective", "News", "Webinar", "Event recap"] },
    { name: "post_summary", label: "Short story introduction", type: "textarea", help: "If blank, the event short description is reused for combined entries." },
    { name: "post_body", label: "Story / recap", type: "rich", help: "If blank, event details are reused for combined entries. Basic HTML is supported." },
    { name: "post_image", label: "Story image", type: "image", help: "If blank, the venue image or event photo is reused as appropriate." },
    { name: "post_image_alt", label: "Story image description", type: "text" },
    { name: "featured_post", label: "Featured story", type: "checkbox" },
    { name: "source", label: "Source label", type: "text", help: "For example LinkedIn." },
    { name: "source_url", label: "Source URL", type: "url" },
  ],
};

const PERSON_FIELDS = [
  { name: "name", label: "Name", type: "text", required: true },
  { name: "role", label: "Role", type: "text" },
  { name: "organization", label: "Organisation", type: "text" },
  { name: "office_impact_role", label: "Role in Office Impact", type: "text" },
  { name: "bio", label: "Short bio", type: "textarea" },
  { name: "bio_long", label: "Full bio", type: "textarea" },
  { name: "linkedin_url", label: "LinkedIn URL", type: "url" },
  { name: "image", label: "Profile image", type: "image" },
  { name: "featured", label: "Featured", type: "checkbox" },
];

function escapeHtml(value = "") {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function slug(value = "") {
  return String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function notify(message, isError = false) {
  const el = $("#adminNotice");
  el.textContent = message;
  el.classList.toggle("is-error", isError);
  el.hidden = false;
}

function clearNotice() {
  $("#adminNotice").hidden = true;
}

function showView(name) {
  ["loginView", "accessView", "editorView"].forEach((id) => {
    $("#" + id).hidden = id !== name;
  });
}

function entryTitle(row) {
  const data = row.data || {};
  return data.post_title || data.title || row.content_key;
}

async function startGoogleLogin() {
  clearNotice();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.href },
  });
  if (error) notify(error.message, true);
}

async function checkAccess(user) {
  const { data, error } = await supabase
    .from("editors")
    .select("role, active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  return data?.active ? data.role : null;
}

async function loadRecords() {
  const [entriesResult, peopleResult] = await Promise.all([
    supabase.from("content_items")
      .select("id, content_key, stage, kind, data, updated_at, published_at")
      .order("updated_at", { ascending: false }),
    supabase.from("people")
      .select("id, person_key, stage, data, updated_at, published_at")
      .order("updated_at", { ascending: false }),
  ]);
  if (entriesResult.error) throw entriesResult.error;
  if (peopleResult.error) throw peopleResult.error;
  state.entries = entriesResult.data || [];
  state.people = peopleResult.data || [];
  renderList();
  renderContentPreview();
}

function currentRows() {
  if (state.tab === "entries") return state.entries;
  if (state.tab === "people") return state.people;
  return [];
}

function groupedRows() {
  const groups = new Map();
  for (const row of currentRows()) {
    const key = state.tab === "entries" ? row.content_key : row.person_key;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()].map(([key, rows]) => ({
    key,
    draft: rows.find((r) => r.stage === "draft") || null,
    live: rows.find((r) => r.stage === "live") || null,
  }));
}

function isTrue(value) {
  return value === true || value === 1 || value === "true" || value === "1";
}

function initials(name = "") {
  return String(name)
    .split(/\\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() || "")
    .join("");
}

function previewStatus(group) {
  if (group.live) {
    return {
      label: "Live on website",
      className: "live",
      note: group.draft
        ? "This item is published. The preview below shows saved draft edits; the public website continues to show the live version until you publish these changes."
        : "This is the version currently shown on the public website.",
    };
  }
  return {
    label: "Draft preview",
    className: "draft",
    note: "Not visible on the public website until published.",
  };
}

function previewStatusBadges(group) {
  const status = previewStatus(group);
  const liveBadge = group.live
    ? '<span class="admin-preview-status admin-preview-status--live">Live on website</span>'
    : "";
  const draftBadge = group.draft
    ? `<span class="admin-preview-status admin-preview-status--draft">${group.live ? "Draft edits saved" : "Draft preview"}</span>`
    : "";
  return liveBadge + draftBadge;
}

function previewDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function previewImage(value) {
  return imagePreview(value);
}

function renderEntryPreview(group, mode = "both") {
  const row = group.draft || group.live;
  const data = row?.data || {};
  const status = previewStatus(group);
  const kind = row?.kind || data.kind || "story";
  const showEvent = mode !== "story" && (kind === "event" || kind === "event_story");
  const showStory = mode !== "event" && (kind === "story" || kind === "event_story");
  const key = group.key;

  const eventMarkup = showEvent ? (() => {
    const date = previewDate(data.event_date);
    if (!date) {
      return `
        <div class="admin-preview-placeholder">
          <strong>${escapeHtml(data.title || key)}</strong>
          <span>Not on the public calendar yet — add a valid event date.</span>
        </div>`;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isPast = date < today;
    const month = new Intl.DateTimeFormat("en-GB", { month: "short" }).format(date);
    const metaParts = [data.event_type, data.event_time, data.event_location].filter(Boolean);
    if (isPast || date.getFullYear() !== today.getFullYear()) metaParts.unshift(String(date.getFullYear()));

    return `
      <div class="admin-preview-event">
        <div class="admin-preview-card__bar">
          ${previewStatusBadges(group)}
          <span class="admin-preview-card__note">${escapeHtml(status.note)}</span>
          <button class="admin-small-button" type="button" data-preview-edit-key="${escapeHtml(key)}">Edit</button>
          <button class="admin-small-button admin-preview-detail-button" type="button" data-preview-detail-key="${escapeHtml(key)}" data-preview-detail-kind="event">View details</button>
        </div>
        <article class="event-item">
          <div class="event-date"><strong>${date.getDate()}</strong><span>${escapeHtml(month)}</span></div>
          <div class="event-info">
            <h3>${escapeHtml(data.calendar_title || data.title || "Untitled event")}</h3>
            <p>${escapeHtml(metaParts.join(" · "))}</p>
          </div>
          <span class="event-open" aria-hidden="true">&nearr;</span>
        </article>
      </div>`;
  })() : "";

  const storyMarkup = showStory ? (() => {
    const dateValue = data.publication_date || data.event_date || "";
    const storyDate = previewDate(dateValue);
    const formattedDate = storyDate
      ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(storyDate)
      : "";
    const summary = data.post_summary || data.event_summary || "";
    const title = data.post_title || data.title || "Untitled story";
    const source = String(data.source || "") === "LinkedIn" ? "LinkedIn highlight" : "Community story";
    const isPast = previewDate(data.event_date) && previewDate(data.event_date) < new Date();
    const imageValue = isPast
      ? (data.post_image || data.event_image || data.venue_image)
      : (data.post_image || data.venue_image || data.event_image);
    const image = previewImage(imageValue);
    const alt = data.post_image_alt || data.event_image_alt || title;
    const featured = isTrue(data.featured_post);
    const imageClass = image ? (featured ? " story-card--with-image" : " story-card--with-thumbnail") : "";

    return `
      <article class="story-card${imageClass}">
        <div class="admin-preview-card__bar">
          ${previewStatusBadges(group)}
          <span class="admin-preview-card__note">${escapeHtml(status.note)}</span>
          <button class="admin-small-button" type="button" data-preview-edit-key="${escapeHtml(key)}">Edit</button>
          <button class="admin-small-button admin-preview-detail-button" type="button" data-preview-detail-key="${escapeHtml(key)}" data-preview-detail-kind="story">View details</button>
        </div>
        ${image && featured ? `<div class="story-card__image"><img src="${escapeHtml(image)}" alt="${escapeHtml(alt)}" loading="lazy"></div>` : ""}
        ${image && !featured ? `<div class="story-card__thumb"><img src="${escapeHtml(image)}" alt="${escapeHtml(alt)}" loading="lazy"></div>` : ""}
        <div class="story-card__body">
          <div class="story-card__meta"><span>${escapeHtml(data.category || "Update")}</span>${formattedDate ? `<span>${escapeHtml(formattedDate)}</span>` : ""}</div>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(summary || "Add a short introduction to preview the story card.")}</p>
          <div class="story-card__footer"><span>${escapeHtml(source)}</span><span>Read &rarr;</span></div>
        </div>
      </article>`;
  })() : "";

  return eventMarkup + storyMarkup;
}

function renderPeoplePreview(group) {
  const row = group.draft || group.live;
  const person = row?.data || {};
  const status = previewStatus(group);
  const image = previewImage(person.image);
  const professionalRole = [person.role, person.organization].filter(Boolean).join(" · ");
  const officeRole = String(person.office_impact_role || "").trim();
  const shortBio = String(person.bio || "").trim();

  return `
    <article class="person-card admin-preview-person">
      <div class="admin-preview-card__bar">
        ${previewStatusBadges(group)}
        <span class="admin-preview-card__note">${escapeHtml(status.note)}</span>
        <button class="admin-small-button" type="button" data-preview-edit-key="${escapeHtml(group.key)}">Edit</button>
        <button class="admin-small-button admin-preview-detail-button" type="button" data-preview-detail-key="${escapeHtml(group.key)}" data-preview-detail-kind="person">View details</button>
      </div>
      <div class="person-avatar">
        <span>${escapeHtml(initials(person.name || ""))}</span>
        ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(person.name || "")}" loading="lazy">` : ""}
      </div>
      <div class="person-copy">
        <h3>${escapeHtml(person.name || "Name not added")}</h3>
        ${professionalRole ? `<div class="role">${escapeHtml(professionalRole)}</div>` : ""}
        ${officeRole ? `<div class="office-impact-role">Office Impact · ${escapeHtml(officeRole)}</div>` : ""}
        ${shortBio ? `<p class="person-short-bio">${escapeHtml(shortBio)}</p>` : ""}
        <div class="person-actions"><span class="profile-link">View profile &rarr;</span></div>
      </div>
    </article>`;
}

function renderContentPreview() {
  const panel = $("#contentPreviewPanel");
  const container = $("#contentPreview");
  if (!panel || !container) return;

  if (state.tab === "access") {
    panel.hidden = true;
    return;
  }

  panel.hidden = false;
  const groups = groupedRows();

  if (!groups.length) {
    container.innerHTML = '<div class="admin-empty">Add your first item to see how it will appear on the website.</div>';
    return;
  }

  if (state.tab === "people") {
    container.innerHTML = `
      <div class="admin-preview-section">
        <div class="admin-preview-section__heading">
          <h3>Team page preview</h3>
          <span>Same profile-card layout as the public website</span>
        </div>
        <div class="admin-preview-people-grid">${groups.map(renderPeoplePreview).join("")}</div>
      </div>`;
    return;
  }

  const eventGroups = groups.filter((group) => {
    const row = group.draft || group.live;
    const kind = row?.kind || row?.data?.kind || "story";
    return kind === "event" || kind === "event_story";
  });
  const storyGroups = groups.filter((group) => {
    const row = group.draft || group.live;
    const kind = row?.kind || row?.data?.kind || "story";
    return kind === "story" || kind === "event_story";
  });

  const storySorted = storyGroups.sort((a, b) => {
    const aData = (a.draft || a.live)?.data || {};
    const bData = (b.draft || b.live)?.data || {};
    if (isTrue(aData.featured_post) !== isTrue(bData.featured_post)) return isTrue(aData.featured_post) ? -1 : 1;
    const aDate = aData.publication_date || aData.event_date || "";
    const bDate = bData.publication_date || bData.event_date || "";
    return String(bDate).localeCompare(String(aDate));
  });

  container.innerHTML = `
    <div class="admin-preview-section">
      <div class="admin-preview-section__heading">
        <h3>Events calendar preview</h3>
        <span>Draft versions are shown here before publication</span>
      </div>
      <div class="admin-preview-events">
        ${eventGroups.map((group) => renderEntryPreview(group, "event")).join("") || '<div class="admin-preview-placeholder">No events in this section yet.</div>'}
      </div>
    </div>
    <div class="admin-preview-section">
      <div class="admin-preview-section__heading">
        <h3>Stories section preview</h3>
        <span>The public homepage displays up to six stories</span>
      </div>
      <div class="admin-preview-stories">
        ${storySorted.slice(0, 6).map((group) => renderEntryPreview(group, "story")).join("") || '<div class="admin-preview-placeholder">No stories in this section yet.</div>'}
      </div>
    </div>`;
}


function adminDetailText(value) {
  return String(value || "").trim();
}

function adminDetailDate(value) {
  const date = previewDate(value);
  return date ? new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "long", year: "numeric"
  }).format(date) : "";
}

function adminDetailUrl(value) {
  const raw = adminDetailText(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function adminDetailRichText(value) {
  const raw = adminDetailText(value);
  if (!raw) return "";
  const parser = new DOMParser();
  const doc = parser.parseFromString("<body>" + raw + "</body>", "text/html");
  const allowed = new Set(["P","BR","STRONG","B","EM","I","UL","OL","LI","H3","H4","BLOCKQUOTE","A"]);
  const drop = new Set(["SCRIPT","STYLE","IFRAME","OBJECT","EMBED","SVG","MATH","FORM","INPUT","TEXTAREA","BUTTON"]);
  $$("*", doc.body).forEach((el) => {
    const tag = el.tagName;
    if (drop.has(tag)) { el.remove(); return; }
    if (!allowed.has(tag)) { el.replaceWith(...el.childNodes); return; }
    const href = tag === "A" ? (el.getAttribute("href") || "") : "";
    Array.from(el.attributes).forEach((attr) => el.removeAttribute(attr.name));
    if (tag === "A" && href) {
      try {
        const url = new URL(href, window.location.href);
        if (url.protocol === "https:" || url.origin === window.location.origin) {
          el.setAttribute("href", url.href);
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noopener noreferrer");
        }
      } catch { /* Invalid links remain plain text. */ }
    }
  });
  return doc.body.innerHTML;
}

function adminDetailBody(value) {
  const raw = adminDetailText(value);
  if (!raw) return "";
  if (/<[a-z][\s\S]*>/i.test(raw)) return adminDetailRichText(raw);
  return "<p>" + escapeHtml(raw) + "</p>";
}

function adminFirstDetailContent(values) {
  for (const value of values) {
    const raw = adminDetailText(value);
    if (!raw) continue;
    const visible = raw.replace(/&nbsp;|&#160;|&#xA0;/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "").replace(/<[^>]*>/g, "").trim();
    if (visible) return raw;
  }
  return "";
}

function adminDetailImage(value, alt, extraClass) {
  const src = imagePreview(value);
  if (!src) return "";
  return '<figure class="story-dialog__image ' + (extraClass || "") + '">' +
    '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(alt || "") + '">' +
    '</figure>';
}

function adminDetailLocation(data, title, online, past) {
  if (online || past) return "";
  const venue = adminDetailText(data.event_location);
  const address = adminDetailText(data.address);
  const venueImage = imagePreview(data.venue_image);
  const panels = [];
  if (venue || address) {
    panels.push('<div class="event-location__panel event-location__details">' +
      '<span class="event-location__label">Location</span>' +
      (venue ? '<strong>' + escapeHtml(venue) + '</strong>' : '') +
      (address ? '<p>' + escapeHtml(address) + '</p>' : '') + '</div>');
  }
  if (venueImage) {
    panels.push('<figure class="event-location__panel event-location__image">' +
      '<img src="' + escapeHtml(venueImage) + '" alt="' + escapeHtml(venue || title) + ' venue" loading="lazy">' +
      '</figure>');
  }
  const query = adminDetailText(data.map_query) || address;
  if (query) {
    const mapUrl = "https://www.google.com/maps?q=" + encodeURIComponent(query) + "&output=embed";
    panels.push('<div class="event-location__panel event-location__map">' +
      '<iframe src="' + escapeHtml(mapUrl) + '" title="Map for ' + escapeHtml(title) +
      '" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe></div>');
  }
  if (!panels.length) return "";
  return '<div class="event-location event-location--' + Math.min(3, panels.length) + '">' +
    panels.join("") + '</div>';
}

function openAdminPreviewDialog(content, status) {
  const dialog = $("#adminPreviewDialog");
  const target = $("#adminPreviewDialogContent");
  if (!dialog || !target) {
    notify("The detail preview could not be opened.", true);
    return;
  }
  target.innerHTML =
    '<div class="admin-detail-status">' +
      '<span class="admin-preview-status admin-preview-status--' + status.className + '">' +
        escapeHtml(status.label) + '</span>' +
      '<span>' + escapeHtml(status.note) + '</span>' +
    '</div>' + content;
  if (typeof dialog.showModal === "function") dialog.showModal();
  $$("img", target).forEach((img) => img.addEventListener("error", () => {
    const figure = img.closest(".story-dialog__image");
    if (figure) figure.remove();
    else img.remove();
  }, { once: true }));
}

function openPreviewEntryDetail(key, mode) {
  const group = groupedRows().find((item) => item.key === key);
  const row = group && (group.draft || group.live);
  if (!row) return;
  const data = Object.assign({}, row.data || {}, {
    id: key,
    kind: row.kind || (row.data && row.data.kind) || "story"
  });
  const status = previewStatus(group);
  const eventDate = previewDate(data.event_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const past = Boolean(eventDate && eventDate < today);
  const online = /\b(online|virtual|remote|zoom|microsoft teams|google meet)\b/i.test(
    (data.event_location || "") + " " + (data.event_type || "")
  );
  const registration = adminDetailUrl(data.registration_url);
  const source = adminDetailUrl(data.source_url);
  const eventMeta = [
    adminDetailDate(data.event_date),
    adminDetailText(data.event_time),
    online ? "" : adminDetailText(data.event_location)
  ].filter(Boolean).join(" · ");

  const isStory = mode === "story";
  const title = isStory
    ? (adminDetailText(data.post_title) || adminDetailText(data.title) || "Untitled story")
    : (adminDetailText(data.calendar_title) || adminDetailText(data.title) || "Untitled event");
  const bodyValue = isStory
    ? adminFirstDetailContent([data.post_body, data.event_details, data.post_summary, data.event_summary])
    : (past
      ? adminFirstDetailContent([data.post_body, data.event_details, data.post_summary, data.event_summary])
      : adminFirstDetailContent([data.event_details, data.event_summary, data.post_body, data.post_summary]));
  const body = adminDetailBody(bodyValue);
  const imageValue = isStory
    ? (past
      ? adminFirstDetailContent([data.post_image, data.event_image, data.venue_image])
      : adminFirstDetailContent([data.post_image, data.venue_image, data.event_image]))
    : (past
      ? adminFirstDetailContent([data.event_image, data.post_image, data.venue_image])
      : (online
        ? adminFirstDetailContent([data.post_image, data.event_image])
        : adminFirstDetailContent([data.venue_image, data.post_image, data.event_image])));
  const alt = isStory
    ? (data.post_image_alt || data.event_image_alt || title)
    : (data.event_image_alt || data.post_image_alt || title);
  const hasVenueImage = !online && Boolean(imagePreview(data.venue_image));
  const imageBlock = isStory
    ? adminDetailImage(imageValue, alt, "")
    : ((past || !hasVenueImage) ? adminDetailImage(imageValue, alt, "entry-event-photo") : "");

  let eventInfo = "";
  if (isStory && eventDate) {
    eventInfo = '<div class="entry-event-info">' +
      '<span class="entry-event-info__label">' + (past ? "Past event" : "Upcoming event") + '</span>' +
      '<strong>' + escapeHtml(data.calendar_title || data.title || "") + '</strong>' +
      (eventMeta ? '<p>' + escapeHtml(eventMeta) + '</p>' : '') +
      '</div>';
  } else if (!isStory && online) {
    eventInfo = '<div class="dialog-online-line"><strong>Online</strong>' +
      (eventMeta ? '<span>' + escapeHtml(eventMeta) + '</span>' : '') +
      (!past && registration ? '<a href="' + escapeHtml(registration) +
        '" target="_blank" rel="noopener noreferrer">Register here &nearr;</a>' : '') +
      '</div>';
  }

  const location = adminDetailLocation(data, title, online, past);
  let content = '<div class="dialog-body">' +
    '<span class="section-kicker">' + escapeHtml(isStory ? (data.category || "Story") : (data.event_type || "Community event")) + '</span>' +
    '<h2>' + escapeHtml(title) + '</h2>';

  if (isStory) {
    const postDate = adminDetailDate(data.publication_date || data.event_date);
    content += (postDate || data.source)
      ? '<div class="dialog-meta">' + (postDate ? '<span>' + escapeHtml(postDate) + '</span>' : '') +
        (data.source ? '<span>· ' + escapeHtml(data.source) + '</span>' : '') + '</div>'
      : '';
  } else {
    content += eventMeta ? '<div class="dialog-meta"><span>' + escapeHtml(eventMeta) + '</span></div>' : '';
  }

  content += imageBlock + eventInfo + (body ? '<div class="dialog-copy">' + body + '</div>' : '') + location;

  if (!past && registration && (!online || isStory)) {
    content += '<a class="dialog-source" href="' + escapeHtml(registration) +
      '" target="_blank" rel="noopener noreferrer">Event details / registration &nearr;</a>';
  }
  if (source) {
    content += '<a class="dialog-source" href="' + escapeHtml(source) +
      '" target="_blank" rel="noopener noreferrer">View original ' +
      escapeHtml(data.source || "source") + ' &nearr;</a>';
  }
  content += '</div>';
  openAdminPreviewDialog(content, status);
}

function openPreviewPersonDetail(key) {
  const group = groupedRows().find((item) => item.key === key);
  const row = group && (group.draft || group.live);
  if (!row) return;
  const person = row.data || {};
  const status = previewStatus(group);
  const image = imagePreview(person.image);
  const role = [person.role, person.organization].filter(Boolean).join(" · ");
  const officeRole = adminDetailText(person.office_impact_role);
  const bio = adminDetailText(person.bio_long) || adminDetailText(person.bio);
  const linkedin = adminDetailUrl(person.linkedin_url);
  const content = '<div class="dialog-body person-dialog">' +
    '<div class="person-dialog__header">' +
      '<div class="person-dialog__avatar"><span>' + escapeHtml(initials(person.name || "")) + '</span>' +
      (image ? '<img src="' + escapeHtml(image) + '" alt="' + escapeHtml(person.name || "") + '">' : '') +
      '</div><div><span class="section-kicker">Community profile</span>' +
      '<h2>' + escapeHtml(person.name || "Name not added") + '</h2>' +
      (role ? '<div class="dialog-meta"><span>' + escapeHtml(role) + '</span></div>' : '') +
      (officeRole ? '<div class="person-dialog__office-role"><span>Office Impact</span><strong>' +
        escapeHtml(officeRole) + '</strong></div>' : '') +
      '</div></div>' +
    '<div class="dialog-copy person-dialog__bio">' +
      (bio ? '<p>' + escapeHtml(bio) + '</p>' : '<p>Profile details will be added soon.</p>') +
    '</div>' +
    (linkedin ? '<a class="dialog-source" href="' + escapeHtml(linkedin) +
      '" target="_blank" rel="noopener noreferrer">View LinkedIn profile &nearr;</a>' : '') +
    '</div>';
  openAdminPreviewDialog(content, status);
}

function setupAdminPreviewDialog() {
  const dialog = $("#adminPreviewDialog");
  const close = $("#adminPreviewDialogClose");
  if (!dialog || !close) return;
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}

function renderList() {
  const container = $("#recordList");
  const groups = groupedRows();
  $("#listCount").textContent = String(groups.length);
  if (!groups.length) {
    container.innerHTML = '<div class="admin-empty">No items yet. Create your first draft.</div>';
    return;
  }
  container.innerHTML = groups.map((group) => {
    const row = group.draft || group.live;
    const title = state.tab === "entries" ? entryTitle(row) : (row.data?.name || group.key);
    const kind = state.tab === "entries" ? (row.kind || "story").replace("_", " + ") : "Team";
    const statusMarkup = group.live
      ? `<span class="admin-status admin-status--live">Live</span>${group.draft ? '<span class="admin-status admin-status--draft">Draft edits</span>' : ""}`
      : '<span class="admin-status admin-status--draft">Draft</span>';
    return `
      <article class="admin-record">
        <div class="admin-record__copy">
          <span class="admin-record__kind">${escapeHtml(kind)}</span>
          <strong>${escapeHtml(title)}</strong>
          <span class="admin-record__key">${escapeHtml(group.key)}</span>
        </div>
        <div class="admin-record__actions">
          <div class="admin-record__statuses" aria-label="${group.live ? (group.draft ? "Published live, with unpublished draft edits" : "Published live") : "Draft, not published"}">
            ${statusMarkup}
          </div>
          <button class="admin-small-button" type="button" data-edit-key="${escapeHtml(group.key)}">Edit</button>
        </div>
      </article>`;
  }).join("");
  renderContentPreview();
}

function fieldValue(data, field) {
  const value = data?.[field.name];
  return field.type === "checkbox" ? Boolean(value) : (value ?? "");
}

function imagePreview(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https:\/\//i.test(raw)) return raw;
  if (raw.startsWith("media/")) return "../" + raw;
  if (raw.startsWith("../")) return raw;
  return "../media/" + raw.replace(/^\//, "");
}

function renderField(field, data) {
  const value = fieldValue(data, field);
  const id = "field-" + field.name;
  const help = field.help ? `<small>${escapeHtml(field.help)}</small>` : "";
  if (field.type === "checkbox") {
    return `
      <label class="admin-field admin-field--check" for="${id}">
        <input id="${id}" name="${field.name}" type="checkbox" ${value ? "checked" : ""}>
        <span>${escapeHtml(field.label)}</span>
      </label>`;
  }
  if (field.type === "image") {
    const preview = imagePreview(value);
    return `
      <div class="admin-field admin-field--wide">
        <label for="${id}">${escapeHtml(field.label)}</label>
        <input type="hidden" name="${field.name}" value="${escapeHtml(value)}">
        <div class="admin-image-row">
          <div class="admin-image-preview">${preview ? `<img src="${escapeHtml(preview)}" alt="">` : '<span>No image selected</span>'}</div>
          <div class="admin-image-input">
            <input id="${id}" type="file" accept="image/jpeg,image/png,image/webp" data-upload-field="${field.name}">
            <button class="admin-image-remove" type="button" data-remove-image="${field.name}" aria-label="Remove photo" title="Remove photo" ${value ? "" : "hidden"}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5" />
              </svg>
              <span>Remove photo</span>
            </button>
            <small>JPG, PNG or WebP · up to 10 MB</small>
            <span class="admin-upload-status" data-upload-status="${field.name}"></span>
          </div>
        </div>
        ${help}
      </div>`;
  }
  if (field.type === "select") {
    const options = (field.options || []).map((option) =>
      `<option value="${escapeHtml(option)}" ${value === option ? "selected" : ""}>${escapeHtml(option)}</option>`
    ).join("");
    return `
      <div class="admin-field">
        <label for="${id}">${escapeHtml(field.label)}${field.required ? " *" : ""}</label>
        <select id="${id}" name="${field.name}" ${field.required ? "required" : ""}>
          <option value="">Select…</option>${options}
        </select>${help}
      </div>`;
  }
  const multiline = field.type === "textarea" || field.type === "rich";
  const input = multiline
    ? `<textarea id="${id}" name="${field.name}" rows="${field.type === "rich" ? 9 : 3}" ${field.required ? "required" : ""}>${escapeHtml(value)}</textarea>`
    : `<input id="${id}" name="${field.name}" type="${field.type}" value="${escapeHtml(value)}" ${field.required ? "required" : ""}>`;
  return `
    <div class="admin-field ${field.type === "rich" || field.type === "textarea" ? "admin-field--wide" : ""}">
      <label for="${id}">${escapeHtml(field.label)}${field.required ? " *" : ""}</label>
      ${input}${help}
    </div>`;
}

function fieldsForCurrent() {
  if (state.current.table === "people") return PERSON_FIELDS;
  const kind = state.current.kind || "event_story";
  const fields = [...ENTRY_FIELDS.common];
  if (kind === "event" || kind === "event_story") fields.push(...ENTRY_FIELDS.event);
  if (kind === "story" || kind === "event_story") fields.push(...ENTRY_FIELDS.story);
  return fields;
}

function renderForm() {
  const current = state.current;
  if (!current) return;
  const isNew = current.isNew;
  $("#editorTitle").textContent = isNew ? "New " + (current.table === "people" ? "team member" : current.kind.replace("_", " + ")) : "Edit " + (current.table === "people" ? current.data.name : entryTitle({data:current.data, content_key:current.key}));
  $("#editorMeta").textContent = isNew ? "New draft · not visible on the public website" : `${current.key} · ${current.draftExists ? "Draft exists" : "Editing live version — save to create a draft"}`;
  $("#kindControl").hidden = current.table !== "entries" || !current.isNew;
  $("#contentKind").value = current.kind || "event_story";
  $("#kindControl").onchange = () => {
    current.kind = $("#contentKind").value;
    renderForm();
  };
  const fields = fieldsForCurrent();
  $("#editorFields").innerHTML = fields.map((field) => renderField(field, current.data)).join("");
  $("#deleteDraft").hidden = !current.draftExists;
  $("#publishDraft").hidden = state.role !== "admin";
  $("#unpublishLive").hidden = state.role !== "admin" || !current.liveExists;
  $("#saveDraft").textContent = "Save draft";
  $("#editorPanel").hidden = false;
  $("#editorPanel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function newEntry(kind) {
  state.current = {
    table: "entries", key: "", kind, isNew: true, draftExists: false, liveExists: false,
    data: { kind, published: true, featured_post: false },
  };
  renderForm();
}

function newPerson() {
  state.current = {
    table: "people", key: "", kind: null, isNew: true, draftExists: false, liveExists: false,
    data: { published: true, featured: false },
  };
  renderForm();
}

function openExisting(key) {
  const rows = currentRows().filter((row) =>
    (state.tab === "entries" ? row.content_key : row.person_key) === key
  );
  const draft = rows.find((row) => row.stage === "draft");
  const live = rows.find((row) => row.stage === "live");
  const source = draft || live;
  if (!source) return;
  state.current = {
    table: state.tab,
    key,
    kind: source.kind || "event_story",
    isNew: false,
    draftExists: Boolean(draft),
    liveExists: Boolean(live),
    data: { ...(source.data || {}) },
  };
  renderForm();
}

function collectFormData() {
  const formData = new FormData($("#contentForm"));
  const data = { ...state.current.data };
  for (const [key, value] of formData.entries()) {
    if (key !== "id" || state.current.table === "entries") data[key] = value;
  }
  $$('input[type="checkbox"][name]', $("#contentForm")).forEach((input) => {
    data[input.name] = input.checked;
  });
  if (state.current.table === "entries") {
    data.id = state.current.key || slug(formData.get("id"));
    data.kind = state.current.kind;
    data.published = true;
  } else {
    data.published = true;
    data.id = state.current.key || slug(data.name);
  }
  return data;
}

async function saveDraft() {
  clearNotice();
  const data = collectFormData();
  const key = state.current.table === "entries" ? data.id : (state.current.key || slug(data.name));
  if (!key || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) {
    notify("Please use a valid ID: lowercase letters, numbers and hyphens.", true);
    return false;
  }
  if (state.current.table === "people" && !data.name?.trim()) {
    notify("Please enter a name.", true);
    return false;
  }
  if (state.current.table === "entries" && !data.title?.trim()) {
    notify("Please enter a title.", true);
    return false;
  }

  $("#saveDraft").disabled = true;
  $("#saveDraft").textContent = "Saving…";
  try {
    let result;
    if (state.current.table === "entries") {
      result = await supabase.from("content_items").upsert({
        content_key: key,
        stage: "draft",
        kind: state.current.kind,
        data,
        updated_by: state.user.id,
      }, { onConflict: "content_key,stage" });
    } else {
      result = await supabase.from("people").upsert({
        person_key: key,
        stage: "draft",
        data,
        updated_by: state.user.id,
      }, { onConflict: "person_key,stage" });
    }
    if (result.error) throw result.error;
    state.current.key = key;
    state.current.data = data;
    state.current.isNew = false;
    state.current.draftExists = true;
    notify("Draft saved.");
    await loadRecords();
    renderForm();
    return true;
  } catch (error) {
    notify(error.message || "Could not save the draft.", true);
    return false;
  } finally {
    $("#saveDraft").disabled = false;
    $("#saveDraft").textContent = "Save draft";
  }
}

async function publishCurrent() {
  if (state.role !== "admin") return notify("Only administrators can publish.", true);
  const saved = await saveDraft();
  if (!saved) return;
  const current = state.current;
  const rpc = current.table === "entries" ? "publish_content" : "publish_person";
  const arg = current.table === "entries" ? { p_content_key: current.key } : { p_person_key: current.key };
  const { error } = await supabase.rpc(rpc, arg);
  if (error) return notify(error.message, true);
  notify("Published to the live website.");
  await loadRecords();
  openExisting(current.key);
}

async function unpublishCurrent() {
  if (state.role !== "admin" || !state.current?.liveExists) return;
  const current = state.current;
  if (!confirm("Remove this item from the public website? The draft will be kept.")) return;
  const rpc = current.table === "entries" ? "unpublish_content" : "unpublish_person";
  const arg = current.table === "entries" ? { p_content_key: current.key } : { p_person_key: current.key };
  const { error } = await supabase.rpc(rpc, arg);
  if (error) return notify(error.message, true);
  notify("Removed from the live website. The draft has been kept.");
  await loadRecords();
  openExisting(current.key);
}

async function deleteDraft() {
  const current = state.current;
  if (!current?.draftExists || !confirm("Delete this draft? This cannot be undone.")) return;
  const response = current.table === "entries"
    ? await supabase.from("content_items").delete().eq("content_key", current.key).eq("stage", "draft")
    : await supabase.from("people").delete().eq("person_key", current.key).eq("stage", "draft");
  if (response.error) return notify(response.error.message, true);
  $("#editorPanel").hidden = true;
  state.current = null;
  notify("Draft deleted.");
  await loadRecords();
}

function removeImage(button) {
  const name = button.dataset.removeImage;
  const field = button.closest(".admin-field");
  if (!field || !name) return;

  const hidden = field.querySelector(`input[type="hidden"][name="${CSS.escape(name)}"]`);
  const fileInput = field.querySelector(`[data-upload-field="${CSS.escape(name)}"]`);
  const preview = field.querySelector(".admin-image-preview");
  const status = field.querySelector(`[data-upload-status="${CSS.escape(name)}"]`);
  if (!hidden || !preview) return;

  hidden.value = "";
  if (fileInput) fileInput.value = "";
  preview.innerHTML = '<span>No image selected</span>';
  button.hidden = true;
  if (status) status.textContent = "Photo removed — save draft to apply.";
}

async function uploadImage(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    notify("Please choose a JPG, PNG or WebP image.", true);
    input.value = "";
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    notify("The image must be 10 MB or smaller.", true);
    input.value = "";
    return;
  }
  const name = input.dataset.uploadField;
  const status = $(`[data-upload-status="${name}"]`);
  status.textContent = "Uploading…";
  try {
    const key = state.current.key || slug($("#contentForm").elements.id?.value || $("#contentForm").elements.name?.value || "new-item");
    const path = `${state.current.table}/${key}/${Date.now()}-${slug(file.name.replace(/\.[^.]+$/, "")) || "image"}.${file.name.split(".").pop().toLowerCase()}`;
    const { error } = await supabase.storage.from("office-impact-media").upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: "3600",
    });
    if (error) throw error;
    const { data } = supabase.storage.from("office-impact-media").getPublicUrl(path);
    const hidden = $(`input[type="hidden"][name="${name}"]`);
    hidden.value = data.publicUrl;
    const preview = hidden.closest(".admin-field").querySelector(".admin-image-preview");
    preview.innerHTML = `<img src="${escapeHtml(data.publicUrl)}" alt="">`;
    const removeButton = hidden.closest(".admin-field").querySelector("[data-remove-image]");
    if (removeButton) removeButton.hidden = false;
    status.textContent = "Uploaded";
  } catch (error) {
    status.textContent = "";
    notify(error.message || "Image upload failed.", true);
  }
}

async function loadEditorAccess() {
  const { data, error } = await supabase.rpc("admin_list_editor_access");
  if (error) throw error;
  state.accessRows = Array.isArray(data) ? data : [];
  renderEditorAccess();
}

function renderEditorAccess() {
  const container = $("#editorAccessList");
  if (!state.accessRows.length) {
    container.innerHTML = '<div class="admin-empty">No Editor or Admin accounts have been added yet.</div>';
    return;
  }

  const ownEmail = String(state.user?.email || "").toLowerCase();
  container.innerHTML = state.accessRows.map((row) => {
    const email = String(row.email || "");
    const isSelf = email.toLowerCase() === ownEmail;
    const status = row.status || (row.active ? "active" : "disabled");
    const statusLabel = status === "pending"
      ? "Pending first Google sign-in"
      : status === "disabled"
        ? "Disabled"
        : "Active";
    const statusClass = status === "pending" ? "pending" : status;
    return `
      <article class="admin-access-row">
        <div class="admin-access-person">
          <strong>${escapeHtml(email)}</strong>
          <span class="admin-status admin-status--${escapeHtml(statusClass)}">${escapeHtml(statusLabel)}</span>
          ${isSelf ? '<span class="admin-access-you">You</span>' : ""}
        </div>
        <div class="admin-access-actions">
          <select aria-label="Role for ${escapeHtml(email)}" data-access-role="${escapeHtml(email)}" ${isSelf ? "disabled" : ""}>
            <option value="editor" ${row.role === "editor" ? "selected" : ""}>Editor</option>
            <option value="admin" ${row.role === "admin" ? "selected" : ""}>Admin</option>
          </select>
          <button class="admin-small-button" type="button" data-access-save="${escapeHtml(email)}" ${isSelf ? "disabled" : ""}>Update role</button>
          <button class="admin-danger-button" type="button" data-access-remove="${escapeHtml(email)}" ${isSelf ? "disabled" : ""}>Remove access</button>
        </div>
      </article>`;
  }).join("");
}

async function grantEditorAccess(email, role) {
  const { data, error } = await supabase.rpc("admin_grant_editor_access", {
    p_email: email,
    p_role: role,
  });
  if (error) throw error;

  if (data?.status === "pending") {
    notify(`Access reserved for ${email}. They must sign in with Google using this exact email address.`);
  } else {
    notify(`${email} now has active ${role} access.`);
  }
  await loadEditorAccess();
}

async function revokeEditorAccess(email) {
  if (String(email).toLowerCase() === String(state.user?.email || "").toLowerCase()) {
    notify("You cannot remove your own access from this screen.", true);
    return;
  }
  if (!confirm(`Remove Office Impact administration access for ${email}? They will no longer be able to edit or publish content.`)) return;

  const { error } = await supabase.rpc("admin_revoke_editor_access", { p_email: email });
  if (error) throw error;
  notify(`Access removed for ${email}.`);
  await loadEditorAccess();
}

async function activate(user) {
  state.user = user;
  $("#signedInEmail").textContent = user.email || "";

  let role = null;
  try {
    role = await checkAccess(user);
  } catch (error) {
    state.role = null;
    $("#accessEmail").textContent = user.email || "Unknown Google account";
    $("#accessMessage").textContent = "We could not verify your access right now. Please refresh the page. If the issue continues, contact an Office Impact administrator.";
    showView("accessView");
    notify("Access verification failed: " + error.message, true);
    return;
  }

  state.role = role || null;
  const accessTab = $("#accessTab");
  if (accessTab) accessTab.hidden = role !== "admin";

  if (!role) {
    $("#accessEmail").textContent = user.email || "Unknown Google account";
    $("#accessMessage").textContent = `The Google account ${user.email || "you are using"} is not currently authorised to use the administration console. Ask an Office Impact administrator to add this exact email as an Editor or Admin, then sign out and sign in again.`;
    showView("accessView");
    return;
  }

  $("#roleLabel").textContent = role === "admin" ? "Administrator" : "Editor";
  showView("editorView");

  try {
    await loadRecords();
  } catch (error) {
    // Keep the verified role and editor interface visible: this is a content
    // loading problem, not an authentication or authorisation failure.
    notify("You are signed in, but the content could not be loaded: " + error.message, true);
  }
}

async function init() {
  setupAdminPreviewDialog();
  $("#googleSignIn").addEventListener("click", startGoogleLogin);
  $("#signOutAccess").addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.reload();
  });
  // This control was added in the latest admin page. Keep it optional so a cached
  // older HTML document cannot prevent the Google sign-in flow from starting.
  const retryAccessButton = $("#retryAccess");
  if (retryAccessButton) {
    retryAccessButton.addEventListener("click", async () => {
      retryAccessButton.disabled = true;
      retryAccessButton.textContent = "Checking…";
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        if (data?.user) await activate(data.user);
        else showView("loginView");
      } catch (error) {
        notify("Could not check access: " + error.message, true);
      } finally {
        retryAccessButton.disabled = false;
        retryAccessButton.textContent = "Check access again";
      }
    });
  }

  $("#signOutEditor").addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.reload();
  });
  $("#newEntry").addEventListener("click", () => newEntry("event_story"));
  $("#newEvent").addEventListener("click", () => newEntry("event"));
  $("#newStory").addEventListener("click", () => newEntry("story"));
  $("#newPerson").addEventListener("click", newPerson);
  $("#saveDraft").addEventListener("click", saveDraft);
  $("#publishDraft").addEventListener("click", publishCurrent);
  $("#unpublishLive").addEventListener("click", unpublishCurrent);
  $("#deleteDraft").addEventListener("click", deleteDraft);
  $("#cancelEdit").addEventListener("click", () => {
    state.current = null;
    $("#editorPanel").hidden = true;
    clearNotice();
  });
  $$(".admin-tab").forEach((tab) => tab.addEventListener("click", async () => {
    state.tab = tab.dataset.tab;
    $$(".admin-tab").forEach((item) => item.classList.toggle("is-active", item === tab));

    const showingAccess = state.tab === "access";
    const contentHeading = $("#contentHeading");
    const recordList = $("#recordList");
    const userAccessPanel = $("#userAccessPanel");
    const contentPreviewPanel = $("#contentPreviewPanel");
    if (contentHeading) contentHeading.hidden = showingAccess;
    if (recordList) recordList.hidden = showingAccess;
    if (contentPreviewPanel) contentPreviewPanel.hidden = showingAccess;
    if (userAccessPanel) userAccessPanel.hidden = !showingAccess;
    $("#newEntryActions").hidden = state.tab !== "entries";
    $("#newPersonActions").hidden = state.tab !== "people";
    $("#editorPanel").hidden = true;
    state.current = null;

    if (showingAccess) {
      try {
        await loadEditorAccess();
        clearNotice();
      } catch (error) {
        notify("Could not load user access: " + error.message, true);
      }
    } else {
      renderList();
      renderContentPreview();
    }
  }));
  $("#editorAccessForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = $("#accessGrantEmail").value.trim().toLowerCase();
    const role = $("#accessGrantRole").value;
    if (!email) return;

    const button = $("#grantAccessButton");
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      await grantEditorAccess(email, role);
      $("#editorAccessForm").reset();
    } catch (error) {
      notify(error.message || "Could not grant access.", true);
    } finally {
      button.disabled = false;
      button.textContent = "Grant access";
    }
  });
  $("#refreshAccessList").addEventListener("click", async () => {
    try {
      await loadEditorAccess();
      notify("User access list refreshed.");
    } catch (error) {
      notify(error.message, true);
    }
  });
  $("#editorAccessList").addEventListener("click", async (event) => {
    const saveButton = event.target.closest("[data-access-save]");
    const removeButton = event.target.closest("[data-access-remove]");

    if (saveButton) {
      const email = saveButton.dataset.accessSave;
      const role = $(`[data-access-role="${CSS.escape(email)}"]`).value;
      saveButton.disabled = true;
      try {
        await grantEditorAccess(email, role);
      } catch (error) {
        notify(error.message || "Could not update the role.", true);
      } finally {
        saveButton.disabled = false;
      }
    }

    if (removeButton) {
      try {
        await revokeEditorAccess(removeButton.dataset.accessRemove);
      } catch (error) {
        notify(error.message || "Could not remove access.", true);
      }
    }
  });
  $("#recordList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-key]");
    if (button) openExisting(button.dataset.editKey);
  });
  $("#contentPreview").addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-preview-edit-key]");
    if (editButton) {
      openExisting(editButton.dataset.previewEditKey);
      return;
    }
    const detailButton = event.target.closest("[data-preview-detail-key]");
    if (!detailButton) return;
    const key = detailButton.dataset.previewDetailKey;
    const kind = detailButton.dataset.previewDetailKind;
    try {
      if (kind === "person") openPreviewPersonDetail(key);
      else openPreviewEntryDetail(key, kind === "story" ? "story" : "event");
    } catch (error) {
      console.error("Content detail preview failed:", error);
      notify("Could not open this detail preview: " + (error?.message || "Unknown error"), true);
    }
  });
  $("#contentForm").addEventListener("submit", (event) => event.preventDefault());
  $("#editorFields").addEventListener("change", (event) => {
    const input = event.target.closest("[data-upload-field]");
    if (input) uploadImage(input);
  });
  $("#editorFields").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-image]");
    if (button) removeImage(button);
  });

  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) await activate(session.user);
  else showView("loginView");

  supabase.auth.onAuthStateChange((event, sessionNow) => {
    if (event === "SIGNED_IN" && sessionNow?.user) {
      setTimeout(() => activate(sessionNow.user), 0);
    } else if (event === "SIGNED_OUT") {
      state.user = null;
      state.role = null;
      showView("loginView");
    }
  });
}

init().catch((error) => {
  console.error(error);
  notify(error.message || "Admin interface could not be loaded.", true);
});
