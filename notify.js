import nodemailer from "nodemailer";

function hasSmtp() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function notifyEmail({ to, subject, text }) {
  if (!hasSmtp()) {
    console.log("[notify] SMTP not configured ->", { to, subject, text });
    return { ok: true, mode: "log" };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
  });

  return { ok: true, mode: "smtp" };
}
