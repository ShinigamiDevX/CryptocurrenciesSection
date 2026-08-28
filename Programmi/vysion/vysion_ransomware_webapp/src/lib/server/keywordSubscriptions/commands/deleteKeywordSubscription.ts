"use server";

import { ActionErrors, type ActionResponse } from "$lib/types/action.types";
import { type AlertType } from "@prisma/client";
import { getServerSession } from "next-auth";
import { AlertKeywordsRepository } from "../../alertKeywords/database/alertKeywords.repository";
import { authOptions } from "../../auth/auth";
import { UsersRepository } from "../../users/database/users.repository";
import { KeywordSubscriptionsRepository } from "../database/keywordSubscriptions.repository";

export async function deleteKeywordSubscriptionAction(keyword: string, type: AlertType): Promise<ActionResponse<boolean>> {
    if (!(await getServerSession(authOptions))) {
        return { success: false, errorCode: ActionErrors.UNAUTHORIZED, errorMessage: "Unauthorized" };
    }
    // check if more users are subscribed to this keyword
    const subscribedUsers = await UsersRepository.getUsersSubscribedToKeyword({ keyword, type });
    if (subscribedUsers.length > 1) {
        // if more than one user is subscribed, just remove the subscription
        const deletedSubscription = await KeywordSubscriptionsRepository.deleteKeywordSubscription(keyword);
        if (!deletedSubscription) {
            return {
                success: false,
                errorCode: ActionErrors.NOT_FOUND,
                errorMessage: "Error deleting keyword subscription",
            };
        }
        return { success: true, data: deletedSubscription };
    }
    // if only one user is subscribed, delete the keyword
    const deletedKeyword = await AlertKeywordsRepository.deleteAlertKeyword({ keyword, type });
    if (!deletedKeyword) {
        return { success: false, errorCode: ActionErrors.NOT_FOUND, errorMessage: "Error deleting keyword" };
    }
    return { success: true, data: deletedKeyword };
}
