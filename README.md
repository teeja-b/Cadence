# Cadence

Timeline / Calendar / task planner with unlimited nested subtasks, notes, dates, times and progress.

- **Database:** [Supabase](https://supabase.com) (hosted PostgreSQL). Nothing to install or run yourself.
- **Backend + website:** one small Node app, hosted on **Google Cloud Run**.
- **No Docker.** Cloud Run builds the app for you straight from this folder.

```
browser  ──►  Cloud Run (Node app)  ──►  Supabase Postgres
              ├─ /api/*   the backend  (server/)
              └─ /*       the website  (built from src/)
```

One service serves both the API and the website, so there is a single URL and no CORS to configure.
Supabase is used **only as the database**. Login is handled by this app's own backend, not by Supabase Auth.

| Where | What |
|---|---|
| `src/` | The React app (UI unchanged). `src/api/client.js` is the small client that talks to `/api`. |
| `server/src/` | Backend: `auth.js` (accounts), `tasks.js` (tasks & subtasks), `db.js` (connection + tables, created automatically) |
| `server/test/` | Backend tests |
| `.env.example` | Settings template for running locally |

## What gets stored

- **Users**: email + hashed password (bcrypt). Login uses a signed token that lasts 30 days.
- **Tasks**: one row per task *and* per subtask, linked by `parent_id`, so nesting has no depth limit. Each row holds title, notes, category, status, progress, date, start/end time, and order among siblings.
- Every task belongs to one user and is only ever visible to that user.
- Deleting a task deletes all of its subtasks.
- Timeline and Calendar read the same task list, so they always agree.

---

## 1. Set up Supabase (about 5 minutes)

1. Create a free account and a **New project** at [supabase.com](https://supabase.com).
   Choose a **region close to where you'll run Cloud Run** (e.g. both in Europe), and **save the database password** you set.
2. Open the project and click **Connect** (top of the page) → choose **Transaction pooler** → copy the connection string. It looks like:

   ```
   postgresql://postgres.abcdefghijklmnop:[YOUR-PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:6543/postgres
   ```

3. Replace `[YOUR-PASSWORD]` with your database password. If the password contains characters like `@ : / ? # %`, URL-encode them (`@` → `%40`), or just reset it in *Project Settings → Database* to something with only letters and digits.

That's the whole database setup. **You don't create any tables.** The app creates them the first time it starts.

> **Why the Transaction pooler and not the "Direct connection"?** Supabase's direct connection is IPv6-only, and Cloud Run connects out over IPv4, so it fails with `ENOTFOUND`. The pooler string works over IPv4 and is designed for serverless apps like Cloud Run.

## 2. Run it on your computer

You need [Node.js 22](https://nodejs.org). Then, in this folder:

```bash
npm install
cp .env.example .env      # open .env: paste your DATABASE_URL, and set JWT_SECRET to any long random text
```

Start the backend and the website in two terminals:

```bash
npm run server            # backend on http://localhost:8080
npm run dev               # website on http://localhost:5173 (talks to the backend automatically)
```

Open http://localhost:5173, create an account, add tasks. Stop everything, start it again: your data is still there.

Local runs use whatever database is in `.env`. If you don't want test data mixed with real data, create a second free Supabase project for development.

To try the production setup (one server, no hot reload): `npm run build`, then `npm start`, then open http://localhost:8080.

## 3. Deploy to Google Cloud Run (no Docker)

You need a Google Cloud project with billing enabled and the [`gcloud` CLI](https://cloud.google.com/sdk/docs/install) signed in (`gcloud auth login`). No `gcloud` on your computer? Open **[Cloud Shell](https://shell.cloud.google.com)** in your browser (gcloud is already installed), upload this folder, and run the same commands there.

**Set up once:**

```bash
PROJECT=your-project-id
REGION=europe-west1          # pick the Cloud Run region closest to your Supabase region
gcloud config set project $PROJECT
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
```

**Store the two secrets** (the database URL from step 1, and a random signing key):

```bash
printf '%s' 'postgresql://postgres.abcdef...:YOUR-PASSWORD@aws-0-eu-west-1.pooler.supabase.com:6543/postgres' \
  | gcloud secrets create cadence-database-url --data-file=-
openssl rand -hex 32 | gcloud secrets create cadence-jwt-secret --data-file=-

# let Cloud Run read them
SA=$(gcloud projects describe $PROJECT --format='value(projectNumber)')-compute@developer.gserviceaccount.com
gcloud projects add-iam-policy-binding $PROJECT --member=serviceAccount:$SA --role=roles/secretmanager.secretAccessor
```

**Deploy** (from this folder):

```bash
gcloud run deploy cadence --source . --region $REGION --allow-unauthenticated \
  --set-secrets DATABASE_URL=cadence-database-url:latest,JWT_SECRET=cadence-jwt-secret:latest \
  --max-instances 3
```

The first time, it may ask to create a repository for the build. Answer **Y**. Google then builds the app itself
(it installs the packages, builds the website, and starts the server with `npm start`), which takes a couple of minutes.
When it finishes it prints your address, like `https://cadence-abc123-ew.a.run.app`.

Open it, sign up, add a task, refresh the page: it's saved. You can see the rows in Supabase under **Table Editor**.

**Then tell the app its own address** (used in password-reset emails):

```bash
gcloud run services update cadence --region $REGION --update-env-vars APP_URL=https://cadence-abc123-ew.a.run.app
```

**To publish a new version later**, just run the deploy command again. Your data lives in Supabase and is untouched.

## Settings (environment variables)

| Variable | Required | Meaning |
|---|---|---|
| `DATABASE_URL` | yes | The Supabase **Transaction pooler** connection string |
| `JWT_SECRET` | yes (in production) | Secret for signing login tokens. Changing it logs everyone out. |
| `PORT` | no | Set by Cloud Run automatically (default 8080) |
| `APP_URL` | recommended | Public URL, used in password-reset emails |
| `SMTP_URL`, `MAIL_FROM` | no | Outgoing email, see below |
| `REQUIRE_EMAIL_VERIFICATION` | no | `true` = require signup codes even without SMTP (the code is printed in the server log; for testing) |
| `DATABASE_CA_CERT` | no | Supabase's CA certificate text (Project Settings → Database → SSL). Makes the app verify it is really talking to Supabase. Without it the connection is still encrypted. |
| `DATABASE_SSL` | no | `false` to disable SSL (e.g. a local database). Default: on for any non-local host. |
| `DB_POOL_MAX` | no | Connections per Cloud Run instance (default 5) |

### Email (sign-up code, forgot password)

The app has a "verify your email" step and a "forgot password" page, and both need to send email.

- **Without `SMTP_URL`** (the default): accounts work immediately with no verification step, and the "forgot password" link is written to the server log (Cloud Run → **Logs**) instead of being emailed. Fine for personal use.
- **With `SMTP_URL`** (e.g. `smtps://apikey:SG.xxxx@smtp.sendgrid.net:465`, or any SMTP provider): new accounts must enter the 6-digit code emailed to them, and reset links are emailed. Add it as a secret the same way as the others, or with `--update-env-vars`.

## About Supabase

- **Free projects pause** after a period of inactivity. While paused, the app can't reach its data and shows an error until you click *Restore* in the Supabase dashboard. Check Supabase's current plan terms; a paid plan avoids this.
- **Your data is protected from Supabase's public API.** Supabase exposes tables in the `public` schema through a REST API. The app switches on row-level security for its tables so that API can't read or change them (only this backend can). It does this automatically.
- Keep the database password and connection string secret. If they leak, reset the password in *Project Settings → Database* and update the `cadence-database-url` secret.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `ENOTFOUND db.xxxx.supabase.co` | You used the **Direct connection**. Use the **Transaction pooler** string. |
| `Tenant or user not found` | The user must look like `postgres.<project-ref>` (as copied from Supabase) and the host must be your project's pooler host. Re-copy the string. |
| `password authentication failed` | Wrong or un-encoded password (see step 1). |
| Requests hang, then fail | Supabase project is paused, or the connection string is wrong. |
| `JWT_SECRET must be set in production` | The `cadence-jwt-secret` secret isn't attached to the service (check `--set-secrets`). |
| Build fails with a permissions error | Follow the error's hint. Usually a missing IAM role for Cloud Build on a brand-new project. |

## Not included

- **"Continue with Google" button:** still on the login and sign-up pages, but shows a message that Google sign-in isn't set up. Email + password works.
- Realtime sync between two open devices: a change made on one device appears on the other after a reload.

## Tests

```bash
TEST_DATABASE_URL='postgresql://...' npm run test:server
```

The tests create users and tasks, so point them at a **throwaway database** (for example a second Supabase project), never your real one.
