"use server";

import { ActionErrors, type ActionResponse } from "$lib/types/action.types";
import { AlertsRepository } from "../database/alerts.repository";

export async function deleteALlAlertsFromUserAction(userId: number): Promise<ActionResponse<boolean>> {
    const deleted = await AlertsRepository.deleteAllAlertsFromUser(userId);
    if (!deleted) {
        return {
            success: false,
            errorCode: ActionErrors.NOT_FOUND,
            errorMessage: "Alert not found",
        };
    }
    return {
        success: true,
        data: deleted,
    };
}
