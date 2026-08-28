import { type GroupData, type HistogramData } from "$lib/types/api.types";

export function formatHistogram(groupData: GroupData[], groupName?: string): HistogramData[] {
    const formattedData = groupData.map((data) => {
        const formattedData: HistogramData = {
            date: data.key_as_string,
            [groupName ?? "value"]: 0,
        };
        if (!groupName && !data.group_by_type) {
            formattedData.value = data.doc_count;
        } else if (data.group_by_type) {
            data.group_by_type.buckets.forEach(({ key, doc_count }) => {
                if (groupName && groupName === key) formattedData[key] = doc_count;
                else if (!groupName) formattedData[key] = doc_count;
            });
        }
        return formattedData;
    });
    // clean all zero values until the first non-zero value
    if (groupName) {
        let i = 0;
        while (i < formattedData.length && formattedData[i]![groupName] === 0) {
            i++;
        }
        formattedData.splice(0, i);
    }
    return formattedData;
}

export function getLastMonthAttacks(data: GroupData[], groupName: string): number {
    const lastMonthData = data[data.length - 2];
    let lastMonthAttacks = 0;
    if (!lastMonthData) return 0;

    if (!lastMonthData.group_by_type) return lastMonthAttacks;
    lastMonthData.group_by_type.buckets.forEach(({ key, doc_count }) => {
        if (groupName === key) {
            lastMonthAttacks = doc_count;
        }
    });
    return lastMonthAttacks;
}
