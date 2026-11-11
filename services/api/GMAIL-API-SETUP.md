# Gmail API setup for customer email

The API can keep using Gmail SMTP (`EMAIL_PROVIDER=gmail`) or use Gmail API over HTTPS (`EMAIL_PROVIDER=gmail-api`). Gmail API avoids Render Free's blocked SMTP ports. Select one provider in the API environment; both sets of credentials can coexist.

## Google Cloud setup

1. Create or select a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable **Gmail API** for that project.
3. Configure the OAuth consent screen. Use **External** for a personal Gmail account, enter the app details, and add the Gmail mailbox that will send the messages as a test user.
4. Add the Gmail sending scope: `https://www.googleapis.com/auth/gmail.send`.
5. Create an OAuth Client ID with application type **Web application**. Add this authorized redirect URI:
   `https://developers.google.com/oauthplayground`
6. Open [OAuth 2.0 Playground](https://developers.google.com/oauthplayground), open its settings, enable **Use your own OAuth credentials**, and enter the Client ID and Client Secret. Keep offline access enabled and force a consent prompt.
7. In Step 1, enter `https://www.googleapis.com/auth/gmail.send`, authorize with the sender Gmail account, and grant access. In Step 2, exchange the authorization code and copy the **Refresh token**.

## Important OAuth publishing note

An External consent screen left in **Testing** issues Gmail-scope refresh tokens that expire after 7 days. For a lasting production token, move the consent screen to **In production**. Google may require OAuth verification for sensitive Gmail scopes; until approval, Google can show an unverified-app warning or impose restrictions. See [Google's refresh-token rules](https://developers.google.com/identity/protocols/oauth2) and [Gmail API OAuth setup](https://developers.google.com/workspace/gmail/api/auth/web-server).

## Configure the API environment

Set these variables in Render's API service Environment page:

```text
EMAIL_PROVIDER=gmail-api
GMAIL_USER=the-authorizing-mailbox@gmail.com
GMAIL_OAUTH_CLIENT_ID=the-client-id
GMAIL_OAUTH_CLIENT_SECRET=the-client-secret
GMAIL_OAUTH_REFRESH_TOKEN=the-refresh-token
```

`GMAIL_USER` must be the same Gmail mailbox that granted the `gmail.send` permission. Keep the client secret and refresh token private. The existing `GMAIL_APP_PASSWORD` stays available for the SMTP provider and is not used by Gmail API.
