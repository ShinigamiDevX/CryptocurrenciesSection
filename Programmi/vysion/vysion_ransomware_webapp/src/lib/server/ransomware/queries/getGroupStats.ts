"use server";

import { StatSchema, createApiResponseSchema } from "$lib/schemas/api.schemas";
import { ActionErrors, type ActionResponse } from "$lib/types/action.types";
import { type ApiCountriesQuery, type ApiData, type ApiDateQuery, type Stat } from "$lib/types/api.types";
import { getApiQueries } from "$lib/utils/queries.utils";
import { env } from "$src/env.mjs";

export async function getGroupStatsAction(
    queries?: ApiCountriesQuery & ApiDateQuery
): Promise<ActionResponse<ApiData<Stat>>> {
    try {
        const apiQueries = getApiQueries(queries);
        const url = `${env.VYSION_API_URL}/api/v1/ransomware/group-stats?${apiQueries?.toString()}`;
        const res = await fetch(url, {
            method: "GET",
            headers: {
                "x-api-key": env.VYSION_API_KEY,
                Accept: "application/json",
            },
            cache: "no-cache",
        });
        const schema = createApiResponseSchema(StatSchema); // Create the response schema
        const apiResponse = schema.parse(await res.json()); // Validate the response data
        return { success: true, data: apiResponse.data };
    } catch (error) {
        console.error("[Error] - There was an error retrieving the group stats", error);
        return {
            success: false,
            errorCode: ActionErrors.INTERNAL_SERVER_ERROR,
            errorMessage: "There was an error retrieving the group stats",
        };
    }
}
