"use server";

import { ActionErrors, type ActionResponse } from "$lib/types/action.types";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/auth";
import { AlertsRepository } from "../database/alerts.repository";

export async function markAllAlertsFromUserAsReadAction(userId: number): Promise<ActionResponse<boolean>> {
    if (!(await getServerSession(authOptions))) {
        return { success: false, errorCode: ActionErrors.UNAUTHORIZED, errorMessage: "Unauthorized" };
    }
    const updatedAlerts = await AlertsRepository.markAllAlertsFromUserAsRead(userId);
    if (!updatedAlerts) {
        return {
            success: false,
            errorCode: ActionErrors.NOT_FOUND,
            errorMessage: "Alert not found",
        };
    }
    return {
        success: true,
        data: updatedAlerts,
    };
}
