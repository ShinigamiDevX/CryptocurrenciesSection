/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
"use client";

import Loading from "$components/Utils/Loading";
import { type StatWithPercentage } from "$lib/types/api.types";
import { Card } from "@tremor/react";
import customGeo from "public/json/customGeo.json";
import { memo, useState } from "react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { Tooltip } from "react-tooltip";

type Props = {
    stats: StatWithPercentage[];
    loading?: boolean;
};

function VectorMap({ stats, loading }: Props) {
    const [tooltipData, setTooltipData] = useState<string | undefined>(undefined);

    if (loading) {
        return (
            <Card className="size-full p-0 print:hidden">
                <Loading />
            </Card>
        );
    }

    const colorSCale = (countryPercentage: number) => {
        if (countryPercentage < 3) {
            return "#E5DE00";
        }
        if (countryPercentage < 8) {
            return "#E6B400";
        }
        if (countryPercentage < 20) {
            return "#E47200";
        }
        return "#FF5722";
    };

    return (
        <Card className="flex max-h-[576px] items-center justify-center p-0">
            <ComposableMap className="size-full" projection="geoMercator">
                <ZoomableGroup center={[0, 40]} zoom={1.25}>
                    <Geographies geography={customGeo}>
                        {({ geographies }) =>
                            geographies.map((geo) => {
                                const cur = stats.find((s) => s.key === geo.properties.iso_a2_eh);
                                return (
                                    <Geography
                                        key={geo.rsmKey}
                                        geography={geo}
                                        style={{
                                            default: {
                                                fill: cur ? colorSCale(Number(cur.percentage)) : "#a1a1a1",
                                                opacity: 0.5,
                                                outline: "none",
                                                strokeWidth: 1,
                                                stroke: cur ? colorSCale(Number(cur.percentage)) : "#a1a1a1",
                                            },
                                            hover: {
                                                fill: cur ? colorSCale(Number(cur.percentage)) : "#a1a1a1",
                                                opacity: 1,
                                                strokeWidth: 1,
                                                outline: "none",
                                            },
                                        }}
                                        onMouseEnter={() => {
                                            if (cur) {
                                                setTooltipData(`${geo.properties.name} ${cur ? cur.percentage : "0"}%`);
                                            }
                                        }}
                                        onMouseLeave={() => {
                                            setTooltipData(undefined);
                                        }}
                                    />
                                );
                            })
                        }
                    </Geographies>
                </ZoomableGroup>
            </ComposableMap>
            <Tooltip anchorSelect=".rsm-geography">{tooltipData}</Tooltip>
        </Card>
    );
}

export default memo(VectorMap);
