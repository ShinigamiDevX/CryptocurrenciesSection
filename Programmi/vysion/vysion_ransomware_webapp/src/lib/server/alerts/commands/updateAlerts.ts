"use server";

import { ActionErrors, type ActionResponse } from "$lib/types/action.types";
import { formatKeyword, searchForKeyword } from "$lib/utils/alert.utils";
import { type Alert, AlertType } from "@prisma/client";
import { AlertKeywordsRepository } from "../../alertKeywords/database/alertKeywords.repository";
import { UsersRepository } from "../../users/database/users.repository";
import { AlertsRepository } from "../database/alerts.repository";

export async function updateAlertsAction(): Promise<ActionResponse<Alert[]>> {
    const keywords = await AlertKeywordsRepository.getAlertKeywords();
    if (!keywords.length) {
        return {
            success: false,
            errorCode: ActionErrors.NOT_FOUND,
            errorMessage: "No keywords found",
        };
    }
    const keywordUpdates: {
        keyword: string;
        type: string;
        newHits: number;
        newNotifications: number;
    }[] = [];
    const createdAlerts: Alert[] = [];
    for (const dbKeyword of keywords) {
        const { keyword, type, updatedAt } = dbKeyword;
        const res = await searchForKeyword(keyword, type);
        if (!res.success) {
            console.error(`Error searching for keyword ${keyword}`);
            continue;
        }
        const updatedKeyword = await AlertKeywordsRepository.updateAlertKeyword({
            keyword,
            type,
            updatedAt: new Date(),
        });
        if (!updatedKeyword) {
            console.error(`Error updating keyword ${keyword}`);
            continue;
        }

        // Get the total hits in the time range
        const newHits = res.data.hits.filter((hit) => hit.detectionDate.getTime() >= updatedAt.getTime()).length;

        let newNotifications = 0;
        // Create alerts for users subscribed to this keyword
        const users = await UsersRepository.getUsersSubscribedToKeyword({ keyword, type });
        // Create alerts for the users
        for (const user of users) {
            if (newHits <= 0) continue;
            const timeRange = Date.now() - updatedAt.getTime();
            const platform =
                type === AlertType.darknet
                    ? "new hits detected on the Darknet for keyword"
                    : type === AlertType.group
                        ? "new victims have been attacked by group"
                        : "new victims have been detected in country";
            const message = `${newHits} ${platform} ${formatKeyword(keyword, type)}`;
            const htmlMessage = `<strong>${newHits}</strong> ${platform} <strong>${formatKeyword(keyword, type)}</strong>`;
            const newAlert = await AlertsRepository.createAlert({
                userId: user.id,
                keyword,
                type,
                message,
                htmlMessage,
                newHits,
                timeRange,
            });
            if (!newAlert) {
                console.error(`Error creating alert for user ${user.id} and keyword ${keyword}`);
                continue;
            }
            createdAlerts.push(newAlert);
            newNotifications++;
            keywordUpdates.push({
                keyword: keyword,
                type,
                newHits,
                newNotifications,
            });
        }
    }

    keywordUpdates.length ? console.table(keywordUpdates) : console.info("No alerts created");

    return {
        success: true,
        data: createdAlerts,
    };
}
