import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import nodemailer from "nodemailer";

// ============================================================
// EMAIL TOOLS
// ============================================================
// Sends emails using Gmail SMTP via nodemailer.
// Always sends FROM kevinbek0301@gmail.com.
// The recipient is provided by the user via Telegram.
//
// Requires GMAIL_APP_PASSWORD in .env
// (Generate at: https://myaccount.google.com/apppasswords)

const SENDER_EMAIL = "kevinbek0301@gmail.com";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: SENDER_EMAIL,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export function emailTools() {
  return [
    tool(
      "send_email",
      "Send an email to someone. The email is always sent from kevinbek0301@gmail.com. Use this when a user asks you to send an email.",
      {
        to: z.string().describe("Recipient email address"),
        subject: z.string().describe("Email subject line"),
        body: z.string().describe("Email body text"),
      },
      async (args) => {
        try {
          const info = await transporter.sendMail({
            from: `"Nematov's Agent" <${SENDER_EMAIL}>`,
            to: args.to,
            subject: args.subject,
            text: args.body,
          });

          console.log(
            `[Tool:send_email] Sent to ${args.to}, id: ${info.messageId}`
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  success: true,
                  messageId: info.messageId,
                  to: args.to,
                }),
              },
            ],
          };
        } catch (err) {
          return {
            content: [
              { type: "text" as const, text: `Error sending email: ${err}` },
            ],
            isError: true,
          };
        }
      }
    ),
  ];
}
