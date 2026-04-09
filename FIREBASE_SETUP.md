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
3. Choose **Start in test mode** (fine for personal use)
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

## Firestore rules (lock it down when ready)

In the Firebase console go to **Firestore → Rules** and replace with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /tasks/{taskId} {
      allow read, write: if true; // tighten this with auth later
    }
  }
}
```

For a private setup with Google sign-in, come back to this when you're ready to add auth.
