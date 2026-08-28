/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
"use client";

import { type ReportQuery } from "$lib/types/api.types";
import { getQueryParams } from "$lib/utils/queries.utils";
import { ReportInfo, hasInfoQuery } from "$lib/utils/report.utils";
import { getAllDashboardData } from "$src/lib/server/dashboard/getAllDashboardData";
import { cn } from "$src/lib/utils/class.utils";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useRef } from "react";
import { toast } from "react-hot-toast";
import useSWR from "swr";
import TableCard from "../Cards/TableCard";
import TopGroupsDonutChart from "../Charts/TopGroupsDonutChart";
import AttackedCountriesTable from "../Tables/AttackedCountriesTable";
import VictimsCardContainer from "../Victims/VictimsCardContainer";
import DashboardAreaChart from "./DashboardAreaChart";
import DashboardReportExporter from "./DashboardReportExporter";
import DashboardStats from "./DashboardStats";

const DashboardLayout = () => {
    const pdfRef = useRef<HTMLDivElement>(null);
    const searchParams = useSearchParams();
    const { info, ...query } = getQueryParams<ReportQuery>(searchParams);
    const { data, error, isLoading } = useSWR(query, getAllDashboardData);

    if (error) {
        toast.error(error?.message ?? error);
    }

    const print = {
        attacksPerMonth: hasInfoQuery(info, ReportInfo.ATTACKS_PER_MONTH),
        monitoredGroups:
            hasInfoQuery(info, ReportInfo.TOTAL_GROUPS) || hasInfoQuery(info, ReportInfo.MOST_ACTIVE_GROUPS),
        mostAttackedCountries: hasInfoQuery(info, ReportInfo.MOST_ATTACKED_COUNTRIES),
    };

    return (
        <>
            <DashboardReportExporter pdfRef={pdfRef} />
            <div ref={pdfRef} className="flex flex-col gap-4 print:break-inside-avoid-page">
                <DashboardStats
                    attackHistogramTotal={data?.attackHistogram?.total ?? 0}
                    percentageSinceLastThirtyDays={data?.percentageSinceLastThirtyDays ?? "-"}
                    topOneGroup={data?.totalGroupsStats.topOneGroup}
                    topCountryStats={data?.countryStats.topCountryStats}
                    totalLastTwoDaysAttacks={data?.lastTwoDaysAttacks?.total ?? 0}
                    topGroupLastTwoDays={data?.lastTwoDaysAttacks?.topGroup ?? "-"}
                    infoQueries={info}
                    loading={isLoading}
                />
                <div className="grid gap-4 sm:grid-cols-3 sm:grid-rows-2">
                    <div
                        className={cn(
                            "flex sm:col-span-3 print:col-span-3 print:break-inside-avoid-page",
                            !print.attacksPerMonth && "print:hidden"
                        )}
                    >
                        <DashboardAreaChart
                            attackHistogram={data?.attackHistogram?.hits ?? []}
                            topGroupsHistogram={data?.groupHistogram ?? []}
                            topSixGroups={
                                data?.totalGroupsStats?.topGroupStats?.map((group) => group.key.toString()) ?? []
                            }
                            disabled={!hasInfoQuery(info, ReportInfo.ATTACKS_PER_MONTH)}
                            loading={isLoading}
                        />
                    </div>
                    <div
                        className={cn(
                            "flex sm:col-span-3 print:col-span-3 print:break-inside-avoid-page",
                            !print.monitoredGroups && "bg-black/10 opacity-50 print:hidden"
                        )}
                    >
                        <TopGroupsDonutChart
                            topGroupStats={data?.totalGroupsStats.topGroupStats ?? []}
                            totalGroups={data?.totalGroupsStats.totalGroups ?? 0}
                            disabled={{
                                totalGroups: !hasInfoQuery(info, ReportInfo.TOTAL_GROUPS),
                                mostActiveGroups: !hasInfoQuery(info, ReportInfo.MOST_ACTIVE_GROUPS),
                            }}
                            loading={isLoading}
                        />
                    </div>
                    <div
                        className={cn(
                            "flex transition-all duration-200 sm:col-span-2 print:col-span-3 print:h-full print:min-h-[calc(50vh_-_1.25rem)] print:break-inside-avoid-page landscape:print:col-span-2 landscape:print:min-h-svh",
                            !print.mostAttackedCountries && "bg-black/10 opacity-50 print:hidden"
                        )}
                    >
                        <VectorMap stats={data?.countryStats?.orderedCountryStats ?? []} loading={isLoading} />
                    </div>
                    <div
                        className={cn(
                            "flex transition-all duration-200 sm:col-span-1 print:col-span-3 print:h-full print:min-h-[calc(50vh_-_1.25rem)] print:break-inside-avoid-page landscape:print:col-span-1 landscape:print:min-h-svh",
                            !print.mostAttackedCountries && "bg-black/10 opacity-50 print:hidden"
                        )}
                    >
                        <TableCard
                            title="Most attacked countries"
                            className="overflow-hidden print:border print:border-tremor-ring print:shadow-[none]"
                            disabled={!hasInfoQuery(info, ReportInfo.MOST_ATTACKED_COUNTRIES)}
                        >
                            <AttackedCountriesTable
                                countryStats={data?.countryStats?.topCountryStats ?? []}
                                loading={isLoading}
                            />
                        </TableCard>
                    </div>
                </div>
                <VictimsCardContainer route="dashboard" />
            </div>
        </>
    );
};

export default DashboardLayout;

const VectorMap = dynamic(() => import("$components/Maps/VectorMap"), {
    ssr: false,
});
