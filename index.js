import fs from "node:fs/promises";
import nodemailer from "nodemailer";

async function fetchJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Fetch failed ${res.status} ${res.statusText}: ${text.slice(0, 200)}`
    );
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
  const x = Number(v);
  if (Number.isFinite(x)) return x.toFixed(digits);
  return v ?? "—";
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pickBadge(desc, tempNow) {
  const t = Number(tempNow);
  const d = (desc || "").toLowerCase();
  if (d.includes("גשם") || d.includes("rain")) return "מטריה מומלצת ☔";
  if (d.includes("קרה") || d.includes("frost") || (Number.isFinite(t) && t <= 6))
    return "קר במיוחד 🥶";
  if (d.includes("שמש") || d.includes("sun")) return "יש שמש ☀️";
  return "עדכון יומי";
}

/**
 * גריד יציב למיילים (במקום flex) - 2 כרטיסים בשורה
 * זה מונע “בריחה” של ריבועים מחוץ לתבנית ב-Gmail/Outlook.
 */
function metricGrid(items) {
  const rows = [];
  for (let i = 0; i < items.length; i += 2) {
    const a = items[i];
    const b = items[i + 1];

    rows.push(`
      <tr>
        ${metricTd(a)}
        ${b ? metricTd(b) : `<td style="width:50%;padding:6px;"></td>`}
      </tr>
    `);
  }

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"
      style="width:100%;border-collapse:separate;border-spacing:12px 12px;margin-top:4px;">
      ${rows.join("")}
    </table>
  `;
}

function metricTd(item) {
  const [icon, label, value] = item;
  return `
    <td style="width:50%;padding:0;vertical-align:top;">
      <div style="background:#f9fafb;border:1px solid #eef2f7;border-radius:14px;padding:12px;box-sizing:border-box;width:100%;">
        <div style="font-family:Arial,sans-serif;font-size:12px;color:#6b7280;direction:rtl">
          <span style="font-size:14px">${escapeHtml(icon)}</span> ${escapeHtml(label)}
        </div>
        <div style="font-family:Arial,sans-serif;font-size:16px;font-weight:700;margin-top:6px;color:#111827;direction:rtl">
          ${escapeHtml(value)}
        </div>
      </div>
    </td>
  `;
}

function buildHtml({ cityName, now, forecast }) {
  const nowObj = mergeKeyValueArray(now);

  const title = `תחזית מזג אוויר — ${cityName}`;
  // ⚠️ נשאר בדיוק כמו שביקשת — לא משנים את הטקסט שמגיע מהאתר
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
        <div style="font-family:Arial,sans-serif;font-size:18px;font-weight:700;direction:rtl">${escapeHtml(
          title
        )}</div>
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

        ${metricGrid([
          ["🌡️", "טמפרטורה", `${tempNow}°C`],
          ["💧", "לחות", `${humNow}%`],
          ["🧭", "רוח", `${windDir} · ${windSpd} קמ״ש`],
          ["🧱", "לחץ", `${pressure} hPa`],
          ["🌧️", "גשם היום", `${rainToday} מ״מ`],
          ["☀️", "שעות שמש", `${sunshine}`],
        ])}

        <div style="margin-top:6px;font-family:Arial,sans-serif;font-size:12px;color:#6b7280;direction:rtl">
          סיכוי גשם: ${escapeHtml(rainChance)}%
        </div>
      </div>

      <div style="height:12px"></div>

      <div style="background:#fff;border-radius:16px;padding:16px;border:1px solid #e5e7eb;">
        <div style="font-family:Arial,sans-serif;font-size:14px;font-weight:700;direction:rtl">תחזית</div>

        <div style="margin-top:10px;font-family:Arial,sans-serif;font-size:13px;line-height:1.6;direction:rtl;color:#111827">
          ${escapeHtml(desc)}
        </div>

        ${metricGrid([
          ["⬇️", "מינ׳", `${low}°C`],
          ["⬆️", "מקס׳", `${high}°C`],
          ["🌙", "לילה", `${night}°C`],
          ["💦", "לחות יום", `${humDay}%`],
        ])}
      </div>

      <div style="height:12px"></div>

      <div style="font-family:Arial,sans-serif;font-size:11px;color:#6b7280;text-align:center">
        נשלח אוטומטית דרך GitHub Actions
      </div>
    </div>
  </div>`;
}

async function sendEmail({ to, subject, html }) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.FROM_EMAIL,
    to,
    subject,
    html,
  });
}

async function main() {
  const users = JSON.parse(await fs.readFile("./users.json", "utf8"));

  for (const u of users) {
    const [now, forecast] = await Promise.all([
      fetchJson(u.nowUrl),
      fetchJson(u.forecastUrl),
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
