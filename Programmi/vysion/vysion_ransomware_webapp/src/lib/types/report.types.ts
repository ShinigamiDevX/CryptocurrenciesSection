import { type HistogramData, type Stat, type StatWithPercentage } from "./api.types";

export interface ReportQuery {
    country?: string | string[];
    info?: string | string[];
    start?: string;
    end?: string;
}

export interface ReportStatsData {
    totalAttacks?: number;
    percentageSinceLastMonth?: string;
    topOneGroup?: StatWithPercentage;
    topCountryStats?: StatWithPercentage[];
    totalLastTwoDaysAttacks?: number;
    topGroupLastTwoDays?: string;
}

export interface ReportMonitoredGroupsData {
    attackHistogram?: HistogramData[];
    topGroupStats?: Stat[];
    totalGroups?: number;
    groupHistogram?: HistogramData[];
}

export interface ReportCountryData {
    orderedCountryStats?: StatWithPercentage[];
    topCountryStats?: StatWithPercentage[];
}

export interface DashboardReportData {
    country?: ReportCountryData;
    monitoredGroups?: ReportMonitoredGroupsData;
    stats?: ReportStatsData;
}
