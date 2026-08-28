"use server";

import { ActionErrors, type ActionResponse } from "$lib/types/action.types";
import { type ApiResponse } from "$lib/types/api.types";
import { env } from "$src/env.mjs";

export async function getTotalVictimsByGroupAction(groupName: string): Promise<ActionResponse<number>> {
    try {
        const url = `${env.VYSION_API_URL}/api/v1/ransomware/count/${groupName}`;
        const res = await fetch(url, {
            method: "GET",
            headers: {
                "x-api-key": env.VYSION_API_KEY,
                Accept: "application/json",
            },
            cache: "no-cache",
        });

        const infoData = (await res.json()) as ApiResponse<null>;
        return { success: true, data: infoData.data.total };
    } catch (error) {
        console.error("There was an error retrieving the victim count", JSON.stringify(error));
        return {
            success: false,
            errorCode: ActionErrors.INTERNAL_SERVER_ERROR,
            errorMessage: "There was an error retrieving the victim count",
        };
    }
}
