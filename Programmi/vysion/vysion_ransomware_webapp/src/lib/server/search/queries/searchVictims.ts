"use server";

import { VictimReportSchema, createApiResponseSchema } from "$lib/schemas/api.schemas";
import { ActionErrors, type ActionResponse } from "$lib/types/action.types";
import { type ApiData, type VictimReport } from "$lib/types/api.types";
import { type SearchDto } from "$lib/types/dto.types";
import { env } from "$src/env.mjs";
import { getApiQueries } from "$src/lib/utils/queries.utils";

export async function searchVictimsAction(
    searchDto: Partial<SearchDto>,
    group?: string
): Promise<ActionResponse<ApiData<VictimReport>>> {
    const { q: query, c: country, ...queries } = searchDto;
    try {
        const apiQueries = getApiQueries({
            ...queries,
            group,
            query,
            countries: country ? (Array.isArray(country) ? country : [country]) : undefined,
        });
        const url = new URL(`${env.VYSION_API_URL}/api/v1/search?${apiQueries?.toString()}`);
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
        return { success: true, data: apiResponse.data };
    } catch (error) {
        console.error("Error retrieving the search results", JSON.stringify(error));
        return {
            success: false,
            errorCode: ActionErrors.INTERNAL_SERVER_ERROR,
            errorMessage: "Error retrieving the search results",
        };
    }
}
