"use server";

import { ActionErrors, type ActionResponse } from "$lib/types/action.types";
import { type AlertType, type KeywordSubscription } from "@prisma/client";
import { getServerSession } from "next-auth";
import { AlertKeywordsRepository } from "../../alertKeywords/database/alertKeywords.repository";
import { authOptions } from "../../auth/auth";
import { KeywordSubscriptionsRepository } from "../database/keywordSubscriptions.repository";

export async function addKeywordSubscriptionAction(
    userId: number,
    keyword: string,
    type: AlertType
): Promise<ActionResponse<KeywordSubscription>> {
    if (!(await getServerSession(authOptions))) {
        return { success: false, errorCode: ActionErrors.UNAUTHORIZED, errorMessage: "Unauthorized" };
    }
    // Check if keyword already exists
    let alertKeyword = await AlertKeywordsRepository.getAlertKeyword({ keyword, type });
    if (!alertKeyword) {
        alertKeyword = await AlertKeywordsRepository.createAlertKeyword({
            keyword,
            type,
        });
        if (!alertKeyword) {
            return {
                success: false,
                errorCode: ActionErrors.CONFLICT,
                errorMessage: "Error creating new keyword, keyword already exists",
            };
        }
    }
    const createdSubscription = await KeywordSubscriptionsRepository.createKeywordSubscription(
        userId,
        alertKeyword.keyword,
        alertKeyword.type
    );
    if (!createdSubscription) {
        return { success: false, errorCode: ActionErrors.CONFLICT, errorMessage: "Error creating new subscription" };
    }
    return { success: true, data: createdSubscription };
}
