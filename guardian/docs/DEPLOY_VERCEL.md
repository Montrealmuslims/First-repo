# Deploy Guardian on Vercel + Neon (private, family use)

You end up with two Vercel projects from the same GitHub repository:

| Vercel project | Root Directory | What it is |
|---|---|---|
| `guardian-api` | `guardian/backend` | The API the phones and dashboard talk to |
| `guardian-web` | `guardian/web` | The parent dashboard |

and one Neon database. Everything fits in the free plans for a family.

---

## 1. Push the code to GitHub

Unzip the archive into your local `First-repo` folder (replace the files), then in **GitHub Desktop**: review the changes → *Commit to main* → *Push origin*.

## 2. Create the API project

1. Vercel → **Add New… → Project** → import `First-repo`.
2. **Root Directory:** `guardian/backend` · **Framework Preset:** Other. Leave build settings as they are (`vercel.json` sets them).
3. Don't deploy yet. Open **Environment Variables** and add:

| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `GUARDIAN_DATA_KEYS` | `k1:` followed by a random key (see below). **Save a copy somewhere safe**: if you lose it, stored alert excerpts can't be decrypted. |
| `CRON_SECRET` | any long random string (same method below) |
| `SIGNUP_ALLOWED_EMAILS` | your email(s), comma-separated, e.g. `me@gmail.com,spouse@gmail.com` |
| `ALLOW_SELF_ATTESTED_CONSENT` | `true` (lets the consent checkbox work; you are the parent and the operator) |
| `PG_POOL_MAX` | `3` |
| `WEB_APP_URL` | leave for now; set in step 4 |
| `ANTHROPIC_API_KEY` | optional: enables Claude message review |

**Making a random key without a terminal:** open any browser tab, press F12 → Console, paste and press Enter:

```js
btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
```

Use the output after `k1:` for `GUARDIAN_DATA_KEYS`, and run it again for `CRON_SECRET`.

4. **Connect the database:** project → **Storage** → **Connect Database** → choose your Neon database (or *Create* a new Neon one) → connect it to all environments. This adds `DATABASE_URL` and `DATABASE_URL_UNPOOLED` automatically.
5. **Deploy.** Every deploy runs the database migrations first (`npm run vercel-build`), so the tables are created for you.
6. Open `https://<your-api-project>.vercel.app/healthz` → you should see `{"ok":true}`.
7. Optional: **Settings → Functions → Function Region** → pick the region closest to your Neon database (it's shown in Neon's dashboard).

## 3. Create the dashboard project

1. Vercel → **Add New… → Project** → import `First-repo` again.
2. **Root Directory:** `guardian/web` · Framework: Next.js (detected).
3. Environment variables (use your **production** API address from step 2, no trailing slash):

| Name | Value |
|---|---|
| `API_URL` | `https://<your-api-project>.vercel.app` |
| `NEXT_PUBLIC_API_PUBLIC_URL` | same as `API_URL` (goes into the pairing QR code) |

4. Deploy and open `https://<your-web-project>.vercel.app`.

## 4. Finish the API settings

In the **API** project → Settings → Environment Variables → set `WEB_APP_URL` to the dashboard address → **Deployments → ⋯ → Redeploy**.

## 5. Set up your family

1. Dashboard → **Sign up** with an email from `SIGNUP_ALLOWED_EMAILS`. (Turn on two-step login under *Account* afterwards.)
2. **Add a child** → in the consent step tick **قفل الجهاز عن بُعد** (remote device lock) → confirm.
3. You'll get a **pairing code + QR code** (valid 10 minutes).

## 6. Set up your child's phone (Android 8+)

1. Install the APK (open the file on the phone, allow "install unknown apps" when asked).
2. Open the phone's **Camera** and scan the QR code from the dashboard → it opens Guardian with the code and server already filled in → **ربط (Connect)**.
   No camera? Type the 8-digit code and your API address (`https://<your-api-project>.vercel.app`).
3. In the app: **allow notifications**, then **allow screen lock** (السماح بقفل الشاشة).
4. Test: in the dashboard press **قفل 30 دقيقة** → the phone locks within ~30 seconds and shows the message on the lock screen. Press **فتح القفل** to unlock.

Tip: tell your child what the app does. It shows them the same thing on its own screen.

## Good to know

- **Use the production address** (`<project>.vercel.app` or your own domain) everywhere, not a preview-deployment URL: previews are protected by Vercel login and change on every push.
- **Daily cleanup** runs at 03:17 UTC via Vercel Cron (old alerts after 90 days, locations after 30).
- **Parent app on your phone:** the Expo app needs an EAS build to install. Easiest for now: open the dashboard in your phone's browser and *Add to Home Screen*.
- **Lock delay:** up to ~30 s while the child's screen is on; immediately when they turn the screen on.
- **Not tamper-proof:** the child can turn off the screen-lock permission and uninstall. You'll see a red warning on the lock card and the device's *last seen* time stops updating. For stronger control add Google Family Link (free), which can block uninstalling.
- **Gmail monitoring** is not active on Vercel's free plan (it needs a job every few minutes; free cron runs daily).
- **Updating:** push to GitHub → Vercel redeploys both projects automatically; new migrations run on deploy.
