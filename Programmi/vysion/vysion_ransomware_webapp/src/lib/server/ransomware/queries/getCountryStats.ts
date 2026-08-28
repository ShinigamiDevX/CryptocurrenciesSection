"use server";

import { StatSchema, createApiResponseSchema } from "$lib/schemas/api.schemas";
import { ActionErrors, type ActionResponse } from "$lib/types/action.types";
import { type ApiCountriesQuery, type ApiDateQuery, type Stat, type StatWithPercentage } from "$lib/types/api.types";
import { getApiQueries } from "$lib/utils/queries.utils";
import { env } from "$src/env.mjs";

export async function getCountryStatsAction(
    queries?: ApiCountriesQuery & ApiDateQuery
): Promise<ActionResponse<{ orderedCountryStats: StatWithPercentage[]; topCountryStats: StatWithPercentage[] }>> {
    const apiQueries = getApiQueries(queries);
    const url = `${env.VYSION_API_URL}/api/v1/ransomware/country-stats?${apiQueries?.toString()}`;
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
    const countryStats = apiResponse.data.hits;
    if (!countryStats) {
        return {
            success: false,
            errorCode: ActionErrors.INTERNAL_SERVER_ERROR,
            errorMessage: "There was an error retrieving the country stats",
        };
    }
    const orderedCountryStats = addPercentage(orderStats(countryStats));
    const topCountryStats = addPercentage(getTopTenHits(countryStats));

    return { success: true, data: { orderedCountryStats, topCountryStats } };
}

function orderStats(hits: Stat[]): Stat[] {
    const orderedHits = hits.sort((a, b) => {
        // empty values go to last position
        if (a.key === "") return 1;
        if (b.key === "") return -1;
        return b.doc_count - a.doc_count;
    });
    return orderedHits;
}

function getTopTenHits(groupStatsHits: Stat[]): Stat[] {
    const topNumber = 10;
    const topValues = groupStatsHits.slice(0, topNumber);

    const others = groupStatsHits.slice(topNumber, groupStatsHits.length).reduce((acc, val) => {
        return acc + val.doc_count;
    }, 0);

    topValues.push({ key: "Others", doc_count: others });
    return topValues;
}

function addPercentage(stats: Stat[]): StatWithPercentage[] {
    const totalCounts = !stats.length ? 0 : stats.reduce((acc, val) => acc + val.doc_count, 0);
    const formattedJson = stats.map(({ key, doc_count }) => ({
        key,
        doc_count,
        percentage: totalCounts !== 0 ? ((doc_count / totalCounts) * 100).toFixed(1) : "0",
    }));
    return formattedJson;
}
