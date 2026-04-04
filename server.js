"use strict";

const express = require("express");
const crypto  = require("crypto");
const https   = require("https");
const { URL } = require("url");

const app  = express();
const PORT = process.env.PORT || 3000;

// raw body needed for signature verification
app.use(express.raw({ type: "application/json" }));

app.get("/", (_req, res) => {
  res.status(200).send("Linear -> Discord bridge is running ✅");
});

app.post("/webhook", async (req, res) => {
  const signature = req.headers["linear-signature"];
  const secret    = process.env.LINEAR_WEBHOOK_SECRET;

  if (!secret) {
    log("error", "LINEAR_WEBHOOK_SECRET not set");
    return res.status(500).json({ error: "Server misconfiguration." });
  }

  if (!verifySignature(req.body, signature, secret)) {
    log("warn", "Invalid signature — rejected");
    return res.status(401).json({ error: "Invalid signature." });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "Malformed JSON." });
  }

  const { type, action, data } = payload;

  if (type !== "Issue" || action !== "create") {
    return res.status(200).json({ message: "Ignored" });
  }

  const issue = parseIssue(data);
  log("info", `New issue: ${issue.identifier} – ${issue.title}`);

  try {
    await sendDiscordEmbed(issue);
    return res.status(200).json({ message: "OK" });
  } catch (err) {
    // 200 so Linear doesn't retry
    log("error", `Discord failed: ${err.message}`);
    return res.status(200).json({ message: "Discord delivery failed" });
  }
});

// ─────────────────────────────────────────────────────────────

function log(level, message) {
  const out = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`;
  if (level === "error") console.error(out);
  else if (level === "warn") console.warn(out);
  else console.log(out);
}

function verifySignature(body, signature, secret) {
  if (!signature) return false;
  try {
    const digest = crypto.createHmac("sha256", secret).update(body).digest("hex");
    const a = Buffer.from(signature, "utf8");
    const b = Buffer.from(digest, "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function parseIssue(data) {
  return {
    title:       data?.title       || "Untitled Issue",
    identifier:  data?.identifier  || "",
    url:         data?.url         || null,
    priority:    data?.priority    ?? 0,
    description: data?.description || null,
    projects:    data?.project
      ? [data.project.name]
      : (data?.projects?.nodes?.map(p => p.name) ?? []),
  };
}

const PRIORITY = {
  0: { label: "No Priority", color: 0x95a5a6 },
  1: { label: "Urgent",      color: 0xe74c3c },
  2: { label: "High",        color: 0xe67e22 },
  3: { label: "Medium",      color: 0xf1c40f },
  4: { label: "Low",         color: 0x3498db },
};

function sendDiscordEmbed({ title, identifier, url, priority, description, projects }) {
  return new Promise((resolve, reject) => {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return reject(new Error("DISCORD_WEBHOOK_URL not set"));

    const { label, color } = PRIORITY[priority] ?? PRIORITY[0];

    const desc = description
      ? description.slice(0, 300) + (description.length > 300 ? "…" : "")
      : "*No description provided.*";

    const heading  = identifier ? `# ${identifier}: ${title}` : `# ${title}`;
    const meta     = `**Priority:** ${label}\u2003•\u2003**Project:** ${projects.join(", ") || "No Project"}`;
    const viewLink = url ? `**[View in Linear ->](${url})**` : "";

    const lines = [heading, meta, "", `> ${desc}`];
    if (viewLink) lines.push("", viewLink);

    const embed = {
      color,
      description: lines.join("\n"),
      footer:      { text: "Linear" },
      timestamp:   new Date().toISOString(),
    };

    const body   = JSON.stringify({ embeds: [embed] });
    const parsed = new URL(webhookUrl);

    const req = https.request(
      {
        hostname: parsed.hostname,
        path:     parsed.pathname + parsed.search,
        method:   "POST",
        headers:  {
          "Content-Type":   "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve();
          else reject(new Error(`Discord ${res.statusCode}: ${raw.slice(0, 200)}`));
        });
      }
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────

if (require.main === module) {
  app.listen(PORT, () => log("info", `Running on port ${PORT}`));
}

module.exports = app;
