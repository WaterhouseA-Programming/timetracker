# Firebase Setup — TimeTracker Tasks

Follow these steps once to enable real-time task sync across all your devices.

---

## Step 1 — Create a Firebase project

1. Go to https://console.firebase.google.com
2. Click **Add project** → give it a name (e.g. `timetracker`)
3. Disable Google Analytics if you don't need it → **Create project**

---

## Step 2 — Enable Firestore

1. In the left sidebar go to **Build → Firestore Database**
2. Click **Create database**
3. Choose **Start in production mode** (test mode leaves the database open to the
   world; you will paste the real rules in the last step of this guide)
4. Pick any region → **Enable**

---

## Step 3 — Get your config

1. Go to **Project Settings** (gear icon, top left)
2. Scroll down to **Your apps** → click **</>** (Web)
3. Give the app a nickname → **Register app**
4. Copy the `firebaseConfig` object — it looks like:

```js
{
  "apiKey": "AIza...",
  "authDomain": "yourproject.firebaseapp.com",
  "projectId": "yourproject",
  "storageBucket": "yourproject.appspot.com",
  "messagingSenderId": "123456789",
  "appId": "1:123..."
}
```

---

## Step 4 — Paste config into the app

**Desktop app:** Click the **Tasks** tab → paste the JSON config → click **Connect**

**Web app:** Open `tasks-web/index.html` in a browser → paste the JSON config → click **Connect**

Both will save the config locally so you only need to do this once per device.

---

## Step 5 — Host the web app (for phone/tablet access)

The easiest free options:

### GitHub Pages
1. Push the `tasks-web/` folder to a GitHub repo
2. Go to Settings → Pages → Source: main branch → `/tasks-web` folder
3. Your tasks will be live at `https://yourusername.github.io/yourrepo`

### Netlify (drag & drop)
1. Go to https://netlify.com → **Add new site → Deploy manually**
2. Drag the `tasks-web/` folder onto the page
3. Done — you get a URL instantly

---

## Firestore rules — do this before you put real data in

Both apps sign in with email/password, but sign-in in the client is only cosmetic
until the rules enforce it. With test-mode rules (`allow read, write: if true`)
anyone who learns your `projectId` can read and write every customer name, task,
time entry and invoice in the database. The `projectId` is not a secret.

The policy lives in [`firestore.rules`](firestore.rules) in this repo. Rules are
**not** deployed by pushing to master — copy the file's contents into the Firebase
console under **Firestore Database → Rules → Publish**, or run
`firebase deploy --only firestore:rules`.

Then close off public sign-up, otherwise a stranger can create an account and pass
the signed-in check:

**Firebase console → Authentication → Settings → User actions →** untick
**Enable create (sign-up)**.

To verify the lock worked, sign out in the app: the board should show the sign-in
overlay and the sync dot should stay grey.
