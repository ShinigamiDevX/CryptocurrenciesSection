import { type StatWithPercentage } from "$lib/types/api.types";
import { cn } from "$src/lib/utils/class.utils";
import Loading from "../Utils/Loading";

type Props = {
    countryStats: StatWithPercentage[];
    disabled?: boolean;
    loading?: boolean;
};

export default function AttackedCountriesTable({ countryStats, disabled, loading }: Props) {
    if (loading) {
        return (
            <table className="text-xs print:hidden">
                <thead className="border-y border-solid bg-background-secondary uppercase text-gray-700">
                    <tr className="table w-full table-fixed">
                        <th className="px-4 py-2">Country</th>
                        <th className="px-4 py-2">Attacks</th>
                        <th className="px-4 py-2"></th>
                    </tr>
                </thead>
                <tbody className="flex flex-col overflow-auto">
                    {Array<undefined>(10)
                        .fill(undefined)
                        .map((_, index) => (
                            <tr key={index} className="table w-full flex-grow table-fixed">
                                <th className="h-8 px-4 py-2">
                                    <Loading />
                                </th>
                                <th className="h-8 px-4 py-2">
                                    <Loading />
                                </th>
                                <th className="h-8 px-4 py-2">
                                    <Loading />
                                </th>
                            </tr>
                        ))}
                </tbody>
            </table>
        );
    }

    const othersStats = countryStats.filter((stat) => stat.key.toString().toLowerCase() === "others");

    return (
        <table
            className={`size-full items-center text-xs ${disabled ? "bg-black/10 opacity-50 print:hidden" : "bg-transparent"}`}
        >
            <thead className="border-y border-solid bg-background-secondary uppercase text-gray-700">
                <tr className="table w-full table-fixed">
                    <th className="px-4 py-2">Country</th>
                    <th className="px-4 py-2">Attacks</th>
                    <th className="px-4 py-2"></th>
                </tr>
            </thead>
            <tbody className="flex flex-col overflow-auto">
                {countryStats.length &&
                    countryStats
                        .filter((stat) => stat.key.toString().toLowerCase() !== "others")
                        .map((stat, index) => (
                            <Column key={index} index={index} countryStats={countryStats} stat={stat} />
                        ))}
            </tbody>
            {othersStats && othersStats.length > 0 && (
                <tfoot className="">
                    {othersStats.map((stat, index) => (
                        <Column key={index} index={index} countryStats={othersStats} stat={stat} />
                    ))}
                </tfoot>
            )}
        </table>
    );
}

type ColumnProps = {
    index: number;
    countryStats: StatWithPercentage[];
    stat: StatWithPercentage;
};

const Column = ({ index, countryStats, stat }: ColumnProps) => {
    function getBarColor(countryPercentage: number) {
        if (!countryPercentage) return "bg-gray-custom";
        let color = "bg-red-custom";
        if (countryPercentage < 3) {
            color = "bg-yellow-custom";
        } else if (countryPercentage < 8) {
            color = "bg-amber-custom";
        } else if (countryPercentage < 20) {
            color = "bg-orange-custom";
        }
        return color;
    }
    return (
        <tr
            className={cn(
                "table w-full flex-grow table-fixed",
                index === countryStats.length - 1 && "tr-rounded-lg border-t border-solid bg-background-secondary"
            )}
        >
            <th className="px-4 py-2">{stat.key}</th>
            <th className="px-4 py-2">{stat.doc_count}</th>
            <th className="">
                <div className="flex items-center justify-center gap-1 px-4 py-2">
                    <span className="mr-1.5 w-8 shrink-0">{stat.percentage}%</span>
                    <div className="relative w-full">
                        <div className={"flex h-2 gap-0.5 overflow-hidden rounded"}>
                            {index === countryStats.length - 1 ? (
                                <>
                                    <div
                                        style={{ width: `${stat.percentage}%` }}
                                        className={"bg-gray-custom border-right-black"}
                                    ></div>
                                    <div className={"bg-gray-custom absolute h-full w-full rounded opacity-50"}></div>
                                </>
                            ) : (
                                <>
                                    <div
                                        style={{ width: `${stat.percentage}%` }}
                                        className={`${getBarColor(Number(stat.percentage))} border-right-black`}
                                    ></div>
                                    <div
                                        className={`${getBarColor(
                                            Number(stat.percentage)
                                        )} absolute h-full w-full rounded opacity-50`}
                                    ></div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </th>
        </tr>
    );
};
