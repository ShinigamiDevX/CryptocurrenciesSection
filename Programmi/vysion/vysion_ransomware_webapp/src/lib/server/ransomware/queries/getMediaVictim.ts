"use server";

import { env } from "$src/env.mjs";
import { ActionErrors, type ActionResponse } from "$src/lib/types/action.types";

export async function getMediaVictim(
    groupName: string,
    victimId: string
): Promise<
    ActionResponse<{
        image: number[];
        type: string;
    }>
> {
    const url = `${env.VYSION_API_URL}/api/v1/media/${groupName}/${victimId}`;
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
            throw new Error(`[${res.statusText}] Failed to fetch media data for victim ${victimId}`);
        }
        const blob = await res.blob();
        const buffer = await blob.arrayBuffer();
        const data = {
            image: Array.from(new Uint8Array(buffer)),
            type: blob.type,
        };
        return {
            success: true,
            data,
        };
    } catch (error) {
        console.error("Error retrieving media data", error);
        return {
            success: false,
            errorCode: ActionErrors.INTERNAL_SERVER_ERROR,
            errorMessage: "Error retrieving media data",
        };
    }
}
