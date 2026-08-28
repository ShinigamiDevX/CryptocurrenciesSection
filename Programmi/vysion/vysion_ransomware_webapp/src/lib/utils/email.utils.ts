import { type EmailOptions, mailer } from "../server/mailer";

export async function sendEmail(options: EmailOptions): Promise<boolean> {
    const date = new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
    try {
        return !!(await mailer.sendMail({
            ...options,
            context: { ...options.context, date, year: new Date().getFullYear() },
        }));
    } catch (error) {
        console.error("Error sending email", error);
        return false;
    }
}
