# Hi Tek Production System — Setup Guide

**Written for someone who is not an IT person.** Follow it in order. Do not skip steps.
Total time: about 45 minutes. You need a laptop, not a phone.

Cost: **₹0 per month.** Google Sheets is free, Apps Script is free, Vercel is free.

---

## What you are building

Three pieces that talk to each other:

```
  Phone / laptop              Vercel                 Google
  ────────────────           ────────               ────────
  The screens         →      /api        →      Apps Script  →   Google Sheet
  (index, style, app)        (redirect)         (the rules)      (the data)
```

- The **Google Sheet** is your database. All the data lives there and you can always open it.
- **Apps Script** is the rulebook that sits in front of the Sheet.
- **Vercel** serves the screens and forwards anything starting with `/api` to Apps Script.

---

# PART 1 — Create the database (15 minutes)

### Step 1.1 — Make the Sheet

1. Go to **sheets.google.com**
2. Click the **+ Blank spreadsheet** button
3. Click **Untitled spreadsheet** at the top left and type: `Hi Tek Production`
4. Press Enter

### Step 1.2 — Open the script editor

1. In the menu bar, click **Extensions**
2. Click **Apps Script**
3. A new browser tab opens with a code editor. It shows:

```
function myFunction() {
}
```

4. Click anywhere in that code box, press **Ctrl+A** (select all), press **Delete**
5. Open the file `Code.gs` I sent you, select everything, copy it
6. Click back in the empty code box and paste
7. Press **Ctrl+S** to save. The tab at the top should stop saying "Untitled project" —
   if it asks for a project name, type `Hi Tek Production`

### Step 1.3 — Set the secret password key

This is what stops someone forging a login.

1. On the **left side**, click the **gear icon** (⚙) — it says *Project Settings*
2. Scroll to the bottom, find **Script Properties**
3. Click **Add script property**
4. In **Property**, type exactly: `SECRET`
5. In **Value**, type a long random string. Bang on the keyboard — 40+ characters.
   Example: `hitek7f3k2mQ8xR4vP1nZ6wL9tB5yH0jD2sA8cE4gU`
6. Click **Save script properties**

> **Never share this value.** It is not a password you type anywhere. It is the key that
> signs logins. If somebody gets it, they can log in as any user.

### Step 1.4 — Build the sheets

1. On the left side, click the **`< >` icon** (Editor) to go back to the code
2. At the top there is a dropdown that says **`doPost`** or **`myFunction`**.
   Click it and choose **`setup`**
3. Click **▶ Run**
4. Google will ask for permission:
   - Click **Review permissions**
   - Choose your Google account
   - You will see **"Google hasn't verified this app"** — this is normal, it is your own script
   - Click **Advanced** at the bottom left
   - Click **Go to Hi Tek Production (unsafe)**
   - Click **Allow**
5. Wait about 20 seconds. At the bottom you will see **Execution completed**

### Step 1.5 — Check it worked

Go back to your Google Sheet tab. At the bottom you should now see **17 tabs**:

`Users` `Projects` `Tasks` `Routings` `Items` `Operations` `StdTimes` `WorkCentres`
`Production` `Downtime` `Stock` `StockMoves` `Powder` `PowderMoves` `Challans`
`Docs` `Notes` `Scores` `LearnLog` `AuditLog` `Config`

Open the **`Tasks`** tab. You should see roughly **190 rows** — your 18 projects, each
broken into its full routing, with the finished steps already marked `done` and the
current step marked `ready`.

**`Tasks` is the most important sheet in the system.** One row = one project × one
operation × one work centre × one named person. Everything the operators see comes
from here.

### Step 1.6 — Change the passwords (DO NOT SKIP)

1. Click the **`Users`** tab at the bottom of the Sheet
2. Every row that says `change-me` in column B — replace it with a real password
3. The operator rows say `1234` — change those too, or keep them simple if you prefer;
   operators cannot see any money either way

---

# PART 2 — Publish the rulebook (10 minutes)

### Step 2.1 — Deploy

1. Go back to the **Apps Script** tab
2. Top right, click the blue **Deploy** button → **New deployment**
3. Click the **gear icon** next to *Select type* → choose **Web app**
4. Fill in:
   - **Description:** `v1`
   - **Execute as:** `Me (your@email.com)`
   - **Who has access:** `Anyone`  ← must be "Anyone", not "Anyone with Google account"
5. Click **Deploy**
6. Click **Authorize access** if asked, and approve again
7. You now see a **Web app URL** ending in `/exec`. Click **Copy**

It looks like:
`https://script.google.com/macros/s/AKfycb...long...string/exec`

> **"Anyone" does not mean anyone can see your data.** It means Google will accept the
> request. Your own login and role checks inside `Code.gs` decide what actually happens.

### Step 2.2 — Put the URL into vercel.json

1. Open the file `vercel.json` I sent you in Notepad
2. Find `PASTE_YOUR_NEW_EXEC_URL_HERE`
3. Replace **that text only** with your copied URL, keeping the quotes

Before:
```
"destination": "https://script.google.com/macros/s/PASTE_YOUR_NEW_EXEC_URL_HERE/exec$1"
```
After:
```
"destination": "https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxx/exec$1"
```

Careful: your copied URL already ends in `/exec`. Make sure the line ends `/exec$1` and
there is no `/exec/exec`.

---

# PART 3 — Publish the screens (10 minutes)

Put these five files in your GitHub repo, replacing the old ones:

```
index.html
style.css
app.js
vercel.json
favicon.ico     (keep your existing one)
```

Delete the old `script.js` — it is replaced by `app.js`.

Push to GitHub. Vercel rebuilds automatically in about a minute.
Open your site. You should see the **HI TEK** login box on a dark background.

Log in as `ashutosh` with the password you set.

---

# PART 4 — THE RULE THAT CATCHES EVERYONE

> **Every time you change `Code.gs`, you must redeploy — or the website keeps running the old code.**

Saving with Ctrl+S is *not* enough.

1. **Deploy** → **Manage deployments**
2. Click the **pencil icon** (Edit) on your deployment
3. **Version** dropdown → choose **New version**
4. Click **Deploy**

The URL stays the same, so you never touch `vercel.json` again.

If a change you made "did nothing", this is why. Check here first, every time.

---

# PART 5 — Turn on the nightly job (5 minutes)

This calculates scores and runs the learning every night.

1. In Apps Script, click the **clock icon** (⏰ Triggers) on the left
2. Bottom right, click **+ Add Trigger**
3. Set:
   - Function to run: **`runNightly`**
   - Deployment: **Head**
   - Event source: **Time-driven**
   - Type of time based trigger: **Day timer**
   - Time of day: **11pm to midnight**
4. Click **Save**

---

# How work flows now

The old version had a single `Stage` field per project that somebody typed. That is gone.

Now every project is broken into **tasks** the moment it is created, using the routing
for its division. Each task knows:

- which **operation** (Bending, Powder Coating…)
- which **work centre** it happens at
- **who** it is assigned to
- **how many** pieces are targeted, and how many are done
- its **status**: `waiting` → `ready` → `running` → `done`

### The flow, step by step

1. Only the **first** task of a project starts as `ready`. Everything else is `waiting`.
2. The assigned operator sees the `ready` task **and nothing else in the whole plant**.
3. Each time he taps a quantity, `QtyDone` rises and the status becomes `running`.
4. When `QtyDone` reaches `QtyTarget` — **or** he taps *हे काम संपले (Task finished)* —
   the task becomes `done`.
5. **The very next task in the routing flips from `waiting` to `ready` by itself.**
   The next operator's screen updates within two minutes. Nobody tells anybody.
6. The project's `Stage` is now *calculated* — it is the earliest operation not yet done.
   Never type it.

### Routings — where the flow is defined

The `Routings` sheet holds one row per division per step. Change the order there, or add
a step, and every **new** project follows the new flow. Existing projects keep the routing
they were created with, which is what you want.

To skip a step for one division, put the word `skip` in the `Optional` column.

### Rework goes backwards

If an operator enters rejected pieces, the system reopens the **previous** task with a note
and reduces its completed quantity. The pieces physically have to go back, so the system
sends them back too.

---

# The Config sheet — the dials you control

Open the `Config` tab in your Sheet. Change the value in column B, and the whole
system changes. No code, no redeploy.

| Key | Default | What it does |
|---|---|---|
| `quota_Rupali` `quota_Ashutosh` `quota_Mohit` | 0.20 | Guaranteed **floor** of pressbrake time. Not a cap. Unused minutes go back to the shared pool automatically. |
| `ceiling` | 0.85 | Never load the bottleneck past 85%. This is what makes delivery dates keepable. |
| `cr_red` / `cr_amber` | 1.0 / 1.5 | Below 1.0 = late (red). Below 1.5 = tight (amber). |
| `size_S` `size_M` `size_L` `size_XL` | 50 / 300 / 2000 / 8500 | Pressbrake minutes per project size class |
| `brake_min_per_week` | 3510 | Both brakes, 75% availability, 6 days, **one shift**. Change to **7020** the day you start a second shift. |
| `shift_start` `lunch_start` `lunch_end` `shift_end` | 09:00 13:00 13:30 18:00 | Used to split the production report into 9–1 and 1:30–6 |
| `scoring_live` | **no** | Leave at `no` for 90 days. See warning below. |
| `learning_live` | yes | System updates its own planning times |
| `learn_min_samples` | 20 | Needs 20 clean runs before it will change a time |
| `learn_max_change` | 0.25 | A single learning pass can never move a time more than 25% |
| `block_task_if_no_material` | yes | A task cannot go `ready` while its material is below zero |

### The two-number rule — the most important thing in this system

In the `StdTimes` sheet there are two time columns and they must never be merged:

- **`TargetMin`** — what people are **scored** on. **Only you change it.** Never the system.
- **`PlanMin`** — what the scheduler uses to promise dates. **The system learns this** from real runs.

If one number did both jobs, you would build a ratchet: people work slightly slower,
the target follows them down, slower becomes normal, and it drifts down forever.
Keeping them apart is what prevents that.

### Warning about scoring

`scoring_live` starts at **`no`** on purpose. Your standard times are days old and each one
is a single estimate. Score people against a wrong target in month one and you will get a
revolt **and** corrupted data — because the fastest way to fix a bad score is to stop
tapping honestly.

Collect for 90 days. Let the learning column tell you what the real times are. Then set
it to `yes`.

---

# Documents — where files actually live

**Files are NOT stored in the Google Sheet.** They go into Google Drive, and the Sheet
only keeps the link. This matters — a Sheet full of images would become unusable within
weeks.

The first upload creates a Drive folder called **`Hi Tek Production Files`**, and inside it
one folder per project, named `P-010 - Osian One`. So the Drive stays navigable by a human
even if the app is not open.

### Photos are compressed before they leave the phone

A 4 MB phone photo is resized to 1600px and re-compressed to roughly **150 KB** in the
browser, before it is sent. That is what makes uploading workable on a shop-floor
connection — and it keeps you inside Apps Script's limits.

PDFs are sent as they are. The limit is set by `max_upload_kb` in Config (default 1200 KB).
If a BOQ PDF is rejected, shrink it first.

### What can be attached

BOQ · Measurement sheet · Drawing · Job card · Site photo · QC photo · Dispatch photo ·
Nest file · Other

A file can be attached to a **whole project** (a BOQ) or to **one specific task**
(a bend drawing that only the pressbrake needs).

### Where they appear

- **Documents tab** — everything, filterable by project
- **Inside a task** — thumbnails right above the quantity buttons, so Kaveri opens the
  drawing on the same screen she taps Done on
- **Order tracker** — file count per project

### Sharing

Uploaded files are set to *anyone with the link can view*. This is what lets thumbnails
render inside the app. **Do not upload anything you would not want forwarded** — no bank
details, no signed contracts. Drawings, BOQs and site photos are fine.

---

# Notes — three kinds, and the difference matters

| Scope | Who sees it | Use it for |
|---|---|---|
| **Task** | Only that one task | "Customer wants hinges on the right" |
| **Project** | Everyone on that project, at every stage | "Site access only before 11am" |
| **Station** | **Every job at that work centre, forever** | "Precoated scratches — use protective film" |

**Station notes are the valuable ones.** They are how a supervisor's knowledge stops living
only in his head. Two are already seeded as examples — one warning that RAL 7044 Matt exists
from two different makers, one about protecting precoated sheet on the brake.

### Pinning

A pinned note is shown **on the job card itself**, before the operator opens anything.
Use it sparingly — pin four notes to every task and operators stop reading all of them.

Operators can add task notes. Supervisors and above can set the scope and pin.

---

# Station Mode — for people without a phone

Not everyone has a smartphone, and helpers should not need one.

**One tablet per work centre**, mounted at the machine, logged in once as a station
account and never logged out. Roughly six devices for the whole plant instead of
twenty-six phones.

### How it works

1. The tablet stays logged in as e.g. `station-brake`
2. The operator taps **कोण काम करत आहे (Who is working)** at the top of the screen
3. He taps his own name and enters his **4-digit PIN** — now the tablet is him
4. He ticks any **helpers** working with him. Helpers need no PIN screen of their own,
   no password, no device
5. Every quantity recorded credits the operator, and records the helpers alongside

### Why helpers are recorded but not scored the same way

A pressbrake with two helpers is **one machine producing**, not three people producing.
If you divided the output three ways, the operator's efficiency would look terrible and
the numbers would be meaningless.

So: earned minutes credit the **operator**, and helpers are recorded in the `Helpers`
column and the `TaskCrew` sheet. You can see who assisted, on what, and how often —
without corrupting anyone's efficiency figure.

Over a few months `TaskCrew` also tells you which helpers are ready to be trained up as
operators. That is your succession plan for the Kaveri problem, built from real data.

### What to buy

Any Android tablet, 8 inch or larger, ₹8,000–12,000. Wall-mount or bolt it to the machine
frame. Six of them is about ₹60–70k against ₹1L+ for phones that get lost and dropped.

---

# Adding things — all from the Setup tab, no spreadsheet needed

Log in as a director or planner and open **Setup**. The buttons across the top add:

| Button | Creates | Note |
|---|---|---|
| **+ New project** | A project **and all its tasks at once** | Pick the division and the routing does the rest |
| **+ Work centre** | A new machine or bench | Give it a group so tasks can find it |
| **+ Item** | A product family | e.g. "Z Louver 132mm" |
| **+ Operation** | A new process step | e.g. "Deburring" |
| **+ Standard time** | Minutes per unit for an item × operation | Sets Target and Plan to the same value to begin |
| **+ Person** | A user with a role, work centre, **Kind** (operator or helper) and a **PIN** | Never delete people — set `Active` to `no` |

### Choosing activities when creating a project

The new project screen lists every step in that division's routing, **all ticked by default**.
Untick anything this job does not need — a job-work batch with no powder coating, a supply-only
order with no installation.

Tasks are then created **only** for the ticked steps, and each one is **assigned automatically**
from the `DefaultAssign` sheet. You no longer assign anything by hand.

To change who normally does an operation, edit the `DefaultAssign` sheet. It applies to all
future projects.

Stores has its own **Add new item** and **Add new shade** buttons on the Stores tab.

---

# Editing from the Order tracker

Click any step in the pipeline to open it. Directors and planners can change:

- who it is assigned to
- which work centre it runs at
- target and completed quantity
- the task note
- **force the status** — reopen a closed task, skip a step, push work forward
- delete the task entirely

Every forced status change and reassignment is written to the `AuditLog` sheet with your name.

**Edit project** on the project row changes the name, customer, address, director, size,
quantity, promised date and blocker.

Use forced status sparingly. Every override teaches the floor that the board is advisory.

---

# Assigning and reassigning work

**A task with nobody assigned to it will never appear on any operator's screen.** This is
deliberate — it forces someone to decide who is doing the work.

To assign or reassign:
- **On a phone:** press and hold a task for one second
- **On a laptop:** right-click a task, or click any step in the Order tracker pipeline

Supervisors, planners and directors can reassign. Operators cannot. Every reassignment is
written to the `AuditLog` sheet with who did it and what it was before.

**When somebody is absent,** reassign their open tasks in the morning. It takes about
thirty seconds and it is the difference between the plant running and the plant waiting.

---

# How the downtime clock works

Nobody types how many minutes a machine was stopped. The clock does it.

1. The **मशीन बंद** button is at the **top of the screen, next to the work centre name** —
not inside a job. When a machine stops, the whole station stops, not one order.

1. Operator taps **मशीन बंद** (Machine stopped) and picks a reason
2. A **red bar appears across the top of their screen** with a running timer
3. When the machine restarts they tap **पुन्हा सुरू** (Resume)
4. The system writes the exact minutes into the `Downtime` sheet

The stoppage is recorded against the **work centre**, so the supervisor sees that the
pressbrake was down for 40 minutes — not that one order was delayed.

Each reason is marked `plant` or `own` in `Code.gs`:

- **`plant`** — no material, no drawing, breakdown, power cut. These minutes are
  **removed from the operator's score denominator.** Not their fault, not their problem.
- **`own`** — tool change, colour change, cleaning. Part of the job, counts against them.

That single distinction is what makes the score fair. Without it, the score is a lie and
every operator will know within a week.

---

# Adding and removing people

**Adding:** one new row in the `Users` sheet.

| Column | Example | Notes |
|---|---|---|
| Username | `vinod` | lower case, no spaces |
| Password | `1234` | |
| Name | `Vinod` | shows on screens and the scoreboard |
| Role | `operator` | see role list below |
| WorkCentre | `Bending` | Bending, Laser, Powder, Welding, Grinding, CTL, Packing |
| Lang | `mr` | `mr` = Marathi, `en` = English |
| Active | `yes` | |

**Removing:** change `Active` to `no`. **Never delete the row** — their production history,
scores and earned minutes are linked to it.

**Roles:**

| Role | Can see |
|---|---|
| `operator` | **Only tasks assigned to him by name.** Not his department, not anyone else's work. He physically cannot report against someone else's task — the server refuses it. |
| `supervisor` | Every task at **his own work centre**, plus order tracker, sequence, screenshots, stores. Can assign and reassign. |
| `stores` | Stock and powder only |
| `planner` | Everything about production, plus setup |
| `office` | Orders, screenshots, challans |
| `accounts` | Screenshots and stores |
| `director` | Everything |

Roles are enforced **inside `Code.gs`**, not by hiding buttons. Hiding a button in a browser
is not security — anybody can press F12 and unhide it. Blocking the action on the server is.

---

# Troubleshooting

| What you see | What it means | Fix |
|---|---|---|
| "Session expired" | Token is 12 hours old | Log in again. Normal. |
| Nothing loads, spinner forever | `vercel.json` URL wrong | Check for `/exec/exec` or a missing `$1` |
| Your code change did nothing | You saved but did not redeploy | Part 4 above |
| "Set SECRET in Script Properties" | Step 1.3 skipped | Do step 1.3 |
| "Your role cannot do that" | Working as intended | Log in with a higher role |
| Very slow at 9am and 6pm | Apps Script allows ~30 at once | Stagger tap times, or move to a real database |
| Sheet is getting huge | `Production` grows every day | Fine to about 100,000 rows ≈ 2 years |

**To test the backend on its own:** paste your `/exec` URL straight into a browser.
You should see `{"status":"success","data":{"ok":1}}`. If you see an error page, the
problem is in Apps Script, not in Vercel or the screens.

---

# What to do in the first month

**Week 1** — Bending only. Kaveri taps. Nobody else. Paper register continues as backup.
Every evening, check the `Production` sheet has rows in it.

**Week 2** — Add Laser and Powder. Compare the `Production` sheet against the paper
register at 6pm. They should match. If they do not, find out why before going further.

**Week 3** — All work centres. Start posting the two screenshots to the WhatsApp group.

**Week 4** — Stop the paper registers. Start using stores and challans.

**Month 2 and 3** — Just collect. Look at the learning table but change nothing.

**Month 4** — Compare `PlanMin` against `TargetMin`. Where the system has learned a very
different number, go and watch that operation. Then set your real targets, and only then
turn `scoring_live` to `yes`.
