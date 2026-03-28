"use strict";

const express = require("express");
const crypto  = require("crypto");
const https   = require("https");
const { URL } = require("url");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.raw({ type: "application/json" }));

app.get("/", (_req, res) => {
  res.status(200).send("Linear → Discord bridge is running ✅");
});

app.post("/webhook", async (req, res) => {
  const signature = req.headers["linear-signature"];
  const secret    = process.env.LINEAR_WEBHOOK_SECRET;

  if (!secret) {
    return res.status(500).json({ error: "Server misconfiguration." });
  }

  if (!verifyLinearSignature(req.body, signature, secret)) {
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

  const title       = data?.title       || "Untitled Issue";
  const identifier  = data?.identifier  || "";
  const url         = data?.url         || null;
  const priorityNum = data?.priority    ?? 0;
  const description = data?.description || null;

  const projects = data?.project
    ? [data.project.name]
    : data?.projects?.nodes?.map(p => p.name) || [];

  try {
    await sendDiscordMessage({
      title,
      identifier,
      url,
      priorityNum,
      description,
      projects
    });
    return res.status(200).json({ message: "OK" });
  } catch {
    return res.status(200).json({ message: "Discord failed" });
  }
});

// ─────────────────────────────────────────────────────────────

function verifyLinearSignature(body, signature, secret) {
  if (!signature) return false;
  try {
    const digest = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(signature, "utf8"),
      Buffer.from(digest,    "utf8")
    );
  } catch {
    return false;
  }
}

function priorityInfo(priority) {
  const map = {
    0: { label: "No Priority", color: 0x95a5a6 },
    1: { label: "Urgent",      color: 0xe74c3c },
    2: { label: "High",        color: 0xe67e22 },
    3: { label: "Medium",      color: 0xf1c40f },
    4: { label: "Low",         color: 0x3498db },
  };
  return map[priority] ?? map[0];
}

function sendDiscordMessage({ title, identifier, url, priorityNum, description, projects }) {
  return new Promise((resolve, reject) => {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return reject(new Error("Missing webhook URL"));

    const { label, color } = priorityInfo(priorityNum);

    const descriptionText = description
      ? description.slice(0, 300) + (description.length > 300 ? "…" : "")
      : "*No description provided.*";

    const projectText = projects.length > 0
      ? projects.join(", ")
      : "No Project";

    const metaRow = `**Priority:** ${label}\u2003•\u2003**Project:** ${projectText}`;

    const viewLink = url ? `**[View in Linear →](${url})**` : "";

    // Big heading using Discord markdown (only works in description, not embed title)
    const headingTitle = identifier
      ? `# ${identifier}: ${title}`
      : `# ${title}`;

    const lines = [
      headingTitle,
      metaRow,
      "",
      `> ${descriptionText}`
    ];

    if (viewLink) {
      lines.push("");
      lines.push(viewLink);
    }

    const embed = {
      color,
      description: lines.join("\n"),
      footer: { text: "Linear" },
      timestamp: new Date().toISOString(),
    };

    const body = JSON.stringify({ embeds: [embed] });

    const parsed = new URL(webhookUrl);

    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Discord error ${res.statusCode}`));
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// Keep local dev working, but export for Vercel
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Running on port ${PORT}`);
  });
}

module.exports = app;
