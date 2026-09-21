import nodemailer from "nodemailer";

// Email is only needed for the signup code and password-reset link.
// Set SMTP_URL (e.g. smtps://user:pass@smtp.sendgrid.net:465) to enable it.
// Without it, nothing is sent: the message is printed to the server log instead.
export function createMailer(env = process.env) {
  const transport = env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL) : null;
  return {
    enabled: Boolean(transport),
    async send({ to, subject, text }) {
      if (!transport) {
        console.log(`[mail not configured] to=${to} subject="${subject}"\n${text}`);
        return;
      }
      await transport.sendMail({ from: env.MAIL_FROM || "Cadence <no-reply@localhost>", to, subject, text });
    },
  };
}
