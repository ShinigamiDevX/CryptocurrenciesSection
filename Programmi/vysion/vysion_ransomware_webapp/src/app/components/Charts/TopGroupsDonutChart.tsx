"use client";

import { type Stat } from "$lib/types/api.types";
import { cn } from "$src/lib/utils/class.utils";
import { ArrowRightIcon } from "@heroicons/react/outline";
import { BarList, Bold, Card, Divider, DonutChart, Icon, Legend, Metric, Text, Title } from "@tremor/react";
import Link from "next/link";
import Loading from "../Utils/Loading";

interface DisabledCharts {
    totalGroups?: boolean;
    mostActiveGroups?: boolean;
}

type Props = {
    topGroupStats: Stat[];
    totalGroups?: number;
    loading?: boolean;
    disabled?: DisabledCharts;
};

export default function TopGroupsDonutChart({ totalGroups, topGroupStats, disabled, loading }: Props) {
    const disabledClass = "bg-black/10 opacity-50 print:hidden";
    const formattedTopGroupStats = topGroupStats.map((stat) => {
        return {
            name: stat.key.toString(),
            value: stat.doc_count,
        };
    });

    if (loading) {
        return <LoadingDonutChart />;
    }

    return (
        <Card
            className={cn(
                "flex flex-grow flex-col",
                disabled?.mostActiveGroups && disabled?.totalGroups && disabledClass
            )}
        >
            <Title>Monitored groups</Title>
            <div className="flex w-full flex-col gap-8 sm:flex-row sm:gap-4 print:flex-col">
                <div
                    className={cn(
                        "flex flex-1 flex-col gap-8 p-2 lg:justify-between",
                        disabled?.totalGroups && !disabled?.mostActiveGroups && disabledClass
                    )}
                >
                    <div className="flex flex-col gap-2">
                        <Text>Total number of groups:</Text>
                        <Metric>{totalGroups}</Metric>
                        <DonutChart
                            className="h-52 w-full"
                            data={formattedTopGroupStats}
                            showAnimation={true}
                            category="value"
                            key="name"
                            label={totalGroups ? "Top groups" : "No data"}
                            colors={["indigo", "cyan", "green", "yellow", "red", "fuchsia"]}
                        />
                        <Legend
                            className="mt-4 hidden print:block"
                            categories={formattedTopGroupStats.map((stat) => stat.name)}
                            colors={["indigo", "cyan", "green", "yellow", "red", "fuchsia"]}
                        />
                    </div>
                    <Link className="flex items-center print:hidden" href="/groups">
                        <p className="text-blue-600">See all</p>
                        <Icon icon={ArrowRightIcon} size="md" />
                    </Link>
                </div>
                <div
                    className={cn(
                        "flex flex-1 flex-col gap-4 p-2",
                        disabled?.mostActiveGroups && !disabled.totalGroups && disabledClass
                    )}
                >
                    <div className="flex justify-between">
                        <Text>
                            <Bold>Most active groups</Bold>
                        </Text>
                        <Text>
                            <Bold>Occurrences</Bold>
                        </Text>
                    </div>
                    <BarList
                        className="flex-1"
                        data={formattedTopGroupStats.filter((data) => data.name.toLowerCase() !== "others")}
                        showAnimation={true}
                    />
                    <Divider className="m-0" />
                    <BarList
                        data={formattedTopGroupStats.filter((data) => data.name.toLowerCase() === "others")}
                        showAnimation={true}
                    />
                </div>
            </div>
        </Card>
    );
}

const LoadingDonutChart = () => {
    return (
        <Card className="flex flex-col gap-4">
            <div className="flex w-full justify-between">
                <div className="h-7 w-40">
                    <Loading />
                </div>
                <div className="h-8 w-24">
                    <Loading />
                </div>
            </div>
            <div className="h-5 w-44">
                <Loading />
            </div>
            <div className="size-9">
                <Loading />
            </div>
            <div className="h-full flex-1">
                <Loading />
            </div>
            <div className="h-9 w-20">
                <Loading />
            </div>
        </Card>
    );
};
