# Huntr

Paste links to job posts. Huntr opens each page, works out **how** that job wants you to apply (email or the company's own form), drafts the email or cover letter, sends email applications straight from your Gmail, and tracks every application — with a table view and a Sankey "job hunt flow" view.

**Stack:** React (Vite) · Express · Node · **Supabase** (Postgres, Auth, Storage) in place of MongoDB.

```
huntr/
├─ client/            React app (Vite)
│  └─ src/
│     ├─ pages/       Auth, Apply (main page), Tracker, Profile
│     ├─ components/  Nav, Logo, Sankey
│     └─ lib/         supabase client, API helper, Sankey layout
├─ server/            Express API
│  └─ src/
│     ├─ routes/      jobs, applications, gmail, profile
│     └─ services/    crawler, parser, drafter, gmail
└─ supabase/
   └─ schema.sql      tables, row-level security, resume storage bucket
```

## How it works

1. **Apply page** — add job links (one per box; pasting several at once splits them). Press **Analyze**.
2. The server **crawls** each link (reads JSON-LD job data when the page has it, otherwise the page text), then the **parser** decides:
   - **Email** — the post gives an address to send to → Huntr drafts the email, follows any subject-line rule ("use the subject …"), and fills in your name, school and skills from your profile.
   - **Company site** — no email, or the post says email applications aren't accepted → Huntr finds the apply link and drafts a cover letter.
3. Huntr also saves a **snapshot** of each post — the full description and the post's main image (its share image, logo or first real picture) — into your Supabase Storage, so you can still see what you applied to after the listing comes down.
4. **Send all** sends every email draft from your Gmail (your resume from Profile is attached). Site applications open in a new tab; mark them as submitted when done.
5. **Tracker** — everything you've sent (**View post** opens the saved snapshot). Update each one's furthest stage and status; flip to **Sankey view** to see the flow, or copy it for sankeymatic.com.

## Setup

### 1. Supabase
1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query** → paste `supabase/schema.sql` → **Run**. (Already ran it before snapshots existed? Also run `supabase/002_job_snapshots.sql`.)
3. **Authentication → URL Configuration**: Site URL `http://localhost:5173/`, and add `http://localhost:5173/**` to Redirect URLs (add your GitHub Pages URL too when you deploy).
4. **Project Settings → API**: copy the project URL, the `anon` key and the `service_role` key.

### 2. Google (sign-in + Gmail sending)
1. In [Google Cloud Console](https://console.cloud.google.com) create a project and **enable the Gmail API**.
2. **OAuth consent screen**: External, add the scope `https://www.googleapis.com/auth/gmail.send`, and add your own Google account under **Test users**.
3. **Credentials → Create OAuth client ID → Web application**. Authorized redirect URI: `https://YOUR-PROJECT.supabase.co/auth/v1/callback`.
4. In Supabase **Authentication → Providers → Google**: turn it on and paste the client ID and secret.

### 3. Environment files
```bash
cp server/.env.example server/.env    # fill in Supabase + Google values
cp client/.env.example client/.env    # fill in Supabase URL + anon key
```
(On Windows PowerShell use `copy` instead of `cp`.)

### 4. Run it
```bash
npm run install:all
npm run dev
```
Open http://localhost:5173 (pages use `#/` URLs, e.g. `/#/tracker`), sign in with Google, fill in **Profile** (name, school, skills, resume), then go to **Apply**.

Run the parser tests with `npm test`.

## Deploy (GitHub Pages + Render)

GitHub Pages only serves static files, so the **React client** goes on Pages and the **Express API** goes on Render (free). Supabase stays where it is.

```
Browser ──> GitHub Pages (React)  ──>  Render (Express API)  ──>  Supabase (DB, Auth, Storage)
                                              └──> Gmail API, job pages
```

1. **Push to GitHub** as a repo named `huntr` (e.g. `github.com/AkurasKurasa/huntr`). `.env` files are git-ignored — never commit them.
2. **API on Render**: render.com → **New → Blueprint** → pick the repo (it reads `render.yaml`). Paste the Supabase and Google values when asked. When it's live, note the URL, e.g. `https://huntr-api.onrender.com`. Check `https://huntr-api.onrender.com/api/health` shows `{"ok":true}`.
3. **Repo variables**: GitHub repo → **Settings → Secrets and variables → Actions → Variables** → add
   - `VITE_SUPABASE_URL` = your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon / publishable key (it's public by design)
   - `VITE_API_URL` = your Render URL + `/api`, e.g. `https://huntr-api.onrender.com/api`
4. **Turn on Pages**: repo **Settings → Pages → Source: GitHub Actions**. Push to `main` (or run the *Deploy client to GitHub Pages* workflow). The site appears at `https://akuraskurasa.github.io/huntr/`.
5. **Supabase → Authentication → URL Configuration**: set Site URL to `https://akuraskurasa.github.io/huntr/` and add `https://akuraskurasa.github.io/huntr/**` to Redirect URLs (keep the localhost one for development).
6. **Render → huntr-api → Environment**: `CLIENT_ORIGIN` must include `https://akuraskurasa.github.io` (no `/huntr`). Comma-separate several origins.

The repo also includes **Keep Supabase awake** (`.github/workflows/keep-supabase-awake.yml`). Every 3 days it signs in as a bot Huntr account and reads its profile, so the free project never counts as inactive. To set it up:
   - **Easiest:** in PowerShell, from the huntr folder, run `.\setup-keepalive.ps1`. It moves the workflows into `.github\workflows`, creates the bot account in Supabase (already confirmed, random password), test-signs-in, and — if the GitHub CLI (`gh`) is installed and logged in — saves the secrets and variables to your repo. Otherwise it prints exactly what to paste.
   - **By hand:** `npm run setup:bot` creates the bot and prints its email and password. Add them as repo **Secrets** `HUNTR_BOT_EMAIL` and `HUNTR_BOT_PASSWORD`, then **Actions → Keep Supabase awake → Run workflow** once; a green check means it worked. GitHub stops scheduled workflows in repos with no activity for 60 days — push something now and then.

Render's free plan sleeps when idle, so the first request after a quiet spell can take up to a minute; the app just shows "Analyzing…" a little longer.

## Good to know

- **Gmail sending.** Google only hands out the long-lived token on the *first* consent, so the app always asks with `prompt=consent`. If sending ever says Gmail isn't connected, use **Profile → Connect Gmail** again.
- **Going public.** While the Google app is in *Testing*, only the test users you added can sign in (up to 100). Opening it to everyone requires Google's verification for the `gmail.send` scope.
- **Company-site forms are not auto-submitted yet.** Every site uses a different form and many have CAPTCHAs or screening questions, so Huntr prepares the cover letter and checklist and you submit. A Playwright worker for common hiring platforms (Greenhouse, Lever, Workable) is the natural next step.
- **Pages that build themselves with JavaScript** (some job boards) may come back with little text; the crawler reads the raw HTML. LinkedIn and Indeed block crawlers and forbid automated applying, so paste the company's own posting instead.
- The service-role key and Gmail tokens stay on the server; the browser only ever uses the anon key, and row-level security keeps each user's data private.
