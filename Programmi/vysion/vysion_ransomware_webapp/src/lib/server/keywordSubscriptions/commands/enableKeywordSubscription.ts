"use server";

import { ActionErrors, type ActionResponse } from "$lib/types/action.types";
import { type KeywordSubscription } from "@prisma/client";
import { KeywordSubscriptionsRepository } from "../database/keywordSubscriptions.repository";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/auth";

export async function enableKeywordSubscriptionAction(
    keywordId: string,
    enabled: boolean
): Promise<ActionResponse<KeywordSubscription>> {
    if (!(await getServerSession(authOptions))) {
        return { success: false, errorCode: ActionErrors.UNAUTHORIZED, errorMessage: "Unauthorized" };
    }
    const updatedSubscription = await KeywordSubscriptionsRepository.updateKeywordSubscription(keywordId, { enabled });
    if (!updatedSubscription) {
        return {
            success: false,
            errorCode: ActionErrors.NOT_FOUND,
            errorMessage: "Keyword subscription not found",
        };
    }
    return {
        success: true,
        data: updatedSubscription,
    };
}
