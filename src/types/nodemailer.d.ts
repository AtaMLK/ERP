/* eslint-disable @typescript-eslint/no-unused-vars */
declare module 'nodemailer' {
  type TransportOptions = Record<string, unknown>;
  interface Transporter {
    sendMail(options: Record<string, unknown>): Promise<unknown>;
  }
  function createTransport(options: TransportOptions): Transporter;
  const nodemailer: { createTransport: typeof createTransport };
  export default nodemailer;
}
