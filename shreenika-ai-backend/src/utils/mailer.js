import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

/* =========================
   EMAIL VERIFICATION
========================= */
export const sendVerificationEmail = async (to, token) => {
  const verifyUrl = `${process.env.FRONTEND_URL}/verify-email/${token}`;

  await transporter.sendMail({
    from: `"Shreenika AI" <${process.env.SMTP_FROM}>`,
    to,
    subject: "Verify your Shreenika AI account",
    html: `
      <h2>Welcome to Shreenika AI</h2>
      <p>Please verify your email:</p>
      <a href="${verifyUrl}">Verify Email</a>
    `
  });
};

/* =========================
   GENERIC MAIL SENDER
========================= */
export const sendMail = async ({ to, subject, html }) => {
  await transporter.sendMail({
    from: `"Shreenika AI" <${process.env.SMTP_FROM}>`,
    to,
    subject,
    html
  });
};
