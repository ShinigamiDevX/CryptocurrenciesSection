"use server";

import { ActionErrors, type ActionResponse } from "$lib/types/action.types";
import { type ApiCountriesQuery, type ApiDateQuery, type Stat, type StatWithPercentage } from "$lib/types/api.types";
import { getGroupStatsAction } from "./getGroupStats";

export async function getTopGroupStatsAction(
    queries?: ApiCountriesQuery & ApiDateQuery
): Promise<ActionResponse<{ topGroupStats: Stat[]; topOneGroup: StatWithPercentage; totalGroups: number }>> {
    try {
        const res = await getGroupStatsAction(queries);
        if (!res.success) {
            return {
                success: false,
                errorCode: res.errorCode,
                errorMessage: res.errorMessage,
            };
        }
        const groupStats = res.data.hits;
        const topGroupStats = getTopHits(groupStats);
        const topOneGroup = getTopOneGroup(topGroupStats);
        const totalGroups = groupStats.length;

        return {
            success: true,
            data: {
                totalGroups,
                topGroupStats,
                topOneGroup,
            },
        };
    } catch (error) {
        console.error("There was an error retrieving the top group stats", JSON.stringify(error));
        return {
            success: false,
            errorCode: ActionErrors.INTERNAL_SERVER_ERROR,
            errorMessage: "There was an error retrieving the top group stats",
        };
    }
}

function getTopHits(groupStats: Stat[]): Stat[] {
    const topNumber = 6;
    const topValues = groupStats.slice(0, topNumber - 1);
    const others = groupStats.slice(topNumber, groupStats.length).reduce((acc, val) => {
        return acc + val.doc_count;
    }, 0);

    topValues.push({ key: "Others", doc_count: others });
    return topValues;
}

function getTopOneGroup(groupStats: Stat[]): StatWithPercentage {
    if (!groupStats.length) return { key: "No data", doc_count: 0, percentage: "0" };
    const topGroup = groupStats[0]!;
    const totalDocCount = groupStats.reduce((acc, item) => acc + item.doc_count, 0);
    const percentage = ((topGroup.doc_count / totalDocCount) * 100).toFixed(1).replace(".0", "");
    const topOneGroup = { ...topGroup, percentage };
    return topOneGroup;
}
