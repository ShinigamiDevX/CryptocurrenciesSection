import { type SelectOption } from "../types/api.types";

export enum ReportInfo {
    ALL = "all",
    ATTACKS_PER_MONTH = "attacks-per-month",
    LAST_48H_ATTACKS = "last-48h-attacks",
    TOTAL_GROUPS = "monitored-groups",
    MOST_ACTIVE_GROUPS = "most-active-groups",
    MOST_ATTACKED_COUNTRIES = "most-attacked-countries",
    TOP_COUNTRY = "top-country",
    TOP_GROUP = "top-group",
    TOTAL_ATTACKS = "total-attacks",
}

export function getReportInfoAsOptions(): SelectOption<ReportInfo>[] {
    return [
        { value: ReportInfo.TOTAL_ATTACKS, label: "Total Attacks" },
        { value: ReportInfo.TOP_GROUP, label: "Top Group" },
        { value: ReportInfo.TOP_COUNTRY, label: "Top Country" },
        { value: ReportInfo.LAST_48H_ATTACKS, label: "Last 48h Attacks" },
        { value: ReportInfo.ATTACKS_PER_MONTH, label: "Attacks per Month" },
        { value: ReportInfo.TOTAL_GROUPS, label: "Total number of groups" },
        { value: ReportInfo.MOST_ACTIVE_GROUPS, label: "Most Active Groups" },
        { value: ReportInfo.MOST_ATTACKED_COUNTRIES, label: "Most Attacked Countries" },
    ];
}

export function hasInfoQuery(infoQueries: ReportInfo | ReportInfo[] | undefined, info: ReportInfo): boolean {
    if (!infoQueries) {
        return true;
    }
    if (!Array.isArray(infoQueries)) {
        return infoQueries === info || infoQueries === ReportInfo.ALL;
    }
    return infoQueries.includes(info) || infoQueries.includes(ReportInfo.ALL);
}
