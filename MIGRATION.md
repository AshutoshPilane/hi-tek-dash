# Upgrading a LIVE system — v5 → v6

**Nothing in your sheet is deleted, reordered or overwritten.** New sheets are created,
and new columns are appended to the end of existing sheets. Your production data,
tasks and projects stay exactly as they are.

`migrate()` is safe to run twice. If everything is already up to date it says so and stops.

---

## Step 1 — Back up (2 minutes, do not skip)

In your Google Sheet: **File → Make a copy** → name it `Hi Tek Production BACKUP <today's date>`.

If anything goes wrong you delete the new copy and carry on. Two minutes of insurance.

## Step 2 — Replace the code

1. Apps Script → select all in `Code.gs` → paste the new `Code.gs` → **Ctrl+S**
2. Choose **`migrate`** from the function dropdown (NOT `setup` — `setup` is for a blank sheet)
3. Click **▶ Run**
4. The log tells you exactly what it added

Expected output on your first run:

```
CREATED sheet: DefaultAssign
CREATED sheet: TaskCrew
ADDED to Users: Pin, Kind
ADDED to Tasks: Helpers
ADDED to Production: Helpers, Via
```

## Step 3 — Redeploy

**Deploy → Manage deployments → pencil icon → Version: New version → Deploy.**
Saving is not enough. This is the step everyone forgets.

## Step 4 — Push the frontend

Replace `index.html`, `style.css`, `app.js` in GitHub. Vercel rebuilds itself.

---

## Step 5 — Set up your people (10 minutes, in the app)

Open **Setup → + Person** and for each existing person set:

| Field | What to put |
|---|---|
| **Kind** | `operator` for anyone who runs a machine · `helper` for anyone who assists |
| **Pin** | A 4-digit number. Tell them to remember it. |

Helpers need a Name, Kind = `helper`, and a PIN. **They do not need a username, a password
or a phone.** Leave Role as `operator`.

## Step 6 — Create the station logins (5 minutes)

One per work centre. In **Setup → + Person**:

| Field | Value |
|---|---|
| Username | `station-brake` |
| Password | something long |
| Name | `Pressbrake Station` |
| Role | `station` |
| WorkCentre | `Brake` |
| Kind | `operator` |

Repeat for Laser, Powder, Welding, Grinding, Packing.

Log the tablet in once with that account and **never log out.** Individual people then
identify themselves with their PIN on top of it.

## Step 7 — Check the default assignments

Open the **`DefaultAssign`** sheet. One row per operation saying who normally does it.
Correct any that are wrong. From now on every new project assigns itself using this table.

---

## What to do about existing projects

Tasks created before the upgrade keep whatever assignment they already had. Only **new**
projects auto-assign. If you want to fix old ones, open the **Order tracker**, click a step
and change the person — it now saves.
