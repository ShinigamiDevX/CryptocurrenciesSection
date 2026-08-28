import { type ActionResponse } from "$lib/types/action.types";
import { AlertFrequency, type UserSettings } from "$lib/types/user.types";
import { sendEmail } from "$lib/utils/email.utils";
import { env } from "$src/env.mjs";
import { type Alert } from "@prisma/client";
import { UsersRepository } from "../../users/database/users.repository";

export async function sendRealTimeAlertsAction(alerts: Alert[]): Promise<ActionResponse<string>> {
    let emailsSent = 0;
    // group alerts by user
    const alertsByUser: Record<number, Alert[]> = {};
    for (const alert of alerts) {
        alertsByUser[alert.userId] ??= [];
        alertsByUser[alert.userId]!.push(alert);
    }
    for (const userId in alertsByUser) {
        const numericUserId = Number(userId);
        const user = await UsersRepository.getUserById(numericUserId);
        if (!user) {
            console.error(`User ${userId} not found`);
            continue;
        }
        const settings = user.settings as UserSettings; // Parse the settings JSON
        if (!settings.emailAlerts) {
            console.info(`User ${userId} has email notifications disabled`);
            continue;
        }
        if (settings.alertFrequency !== AlertFrequency.REALTIME) {
            continue;
        }
        const alertsList = alertsByUser[userId]!.map((alert) => ({
            keyword: alert.keyword,
            type: alert.type,
            newHits: alert.newHits,
            createdAt: alert.createdAt.toUTCString(),
        }));
        const sentMail = await sendEmail({
            from: `"Vysion Ransomware Alerts Service" ${env.MAIL_FROM}`,
            to: user.email,
            subject: "Vysion Ransomware Alert: New detections for your keyword",
            template: "alert",
            context: {
                userId: user.id,
                userName: user.name,
                year: new Date().getFullYear(),
                alertsList,
            },
        });
        if (!sentMail) {
            console.error(`Error sending email to user ${userId}`);
            continue;
        }
        emailsSent++;
    }
    console.info(`Sent ${emailsSent} alert emails`);
    return { success: true, data: `${emailsSent} alert emails sent` };
}
