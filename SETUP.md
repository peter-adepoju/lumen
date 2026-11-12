# Setting up Lumen

Lumen needs one thing from you as the builder: a Google sign-in client. Everything else (storage and AI) belongs to each user. It takes about 15 minutes.

## 1. Create the Google sign-in client

1. Open the [Google Cloud console](https://console.cloud.google.com/) and create a project called **Lumen**.
2. Go to **APIs & Services → Library**, search for **Google Drive API** and click **Enable**.
3. Go to **APIs & Services → OAuth consent screen** (called **Google Auth Platform** in newer consoles):
   - User type: **External**.
   - App name **Lumen**, your support email, and the app's address once it's deployed.
   - Scopes: add `openid`, `email`, `profile` and `.../auth/drive.file`. `drive.file` only lets Lumen see files it creates itself, so Google treats it as non-sensitive.
   - While testing, add your own Google account under **Test users**. Before opening Lumen to everyone, press **Publish app**.
4. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Authorised redirect URIs:
     - `http://localhost:3000/api/auth/google/callback` (for running it on your computer)
     - `https://YOUR-APP.vercel.app/api/auth/google/callback` (once deployed)
5. Copy the **Client ID** and **Client secret**.

## 2. Add the settings

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Fill in:

| Setting | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | From step 1.5 |
| `GOOGLE_CLIENT_SECRET` | From step 1.5 |
| `SESSION_SECRET` | Any random text of 32+ characters. Generate one with the command below |
| `APP_URL` | Optional. Your public address, e.g. `https://lumen-xyz.vercel.app` |

```bash
openssl rand -base64 48
```

Keep `.env.local` private. It is ignored by git.

## 3. Deploy to Vercel

1. In Vercel, **Add New → Project** and import the `lumen` repository.
2. Under **Environment Variables**, add the same four settings.
3. Deploy. Then add the deployment's callback address to the OAuth client's redirect URIs (step 1.4) if you haven't already.

## What each user does

Nothing technical. They tap **Continue with Google**, then connect their own free Gemini key in about a minute: open Google AI Studio, tap **Create API key**, copy it, and paste it into Lumen. Lumen checks the key with Google before saving it to the user's own Drive.

## Troubleshooting

| What you see | Fix |
| --- | --- |
| "Google sign-in isn't set up on this server yet" | One of the settings is missing, or `SESSION_SECRET` is shorter than 32 characters |
| Google says `redirect_uri_mismatch` | The callback address in the OAuth client must match exactly, including `https` and no trailing slash |
| Google says the app isn't verified | Expected while testing. Add your account as a test user, or publish the app |
| "Lumen needs permission for its own Drive folder" | The user unticked the Drive box on Google's screen. They can sign in again and leave it ticked |
