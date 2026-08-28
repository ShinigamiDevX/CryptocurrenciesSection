import { cn } from "$src/lib/utils/class.utils";
import { ArrowDownIcon, ArrowUpIcon, InformationCircleIcon } from "@heroicons/react/solid";
import { Card, Icon } from "@tremor/react";
import Link from "next/link";

type Props = {
    subtitle: string;
    title: string;
    icon: (props: React.ComponentProps<"svg">) => JSX.Element;
    iconColor: string;
    percentage?: string;
    description?: string;
    disabled?: boolean;
};
export default function StatCard({ subtitle, title, icon, iconColor, percentage, description, disabled }: Props) {
    return (
        <Card
            className={cn(
                "flex w-fit flex-[1_0_156px] flex-col gap-2 break-words rounded bg-white p-4 transition-all duration-200 print:w-full",
                disabled && "bg-black/10 opacity-50 print:hidden"
            )}
        >
            <div className="flex flex-1 justify-between gap-2">
                <div className="w-full max-w-28 flex-1 flex-grow gap-4 sm:max-w-full">
                    <h5 className="block max-w-fit text-balance text-xs font-bold uppercase text-secondary">
                        {subtitle}
                    </h5>
                    <span className="block truncate text-xl font-semibold print:!whitespace-break-spaces">{title}</span>
                </div>
                <div
                    className={`inline-flex size-12 items-center justify-center rounded-full p-3 text-center text-white print:hidden print:size-10 bg-${iconColor} print:shrink-0`}
                >
                    <Icon icon={icon} size="md" className="text-white" />
                </div>
            </div>
            <PercentageInfo description={description} percentage={percentage} />
        </Card>
    );
}

type InfoProps = {
    percentage: string | undefined;
    description: string | undefined;
};

const PercentageInfo = ({ percentage, description }: InfoProps) => {
    const percentageDown = percentage?.includes("-");
    const numericPercentage = !isNaN(Number(percentage?.replace("%", "")));

    return percentage ? (
        <div className="flex items-end gap-2 text-sm print:flex-wrap">
            <span
                className={`flex items-center gap-2 text-${numericPercentage ? (percentageDown ? "red-500" : "green-500") : "blue-500"}`}
            >
                <Icon
                    icon={numericPercentage ? (percentageDown ? ArrowDownIcon : ArrowUpIcon) : InformationCircleIcon}
                    color={numericPercentage ? (percentageDown ? "red" : "green") : "blue"}
                    size="md"
                    className="p-0"
                />
                {numericPercentage ? percentage : <Link href={`/groups/${percentage}`}>{percentage}</Link>}
            </span>
            <span className="whitespace-nowrap print:whitespace-break-spaces">{description ?? ""}</span>
        </div>
    ) : null;
};
