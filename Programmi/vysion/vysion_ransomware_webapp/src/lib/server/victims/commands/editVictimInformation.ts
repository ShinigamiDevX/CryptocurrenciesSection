"use server";

import { ActionErrors, type ActionResponse } from "$lib/types/action.types";
import { type EditVictimReportDTO } from "$lib/types/api.types";
import { env } from "$src/env.mjs";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/auth";

export async function editVictimInformationAction(form: EditVictimReportDTO): Promise<ActionResponse<unknown>> {
    try {
        if (!(await getServerSession(authOptions))) {
            return { success: false, errorCode: ActionErrors.UNAUTHORIZED, errorMessage: "Unauthorized" };
        }
        const { id, ...data } = form;
        const queries = new URLSearchParams(data);
        const url = `${env.VYSION_API_URL}/api/v1/document/${id}?${queries.toString()}`;
        const res = await fetch(url, {
            method: "PUT",
            headers: {
                "x-api-key": env.VYSION_API_KEY,
                Accept: "application/json",
            },
            cache: "no-cache",
        });
        const resData = (await res.json()) as { successful: number };
        if (resData.successful !== 1) {
            throw new Error("Failed to update victim information");
        }
        return { success: true, data: undefined };
    } catch (error) {
        console.error("[Error] editVictimInformation => ", error);
        return {
            success: false,
            errorCode: ActionErrors.BAD_REQUEST,
            errorMessage: "Something went wrong while updating victim information",
        };
    }
}
