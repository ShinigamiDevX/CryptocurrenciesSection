"use server";

import { GroupDataSchema, createApiResponseSchema } from "$lib/schemas/api.schemas";
import { ActionErrors, type ActionResponse } from "$lib/types/action.types";
import { type ApiCountriesQuery, type ApiData, type ApiDateQuery, type HistogramData } from "$lib/types/api.types";
import { formatHistogram } from "$lib/utils/histogram.utils";
import { getApiQueries } from "$lib/utils/queries.utils";
import { env } from "$src/env.mjs";

export async function getAttackHistogramAction(
    queries?: ApiCountriesQuery & ApiDateQuery
): Promise<ActionResponse<ApiData<HistogramData>>> {
    try {
        const apiQueries = getApiQueries(queries);
        const url = `${env.VYSION_API_URL}/api/v1/ransomware/attack-histogram?${apiQueries?.toString()}`;
        const res = await fetch(url, {
            method: "GET",
            headers: {
                "x-api-key": env.VYSION_API_KEY,
                Accept: "application/json",
            },
            cache: "no-cache",
        });
        const schema = createApiResponseSchema(GroupDataSchema); // Create the response schema
        const apiResponse = schema.parse(await res.json()); // Validate the response data
        const histogram = formatHistogram(apiResponse.data.hits);
        const total = apiResponse.data.total;
        return {
            success: true,
            data: { hits: histogram, total },
        };
    } catch (error) {
        console.error("There was an error retrieving the attack histogram", JSON.stringify(error));
        return {
            success: false,
            errorCode: ActionErrors.INTERNAL_SERVER_ERROR,
            errorMessage: "There was an error retrieving the attack histogram",
        };
    }
}
