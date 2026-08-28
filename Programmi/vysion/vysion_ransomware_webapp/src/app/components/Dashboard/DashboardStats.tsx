"use client";

import { type StatWithPercentage } from "$lib/types/api.types";
import { ReportInfo, hasInfoQuery } from "$lib/utils/report.utils";
import { ClockIcon, ExclamationIcon, GlobeIcon, UsersIcon } from "@heroicons/react/solid";
import { Card } from "@tremor/react";
import { useEffect, useState } from "react";
import StatCard from "../Cards/StatCard";
import Loading from "../Utils/Loading";

type Props = {
    attackHistogramTotal?: number;
    percentageSinceLastThirtyDays?: string;
    topCountryStats?: StatWithPercentage[];
    topOneGroup?: StatWithPercentage;
    totalLastTwoDaysAttacks?: number;
    topGroupLastTwoDays?: string;
    infoQueries?: ReportInfo | ReportInfo[];
    loading?: boolean;
};

export default function DashboardStats({
    attackHistogramTotal,
    percentageSinceLastThirtyDays,
    topCountryStats,
    topOneGroup,
    totalLastTwoDaysAttacks,
    topGroupLastTwoDays,
    infoQueries,
    loading,
}: Props) {
    const [country, setCountry] = useState<string>("Others");

    useEffect(() => {
        const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
        if (topCountryStats?.length && topCountryStats[0]?.key && topCountryStats[0]?.key !== "Others") {
            setCountry(countryNames.of(topCountryStats[0].key.toString()) ?? "Others");
        }
    }, [topCountryStats]);

    if (loading) {
        return <LoadingCharts />;
    }

    const getPercentage = (percentage: string | undefined) => {
        if (!percentage || percentage.toLowerCase() === "nan") {
            return "-";
        }
        return `${percentage}%`;
    };

    return (
        <header className="flex flex-wrap gap-4">
            <StatCard
                subtitle="Total Attacks"
                title={attackHistogramTotal?.toString() ?? "No data"}
                icon={ExclamationIcon}
                iconColor="red-500"
                percentage={getPercentage(percentageSinceLastThirtyDays)}
                description="Since the last 30 days"
                disabled={!hasInfoQuery(infoQueries, ReportInfo.TOTAL_ATTACKS)}
            />
            <StatCard
                subtitle="Top Group"
                title={topOneGroup?.key?.toString() ?? "No data"}
                icon={UsersIcon}
                iconColor="orange-500"
                percentage={getPercentage(topOneGroup?.percentage)}
                description="Of total results"
                disabled={!hasInfoQuery(infoQueries, ReportInfo.TOP_GROUP)}
            />
            <StatCard
                subtitle="Top Country"
                title={country}
                icon={GlobeIcon}
                iconColor="pink-500"
                percentage={getPercentage(topCountryStats?.length.toString())}
                description="Of total results"
                disabled={!hasInfoQuery(infoQueries, ReportInfo.TOP_COUNTRY)}
            />
            <StatCard
                subtitle="Last 48h Attacks"
                title={totalLastTwoDaysAttacks?.toString() ?? "No data"}
                icon={ClockIcon}
                iconColor="blue-500"
                percentage={topGroupLastTwoDays}
                description="Most active group"
                disabled={!hasInfoQuery(infoQueries, ReportInfo.LAST_48H_ATTACKS)}
            />
        </header>
    );
}

const LoadingCharts = () => {
    return (
        <div className="flex flex-col gap-4 sm:flex-row print:hidden">
            {Array.from({ length: 4 }, (_, index) => index).map((index) => (
                <Card key={index} className="h-28 flex-grow p-4">
                    <Loading />
                </Card>
            ))}
        </div>
    );
};
