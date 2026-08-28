"use server";

import { StatSchema, createApiResponseSchema } from "$lib/schemas/api.schemas";
import { ActionErrors, type ActionResponse } from "$lib/types/action.types";
import { type ApiCountriesQuery, type ApiData, type ApiDateQuery, type Stat } from "$lib/types/api.types";
import { getFormattedDateFrom } from "$lib/utils/date.utils";
import { getApiQueries } from "$lib/utils/queries.utils";
import { env } from "$src/env.mjs";

type RangeAttacksActionQueries = ApiCountriesQuery & ApiDateQuery;

async function getLastRangeDaysAttacks(queries: RangeAttacksActionQueries): Promise<ApiData<Stat> | null> {
    try {
        const apiQueries = getApiQueries(queries);
        const url = `${env.VYSION_API_URL}/api/v1/ransomware/group-stats/?${apiQueries?.toString()}`;
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
        return apiResponse.data;
    } catch (error) {
        console.error(JSON.stringify(error));
        return null;
    }
}

export async function getLastTwoDaysAttacksAction(
    queries?: ApiCountriesQuery & ApiDateQuery
): Promise<ActionResponse<{ total: number; topGroup: string }>> {
    const from = getFormattedDateFrom(2);
    const to = getFormattedDateFrom();
    const lastTwoDaysAttacks = await getLastRangeDaysAttacks({ ...queries, gte: from, lte: to });
    if (!lastTwoDaysAttacks) {
        return {
            success: false,
            errorCode: ActionErrors.INTERNAL_SERVER_ERROR,
            errorMessage: "There was an error retrieving the last two days attacks",
        };
    }

    if (!lastTwoDaysAttacks.hits.length) {
        return { success: true, data: { total: 0, topGroup: "" } };
    }

    const topHitGroup = lastTwoDaysAttacks.hits.reduce((max, hit) => {
        return hit.doc_count > max.doc_count ? hit : max;
    });

    return { success: true, data: { total: lastTwoDaysAttacks.total, topGroup: topHitGroup.key.toString() } };
}

export async function getPercentageSinceLastThirtyDaysAction(
    queries?: ApiCountriesQuery & ApiDateQuery
): Promise<ActionResponse<string>> {
    const fromLastMonth = getFormattedDateFrom(61);
    const toLastMonth = getFormattedDateFrom(31);
    const lastMontAttacks = await getLastRangeDaysAttacks({ ...queries, gte: fromLastMonth, lte: toLastMonth });

    const fromCurrentMonth = getFormattedDateFrom(30);
    const toCurrentMonth = getFormattedDateFrom(0);
    const currentMonthAttacks = await getLastRangeDaysAttacks({
        ...queries,
        gte: fromCurrentMonth,
        lte: toCurrentMonth,
    });
    if (!lastMontAttacks || !currentMonthAttacks) {
        return {
            success: false,
            errorCode: ActionErrors.INTERNAL_SERVER_ERROR,
            errorMessage: "There was an error retrieving the last two months attacks",
        };
    }
    const operation =
        lastMontAttacks.total === 0
            ? currentMonthAttacks.total
            : (currentMonthAttacks.total - lastMontAttacks.total) / lastMontAttacks.total;
    const differencePercentage = (operation * 100).toFixed(1).replace(".0", "");

    return { success: true, data: differencePercentage };
}
