"use client";

import { ClockIcon, ExclamationIcon } from "@heroicons/react/solid";
import StatCard from "../Cards/StatCard";
import TitleCard from "../Cards/TitleCard";
type Props = {
    groupName: string;
    totalAttacksByGroup: number;
    lastMonthAttacks: number;
};

export default function GroupHeaderStats({ groupName, totalAttacksByGroup, lastMonthAttacks }: Props) {
    return (
        <header className="flex w-full gap-4 overflow-x-auto px-[1px] py-[1px]">
            <TitleCard subtitle="THREAT ACTOR" title={groupName} />
            <StatCard
                subtitle="TOTAL ATTACKS"
                title={totalAttacksByGroup.toString()}
                icon={ExclamationIcon}
                iconColor="red-500"
            />
            <StatCard
                subtitle="LAST MONTH ATTACKS"
                title={lastMonthAttacks.toString()}
                icon={ClockIcon}
                iconColor="blue-500"
            />
        </header>
    );
}
