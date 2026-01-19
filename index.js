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
function mergeKeyValueArray(arr) {
  // קולט: [ {time:"..."},{temp:4.7},{hum:"80"} ... ]
  // מחזיר: { time:"...", temp:4.7, hum:"80", ... }
  if (!Array.isArray(arr)) return arr || {};
  const out = {};
  for (const obj of arr) {
    if (obj && typeof obj === "object") {
      const [k] = Object.keys(obj);
      out[k] = obj[k];
    }
  }
  return out;
}

function n(v, digits = 0) {
  // מספר יפה (כולל מחרוזות מספר)
  const x = Number(v);
  if (Number.isFinite(x)) return x.toFixed(digits);
  return v ?? "—";
}

function buildHtml({ cityName, now, forecast }) {
  const nowObj = mergeKeyValueArray(now);

  const title = `תחזית מזג אוויר — ${cityName}`;
  const desc = forecast?.lang1 || forecast?.lang0 || "—";
  const dateLine = `${forecast?.day_name ?? ""} ${forecast?.date ?? ""}`.trim();

  const tempNow = n(nowObj.temp, 1);
  const humNow = n(nowObj.hum, 0);
  const pressure = n(nowObj.pressure, 1);
  const windDir = nowObj.winddir ?? "—";
  const windSpd = n(nowObj.windspd, 0);
  const rainToday = n(nowObj.rain, 1);
  const rainChance = n(nowObj.rainchance, 0);
  const sunshine = n(nowObj.sunshinehours, 1);

  const low = n(forecast?.TempLow, 0);
  const high = n(forecast?.TempHigh, 0);
  const night = n(forecast?.TempNight, 0);
  const humDay = n(forecast?.humDay, 0);

  const badge = pickBadge(desc, tempNow);

  return `
  <div style="margin:0;padding:0;background:#f6f7fb;">
    <div style="max-width:640px;margin:0 auto;padding:20px;">
      
      <div style="background:#111827;color:#fff;border-radius:16px;padding:18px 18px 14px;">
        <div style="font-family:Arial,sans-serif;font-size:18px;font-weight:700;direction:rtl">${escapeHtml(title)}</div>
        <div style="font-family:Arial,sans-serif;font-size:13px;opacity:.85;margin-top:6px;direction:rtl">
          ${escapeHtml(dateLine)} · עודכן ${escapeHtml(nowObj.time ?? "")}
        </div>
        <div style="margin-top:10px;display:inline-block;background:rgba(255,255,255,.14);border-radius:999px;padding:6px 10px;font-family:Arial,sans-serif;font-size:12px;">
          ${escapeHtml(badge)}
        </div>
      </div>

      <div style="height:12px"></div>

      <div style="background:#fff;border-radius:16px;padding:16px;border:1px solid #e5e7eb;">
        <div style="font-family:Arial,sans-serif;font-size:14px;font-weight:700;direction:rtl">עכשיו</div>

        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:10px;">
          ${metricCard("🌡️", "טמפרטורה", `${tempNow}°C`)}
          ${metricCard("💧", "לחות", `${humNow}%`)}
          ${metricCard("🧭", "רוח", `${escapeHtml(windDir)} · ${windSpd} קמ״ש`)}
          ${metricCard("🧱", "לחץ", `${pressure} hPa`)}
          ${metricCard("🌧️", "גשם היום", `${rainToday} מ״מ`)}
          ${metricCard("☀️", "שעות שמש", `${sunshine}`)}
        </div>

        <div style="margin-top:10px;font-family:Arial,sans-serif;font-size:12px;color:#6b7280;direction:rtl">
          סיכוי גשם: ${rainChance}%
        </div>
      </div>

      <div style="height:12px"></div>

      <div style="background:#fff;border-radius:16px;padding:16px;border:1px solid #e5e7eb;">
        <div style="font-family:Arial,sans-serif;font-size:14px;font-weight:700;direction:rtl">תחזית</div>

        <div style="margin-top:10px;font-family:Arial,sans-serif;font-size:13px;line-height:1.6;direction:rtl;color:#111827">
          ${escapeHtml(desc)}
        </div>

        <div style="margin-top:12px;display:flex;gap:12px;flex-wrap:wrap;">
          ${metricCard("⬇️", "מינ׳", `${low}°C`)}
          ${metricCard("⬆️", "מקס׳", `${high}°C`)}
          ${metricCard("🌙", "לילה", `${night}°C`)}
          ${metricCard("💦", "לחות יום", `${humDay}%`)}
        </div>
      </div>

      <div style="height:12px"></div>

      <div style="font-family:Arial,sans-serif;font-size:11px;color:#6b7280;text-align:center">
        נשלח אוטומטית דרך GitHub Actions
      </div>
    </div>
  </div>`;
}

function metricCard(icon, label, value) {
  return `
    <div style="flex:1;min-width:140px;background:#f9fafb;border:1px solid #eef2f7;border-radius:14px;padding:12px;">
      <div style="font-family:Arial,sans-serif;font-size:12px;color:#6b7280;direction:rtl">
        <span style="font-size:14px">${icon}</span> ${escapeHtml(label)}
      </div>
      <div style="font-family:Arial,sans-serif;font-size:16px;font-weight:700;margin-top:6px;color:#111827;direction:rtl">
        ${escapeHtml(value)}
      </div>
    </div>
  `;
}

function pickBadge(desc, tempNow) {
  const t = Number(tempNow);
  const d = (desc || "").toLowerCase();
  if (d.includes("גשם") || d.includes("rain")) return "מטריה מומלצת ☔";
  if (d.includes("קרה") || d.includes("frost") || (Number.isFinite(t) && t <= 6)) return "קר במיוחד 🥶";
  if (d.includes("שמש") || d.includes("sun")) return "יש שמש ☀️";
  return "עדכון יומי";
}
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
