"use server";

import { ActionErrors, type ActionResponse } from "$lib/types/action.types";
import { AlertFrequency, type UserSettings } from "$lib/types/user.types";
import { sendEmail } from "$lib/utils/email.utils";
import { env } from "$src/env.mjs";
import { type Alert } from "@prisma/client";
import { AlertsRepository } from "../../alerts/database/alerts.repository";
import { UsersRepository } from "../../users/database/users.repository";

export async function sendScheduledAlertsAction(frequency: AlertFrequency): Promise<ActionResponse<string>> {
    let latestDate;
    switch (frequency) {
        case AlertFrequency.DAILY:
            latestDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
            break;
        case AlertFrequency.WEEKLY:
            latestDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            break;
        case AlertFrequency.MONTHLY:
            latestDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            break;
        default:
            return { success: false, errorCode: ActionErrors.BAD_REQUEST, errorMessage: "Invalid frequency" };
    }
    const latestAlerts = await AlertsRepository.getAlertsFromRange(latestDate, new Date());

    const alertsByUser: Record<string, Alert[]> = {};
    for (const alert of latestAlerts) {
        alertsByUser[alert.userId] ??= [];
        alertsByUser[alert.userId]!.push(alert);
    }

    let emailsSent = 0;
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
        if (settings.alertFrequency !== frequency) {
            continue;
        }

        const alertsList = alertsByUser[userId]?.map((alert) => ({
            keyword: alert.keyword,
            type: alert.type,
            newHits: alert.newHits,
            createdAt: alert.createdAt.toUTCString(),
        }));

        const sentMail = await sendEmail({
            from: `"Vysion Alerts Service" ${env.MAIL_FROM}`,
            to: user.email,
            subject: `Vysion Ransomware ${frequency.charAt(0).toUpperCase() + frequency.slice(1)} Report: New detections for your keywords`,
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
    console.info(`Sent ${emailsSent} ${frequency} alert emails`);
    return { success: true, data: `${emailsSent} ${frequency} alert emails sent` };
}
