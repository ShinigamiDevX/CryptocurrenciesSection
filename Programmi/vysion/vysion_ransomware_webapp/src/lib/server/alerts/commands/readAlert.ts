"use server";

import { ActionErrors, type ActionResponse } from "$lib/types/action.types";
import { type Alert } from "@prisma/client";
import { AlertsRepository } from "../database/alerts.repository";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/auth";

export async function readAlertAction(alertId: string, read: boolean): Promise<ActionResponse<Alert>> {
    if (!(await getServerSession(authOptions))) {
        return { success: false, errorCode: ActionErrors.UNAUTHORIZED, errorMessage: "Unauthorized" };
    }
    const updatedAlert = await AlertsRepository.updateAlert(alertId, { read });
    if (!updatedAlert) {
        return {
            success: false,
            errorCode: ActionErrors.NOT_FOUND,
            errorMessage: "Alert not found",
        };
    }
    return {
        success: true,
        data: updatedAlert,
    };
}
