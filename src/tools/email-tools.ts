import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";

// ============================================================
// EMAIL TOOLS
// ============================================================
// Send & read emails using Gmail.
// Send: SMTP via nodemailer
// Read: IMAP via imapflow
//
// Always uses kevinbek0301@gmail.com
// Requires GMAIL_APP_PASSWORD in .env

const SENDER_EMAIL = "kevinbek0301@gmail.com";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: SENDER_EMAIL,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// Helper to connect to Gmail IMAP and fetch emails
async function fetchEmails(
  folder: string,
  filter: { unseen?: boolean },
  limit: number
) {
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: SENDER_EMAIL,
      pass: process.env.GMAIL_APP_PASSWORD!,
    },
    logger: false,
  });

  await client.connect();

  const lock = await client.getMailboxLock(folder);
  try {
    const emails: Array<{
      from: string;
      subject: string;
      date: string;
      snippet: string;
    }> = [];

    // Build search query
    const searchQuery: Record<string, boolean> = {};
    if (filter.unseen) searchQuery.seen = false;

    const mailbox = client.mailbox;
    const totalMessages = mailbox ? (mailbox as { exists: number }).exists : 0;

    const messages = client.fetch(
      filter.unseen ? { seen: false } : { seq: `${Math.max(1, totalMessages - limit + 1)}:*` },
      { envelope: true, source: false, bodyStructure: true },
      { uid: true }
    );

    let count = 0;
    for await (const msg of messages) {
      if (count >= limit) break;
      const env = msg.envelope;
      if (!env) continue;
      emails.push({
        from: env.from?.[0]
          ? `${env.from[0].name || ""} <${env.from[0].address}>`
          : "Unknown",
        subject: env.subject || "(no subject)",
        date: env.date?.toISOString() || "Unknown",
        snippet: env.subject || "",
      });
      count++;
    }

    return emails;
  } finally {
    lock.release();
    await client.logout();
  }
}

export function emailTools() {
  return [
    // --------------------------------------------------------
    // TOOL: send_email
    // --------------------------------------------------------
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

    // --------------------------------------------------------
    // TOOL: get_emails
    // --------------------------------------------------------
    // Reads emails from Gmail via IMAP.
    // Can fetch from inbox, spam, or only unread.
    tool(
      "get_emails",
      "Get emails from Gmail (kevinbek0301@gmail.com). Can fetch latest emails, unread emails, or spam emails.",
      {
        folder: z
          .enum(["inbox", "spam", "sent"])
          .default("inbox")
          .describe("Which folder to read from: inbox, spam, or sent"),
        unread_only: z
          .boolean()
          .default(false)
          .describe("If true, only return unread/unseen emails"),
        limit: z
          .number()
          .default(5)
          .describe("How many emails to fetch (default 5, max 20)"),
      },
      async (args) => {
        try {
          // Map friendly names to Gmail IMAP folder names
          const folderMap: Record<string, string> = {
            inbox: "INBOX",
            spam: "[Gmail]/Spam",
            sent: "[Gmail]/Sent Mail",
          };

          const imapFolder = folderMap[args.folder] || "INBOX";
          const limit = Math.min(args.limit || 5, 20);

          const emails = await fetchEmails(
            imapFolder,
            { unseen: args.unread_only },
            limit
          );

          if (emails.length === 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `No ${args.unread_only ? "unread " : ""}emails found in ${args.folder}.`,
                },
              ],
            };
          }

          console.log(
            `[Tool:get_emails] Fetched ${emails.length} from ${args.folder}`
          );

          return {
            content: [
              { type: "text" as const, text: JSON.stringify(emails) },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error reading emails: ${err}`,
              },
            ],
            isError: true,
          };
        }
      }
    ),
  ];
}
