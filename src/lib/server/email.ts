import nodemailer from 'nodemailer';
import { PoolClient } from 'pg';

function transporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !process.env.SMTP_FROM) throw new Error('SMTP is not configured');
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: user ? { user, pass } : undefined });
}

export async function sendDocumentEmail(client: PoolClient, args: { userId: number; recipient: string; subject: string; html: string; template: string }) {
  const sentAt = new Date();
  try {
    await transporter().sendMail({ from: process.env.SMTP_FROM, to: args.recipient, subject: args.subject, html: args.html });
    await client.query(`INSERT INTO email_logs(recipient,subject,template,status,sent_at) VALUES($1,$2,$3,'SENT',$4)`, [args.recipient, args.subject, args.template, sentAt]);
    return { success: true };
  } catch (error:any) {
    await client.query(`INSERT INTO email_logs(recipient,subject,template,status,error_message) VALUES($1,$2,$3,'FAILED',$4)`, [args.recipient, args.subject, args.template, String(error?.message || error)]);
    throw error;
  }
}
