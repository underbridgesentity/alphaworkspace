# Store copy: what to paste where, with character counts

One field per file, so you can open a file, select all, and paste. No file has a
trailing newline, so the counts below are exact.

Re-count any file you edit:

```
cd /Users/josephmbedzi/alphaworkspace/store/listing
for f in *.txt; do printf "%-42s %5d\n" "$f" "$(wc -m < "$f" | tr -d ' ')"; done
```

---

## Google Play

Play Console > Grow users > Store presence > **Store listing**

| Field | File | Count | Limit |
|---|---|---|---|
| App name | `google-play-title.txt` | **15** | 30 |
| Short description | `google-play-short-description.txt` | **72** | 80 |
| Full description | `google-play-full-description.txt` | **3271** | 4000 |

Contact details, category, tags, the privacy policy URL and the deletion URL are
in `google-play-contact-and-metadata.txt`.

## Apple

App Store Connect > your app > **App Information** and the version page

| Field | File | Count | Limit |
|---|---|---|---|
| App name | `apple-name.txt` | **15** | 30 |
| Subtitle | `apple-subtitle.txt` | **24** | 30 |
| Promotional text | `apple-promotional-text.txt` | **151** | 170 |
| Description | `apple-description.txt` | **3204** | 4000 |
| Keywords | `apple-keywords.txt` | **96** | 100 |

Support URL, Marketing URL, Privacy Policy URL, copyright, categories and the
age-rating guidance are in `apple-urls-and-contact.txt`.

Promotional text can be changed **without submitting a new build**, so it is the
right place for anything seasonal. The description cannot.

The keywords are single words, comma separated, no spaces. Apple builds phrases
by combining terms across the app name, the subtitle and this field, so
`project,management` covers "project management" in one character less than the
phrase would take, and `workspace` is omitted because it is already in the app
name.

---

## The four rules this copy obeys

**1. No commerce, anywhere.** Neither description mentions a price, a plan name,
a tier, a trial, an upgrade, or the pricing page. The word "free" does not appear
at all, including "free to download", which is allowed but buys nothing and costs
a conversation. Apple's 3.1.3(f) forbids both a purchase surface in the binary
**and** a call to action to buy outside it, and metadata is where the second one
usually slips in. Play's ZA storefront requires Play Billing for any in-app
purchase surface, so the same discipline applies. The reasoning behind the
commerce-free shell is in `capacitor.config.ts` and `src/lib/shell.ts`.

The Marketing URL is the site root, which does have a Pricing page in its
navigation. That is fine: the constraint is about the app, not about the
existence of a website that sells the service. Just never put the pricing URL in
a listing field.

**2. No em dashes.** Binding, per `AGENTS.md`. Also no en dashes and no curly
quotes, so the text survives being pasted into a console text box. Check with:

```
grep -n $'—\|–\|‘\|’\|“\|”' store/listing/*.txt
```

**3. Nothing invented.** No testimonials, no awards, no user counts, no "trusted
by" anything, no performance claims that are not in the code. Every feature
sentence maps to something real:

| Claim | Where it comes from |
|---|---|
| morning nudges, batched one per person | `src/server/jobs/morning.ts`, `src/server/notifications/` |
| the brief lands at 06:00, weekly write-up by 06:30 Monday | `vercel.json` crons at `0 4 * * *` and `30 4 * * 1`. Vercel crons are UTC and SAST is UTC+2, so that is 06:00 daily and 06:30 on Monday. Neither job applies its own offset (`src/server/jobs/morning.ts`). **Flagged:** the marketing page says "Morning briefs at 06:30" (`src/components/marketing/sections/built-for-here.tsx`) and the nudge mock-ups are stamped 06:30 (`src/components/marketing/sections/following-up.tsx`). One of the two is wrong, and the schedule is the source of truth. The listings here say 06:00; somebody should decide whether to move the cron or the marketing copy. |
| voice capture proposes, a person confirms | `src/server/ai/extraction.ts`, and the product rule in `AGENTS.md` |
| coloured due-date rails instead of a status column | `src/components/app/task-row.tsx` |
| a private list invisible to admins | `private_tasks`, `src/server/db/schema.ts:449-475` |
| meeting transcript, speakers separated, action items | `src/server/ai/transcribe.ts` diarisation, `src/server/ai/meeting-summary.ts` |
| recordings private until shared | `meetings.visibility` defaults to `private`, `src/server/dal/meetings.ts:99-105` |
| writes queue offline and land later | `public/sw.js` and the `idb-keyval` outbox |
| export or delete from Account settings | `src/app/account/page.tsx:304-341` |
| no ads, no advertising or analytics trackers | verified: no such dependency in `package.json`, and the CSP in `next.config.ts` would block one |
| teams of 2 to 25 | `src/lib/plans.ts`, `maxMembers` 3 / 10 / 25 |

**4. Both listings say the same thing.** Same claims, same order, so a reviewer
comparing them sees one product. The differences are formatting: Play renders a
little HTML and reads better with sentence-case headings, Apple's description is
plain text and takes caps headings.

---

## Before you paste, two conditional edits

**If push notifications do not ship**, delete every push mention: the "in the
app, by push and by email" phrases and the PERMISSIONS notification lines. See
`store/PRE-FLIGHT.md` item C6.

**If the microphone does not ship**, delete the voice-capture and meeting
sections from both descriptions. The exact paragraph list is in
`store/review-notes.md` Part 2. Re-count afterwards; both files have room to
spare either way.

---

## One deliberate omission

Neither description mentions the **meeting notetaker bot** (Recall.ai). It is an
add-on that belongs to no pricing band and is off unless an operator enables it
per workspace (`src/lib/plans.ts:18-20`), so almost no reader could use it, and
describing a feature a reviewer cannot reach invites a "where is this" question.
It is fully declared in the privacy documents, which is where it belongs.
