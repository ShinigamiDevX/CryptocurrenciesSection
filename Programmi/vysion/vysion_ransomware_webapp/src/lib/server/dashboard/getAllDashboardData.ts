"use server";

import { type ApiCountriesQuery, type ApiDateQuery, type ReportQuery } from "$src/lib/types/api.types";
import {
    getLastTwoDaysAttacksAction,
    getPercentageSinceLastThirtyDaysAction,
} from "../ransomware/queries/getAttackFilter";
import { getAttackHistogramAction } from "../ransomware/queries/getAttackHistogram";
import { getCountryStatsAction } from "../ransomware/queries/getCountryStats";
import { getGroupHistogramAction } from "../ransomware/queries/getGroupHistogram";
import { getTopGroupStatsAction } from "../ransomware/queries/getTopGroupStats";

async function fetchTopGroupStats(params: ApiCountriesQuery & ApiDateQuery) {
    const res = await getTopGroupStatsAction(params);
    if (!res.success) {
        throw new Error(res.errorMessage);
    }
    const { topGroupStats, totalGroups, topOneGroup } = res.data;
    return { topGroupStats, totalGroups, topOneGroup };
}

async function fetchAttackHistogram(params: ApiCountriesQuery & ApiDateQuery) {
    const res = await getAttackHistogramAction(params);
    if (!res.success) {
        throw new Error(res.errorMessage);
    }
    return res.data;
}

async function fetchGroupHistogram(params: ApiCountriesQuery & ApiDateQuery) {
    const res = await getGroupHistogramAction({ queries: params });
    if (!res.success) {
        throw new Error(res.errorMessage);
    }
    return res.data;
}

async function fetchCountryStats(params: ApiCountriesQuery & ApiDateQuery) {
    const res = await getCountryStatsAction(params);
    if (!res.success) {
        throw new Error(res.errorMessage);
    }
    const { orderedCountryStats, topCountryStats } = res.data;
    return { orderedCountryStats, topCountryStats };
}

async function fetchLastTwoDaysAttacks(params: ApiCountriesQuery & ApiDateQuery) {
    const res = await getLastTwoDaysAttacksAction(params);
    if (!res.success) {
        throw new Error(res.errorMessage);
    }
    return res.data;
}

async function fetchPercentageSinceLastThirtyDays(params: ApiCountriesQuery & ApiDateQuery) {
    const res = await getPercentageSinceLastThirtyDaysAction(params);
    if (!res.success) {
        throw new Error(res.errorMessage);
    }
    return res.data;
}

export async function getAllDashboardData(queries: Omit<ReportQuery, "info">) {
    const params: ApiCountriesQuery & ApiDateQuery = {
        countries: queries?.country
            ? Array.isArray(queries.country)
                ? queries.country
                : [queries.country]
            : undefined,
        gte: queries?.start,
        lte: queries?.end,
    };
    if (queries?.country?.includes("all")) {
        delete params.countries;
    }
    const topGroupStatsPromise = fetchTopGroupStats(params);
    const attackHistogramPromise = fetchAttackHistogram(params);
    const groupHistogramPromise = fetchGroupHistogram(params);
    const countryStatsPromise = fetchCountryStats(params);
    const lastTwoDaysAttacksPromise = fetchLastTwoDaysAttacks(params);
    const percentageSinceLastThirtyDaysPromise = fetchPercentageSinceLastThirtyDays(params);
    try {
        const [
            totalGroupsStats,
            attackHistogram,
            groupHistogram,
            countryStats,
            lastTwoDaysAttacks,
            percentageSinceLastThirtyDays,
        ] = await Promise.all([
            topGroupStatsPromise,
            attackHistogramPromise,
            groupHistogramPromise,
            countryStatsPromise,
            lastTwoDaysAttacksPromise,
            percentageSinceLastThirtyDaysPromise,
        ]);
        return {
            totalGroupsStats,
            attackHistogram,
            groupHistogram,
            countryStats,
            lastTwoDaysAttacks,
            percentageSinceLastThirtyDays,
        };
    } catch (error) {
        console.error("[Error] getAllDashboardData =>", error);
        return undefined;
    }
}
