# linear-discord-bridge

Posts new Linear issues to a Discord channel as embed messages.

```
Linear issue created -> POST /webhook -> Discord channel
```

---

## Setup

**Requirements:** Node.js 18+, a Linear workspace, a Discord server.

```bash
git clone https://github.com/YOUR_USERNAME/linear-discord-bridge.git
cd linear-discord-bridge
npm install
cp .env.example .env
```

Fill in `.env`, then:

```bash
npm start
```

---

## Getting your credentials

**Discord webhook URL**
1. Go to the channel you want -> Edit Channel -> Integrations -> Webhooks
2. New Webhook -> Copy Webhook URL
3. Paste it as `DISCORD_WEBHOOK_URL`

**Linear webhook + signing secret**
1. Linear -> Settings -> API -> Webhooks -> New Webhook
2. URL: your server's address + `/webhook` (e.g. `https://your-app.vercel.app/webhook`)
3. Enable: Issues -> Created
4. Copy the Signing Secret -> paste as `LINEAR_WEBHOOK_SECRET`

For local testing, expose your server with [ngrok](https://ngrok.com/):
```bash
# terminal 1
npm run dev

# terminal 2
npx ngrok http 3000
```
Use the ngrok URL as your Linear webhook URL.

---

## Deploying to Vercel

1. Push to GitHub
2. Import the repo on [vercel.com](https://vercel.com)
3. Add `LINEAR_WEBHOOK_SECRET` and `DISCORD_WEBHOOK_URL` in Environment Variables
4. Deploy — use the Vercel URL for your Linear webhook

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `LINEAR_WEBHOOK_SECRET` | ✅ | Signing secret from Linear webhook settings |
| `DISCORD_WEBHOOK_URL` | ✅ | Discord channel webhook URL |
| `PORT` | ❌ | Local dev port (default: 3000) |

---

## License

MIT
