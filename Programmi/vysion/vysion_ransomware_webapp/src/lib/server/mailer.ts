import { env } from "$src/env.mjs";
import nodemailer, { type Transporter } from "nodemailer";
import hbs from "nodemailer-express-handlebars";
import { type Attachment } from "nodemailer/lib/mailer";

export type EmailOptions = {
    from: string;
    subject: string;
    to?: string;
    cc?: string[];
    bcc?: string[];
    html?: string;
    template?: string;
    context?: Record<string, unknown>;
    attachments?: Attachment[];
};

export type TransporterWithHbs = Transporter & {
    sendMail: (options: EmailOptions) => Promise<unknown>;
};

const globalForMailer = globalThis as unknown as {
    mailer: TransporterWithHbs | undefined;
};

export const mailer =
    globalForMailer.mailer ??
    (nodemailer
        .createTransport({
            host: env.MAIL_DOMAIN,
            port: 587,
            secure: false,
            auth: {
                user: env.MAIL_USER,
                pass: env.MAIL_PASSWORD,
            },
            tls: { rejectUnauthorized: false },
            debug: true,
        })
        .use(
            "compile",
            hbs({
                viewEngine: {
                    extname: ".hbs",
                    layoutsDir: "public/templates",
                    partialsDir: "public/templates",
                    defaultLayout: "alert",
                },
                viewPath: "public/templates",
                extName: ".hbs",
            })
        ) as TransporterWithHbs);

if (env.NODE_ENV !== "production") globalForMailer.mailer = mailer;
