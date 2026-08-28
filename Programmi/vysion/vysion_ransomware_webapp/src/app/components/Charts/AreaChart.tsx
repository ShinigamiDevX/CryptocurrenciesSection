"use client";

import { type HistogramData } from "$lib/types/api.types";
import { AreaChart, Card, Subtitle, Title } from "@tremor/react";

type Props = {
    data: HistogramData[];
    title: string;
    subtitle: string;
    categories: string[];
    children?: React.ReactNode;
};
export default function AreaChartCard({ data, title, subtitle, categories, children }: Props) {
    return (
        <Card>
            <div className="flex w-full justify-between">
                <Title>{title}</Title>
                {children}
            </div>
            <Subtitle className="text-secondary">{subtitle}</Subtitle>
            <AreaChart
                showAnimation={true}
                index="date"
                data={data}
                categories={categories}
                colors={["indigo", "cyan", "green", "yellow", "red", "fuchsia"]}
                showLegend={true}
            />
        </Card>
    );
}
