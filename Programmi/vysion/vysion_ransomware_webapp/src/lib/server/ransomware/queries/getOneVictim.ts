"use server";

import { VictimReportSchema, createApiResponseSchema } from "$lib/schemas/api.schemas";
import { ActionErrors, type ActionResponse } from "$lib/types/action.types";
import { type VictimReport } from "$lib/types/api.types";
import { env } from "$src/env.mjs";

export async function getOneVictimAction(id: string): Promise<ActionResponse<VictimReport>> {
    try {
        const url = `${env.VYSION_API_URL}/api/v1/document/${id}`;
        const res = await fetch(url, {
            method: "GET",
            headers: {
                "x-api-key": env.VYSION_API_KEY,
                Accept: "application/json",
            },
            cache: "no-cache",
        });
        const schema = createApiResponseSchema(VictimReportSchema); // Create the response schema
        const apiResponse = schema.parse(await res.json()); // Validate the response data
        const hit = apiResponse.data.hits[0];
        if (!hit) return { success: false, errorCode: ActionErrors.NOT_FOUND, errorMessage: "Victim report not found" };
        return { success: true, data: hit };
    } catch (error) {
        console.error("Error retrieving victim report", JSON.stringify(error));
        return {
            success: false,
            errorCode: ActionErrors.INTERNAL_SERVER_ERROR,
            errorMessage: "Error retrieving victim report",
        };
    }
}
