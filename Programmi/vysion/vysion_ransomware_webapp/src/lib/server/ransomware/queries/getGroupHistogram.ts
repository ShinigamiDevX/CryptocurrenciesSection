"use server";

import { GroupDataSchema, createApiResponseSchema } from "$lib/schemas/api.schemas";
import { ActionErrors, type ActionResponse } from "$lib/types/action.types";
import { type ApiCountriesQuery, type ApiDateQuery, type GroupData, type HistogramData } from "$lib/types/api.types";
import { formatHistogram, getLastMonthAttacks } from "$lib/utils/histogram.utils";
import { getApiQueries } from "$lib/utils/queries.utils";
import { env } from "$src/env.mjs";

interface HistogramQuery {
    queries?: ApiCountriesQuery & ApiDateQuery;
}

interface HistogramActionData extends HistogramQuery {
    groupName?: string;
}

interface LastMonthHistogramData extends HistogramActionData {
    groupName: string;
}

export async function getGroupHistogramAction(data?: HistogramActionData): Promise<ActionResponse<HistogramData[]>> {
    const groupHistogramData = await getGroupHistogramData(data?.queries);
    if (!groupHistogramData) {
        return {
            success: false,
            errorCode: ActionErrors.INTERNAL_SERVER_ERROR,
            errorMessage: "There was an error retrieving the group histogram",
        };
    }
    const formattedHistogram = formatHistogram(groupHistogramData, data?.groupName);
    return { success: true, data: formattedHistogram };
}

export async function getLastMonthGroupAttacksAction(data: LastMonthHistogramData): Promise<ActionResponse<number>> {
    const groupStatsDataHits = await getGroupHistogramData(data?.queries);
    if (!groupStatsDataHits) {
        return {
            success: false,
            errorCode: ActionErrors.INTERNAL_SERVER_ERROR,
            errorMessage: "There was an error getting group attacks from last month",
        };
    }
    const lastMonthAttacks = getLastMonthAttacks(groupStatsDataHits, data.groupName);
    return { success: true, data: lastMonthAttacks };
}

async function getGroupHistogramData(queries?: ApiCountriesQuery & ApiDateQuery): Promise<GroupData[] | null> {
    try {
        const apiQueries = getApiQueries(queries);
        const url = `${env.VYSION_API_URL}/api/v1/ransomware/group-histogram?${apiQueries?.toString()}`;
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
        return apiResponse.data.hits;
    } catch (error) {
        console.error("Error getting group histogram", JSON.stringify(error));
        return null;
    }
}
