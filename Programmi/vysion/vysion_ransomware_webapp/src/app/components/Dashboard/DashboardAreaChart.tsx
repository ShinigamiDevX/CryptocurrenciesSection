"use client";

import { type HistogramData } from "$lib/types/api.types";
import { cn } from "$src/lib/utils/class.utils";
import { AreaChart, Card, Subtitle, Title } from "@tremor/react";
import Loading from "../Utils/Loading";

type Props = {
    attackHistogram: HistogramData[];
    topGroupsHistogram: HistogramData[];
    topSixGroups: string[];
    disabled?: boolean;
    loading?: boolean;
};

export default function DashboardAreaChart({
    attackHistogram,
    topGroupsHistogram,
    topSixGroups,
    disabled,
    loading,
}: Props) {
    if (loading) {
        return <LoadingAreaChart />;
    }
    attackHistogram.map((attack) => {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        if (attack?.value || attack?.value === 0) {
            attack.attacks = attack.value;
        }
        delete attack.value;
        return attack;
    });

    return (
        <Card className={cn(disabled && "bg-black/10 opacity-50 print:hidden")}>
            <Title>Attacks per month</Title>
            <div className="mt-1 flex w-full flex-col gap-8 sm:flex-row sm:gap-4 print:flex-col">
                <div className="flex flex-1 flex-col">
                    <Subtitle className="text-secondary">All attacks</Subtitle>
                    <AreaChart
                        className="print:h-72"
                        showAnimation={true}
                        index="date"
                        data={attackHistogram}
                        categories={["attacks"]}
                        colors={["indigo", "cyan", "green", "yellow", "red", "fuchsia"]}
                        showLegend={true}
                    />
                </div>
                <div className="flex flex-1 flex-col">
                    <Subtitle className="text-secondary">Group attacks</Subtitle>
                    <AreaChart
                        className="print:h-72"
                        showAnimation={true}
                        index="date"
                        data={topGroupsHistogram}
                        categories={topSixGroups}
                        colors={["indigo", "cyan", "green", "yellow", "red", "fuchsia"]}
                        showLegend={true}
                    />
                </div>
            </div>
        </Card>
    );
}

const LoadingAreaChart = () => {
    return (
        <Card className="flex h-[27rem] flex-col gap-4 print:hidden">
            <div className="flex w-full justify-between">
                <div className="h-8 w-40">
                    <Loading />
                </div>
                <div className="h-8 w-32">
                    <Loading />
                </div>
            </div>
            <div className="h-6 w-20">
                <Loading />
            </div>
            <div className="h-full flex-1">
                <Loading />
            </div>
        </Card>
    );
};
