"use server";

import { env } from "$src/env.mjs";
import { ActionErrors, type ActionResponse } from "$src/lib/types/action.types";

export async function getUmf(id: string): Promise<ActionResponse<Record<string, unknown>>> {
    const url = `${env.VYSION_API_URL}/api/v1/umf/${id}`;
    try {
        const res = await fetch(url, {
            method: "GET",
            headers: {
                "x-api-key": env.VYSION_API_KEY,
                Accept: "application/json",
            },
            cache: "no-cache",
        });
        if (!res.ok) {
            throw new Error(`Failed to fetch UMF data for victim ${id}`);
        }
        const data = (await res.json()) as Record<string, unknown>;
        return {
            success: true,
            data,
        };
    } catch (error) {
        console.error("Error retrieving UMF data", error);
        return {
            success: false,
            errorCode: ActionErrors.INTERNAL_SERVER_ERROR,
            errorMessage: "Error retrieving UMF data",
        };
    }
}
