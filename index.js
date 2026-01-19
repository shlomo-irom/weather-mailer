import fs from "node:fs/promises";
import nodemailer from "nodemailer";

async function fetchJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Fetch failed ${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

function buildHtml({ cityName, now, forecast }) {
  // ה-API של 02ws מחזיר מבנה שעשוי להשתנות; נציג את מה שיש בצורה "עמידה"
  const nowPretty = `<pre style="font-size:12px;white-space:pre-wrap">${escapeHtml(JSON.stringify(now, null, 2))}</pre>`;
  const forecastPretty = `<pre style="font-size:12px;white-space:pre-wrap">${escapeHtml(JSON.stringify(forecast, null, 2))}</pre>`;

  return `
    <div style="font-family:Arial, sans-serif; direction:rtl">
      <h2>תחזית מזג אוויר — ${escapeHtml(cityName)}</h2>
      <h3>עכשיו</h3>
      ${nowPretty}
      <h3>תחזית</h3>
      ${forecastPretty}
      <hr />
      <div style="color:#666;font-size:12px">נשלח אוטומטית דרך GitHub Actions</div>
    </div>
  `;
}

// אם תרצה “יפה” יותר (מינ/מקס/רוח/גשם), אחרי שתריץ פעם אחת ותדביק לי דוגמת JSON,
// נסדר parsing מדויק לשדות.
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendEmail({ to, subject, html }) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  await transporter.sendMail({
    from: process.env.FROM_EMAIL,
    to,
    subject,
    html
  });
}

async function main() {
  const users = JSON.parse(await fs.readFile("./users.json", "utf8"));

  for (const u of users) {
    const [now, forecast] = await Promise.all([
      fetchJson(u.nowUrl),
      fetchJson(u.forecastUrl)
    ]);

    const subject = `תחזית — ${u.cityName}`;
    const html = buildHtml({ cityName: u.cityName, now, forecast });

    await sendEmail({ to: u.email, subject, html });
    console.log(`Sent to ${u.email}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
