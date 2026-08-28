import AreaChartCard from "$components/Charts/AreaChart";
import GroupHeaderStats from "$components/Group/GroupHeaderStats";
import ErrorMessage from "$components/Utils/ErrorMessage";
import VictimsCardContainer from "$components/Victims/VictimsCardContainer";
import {
    getGroupHistogramAction,
    getLastMonthGroupAttacksAction,
} from "$lib/server/ransomware/queries/getGroupHistogram";
import { getTotalVictimsByGroupAction } from "$lib/server/ransomware/queries/getTotalVictimsByGroup";
import { type Metadata } from "next";

type Props = {
    params: { id: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    return {
        title: `${decodeURIComponent(params.id)} - Group`,
    };
}

export default async function GroupDashboard({ params }: Props) {
    const groupName = decodeURIComponent(params.id);
    const res1 = await getTotalVictimsByGroupAction(groupName);
    if (!res1.success) {
        console.error(res1.errorMessage);
        return <ErrorMessage>{res1.errorMessage}</ErrorMessage>;
    }
    const totalAttacksGroup = res1.data;

    const res2 = await getGroupHistogramAction({ groupName });
    if (!res2.success) {
        console.error(res2.errorMessage);
        return <ErrorMessage>{res2.errorMessage}</ErrorMessage>;
    }
    const groupHistogram = res2.data;

    const res3 = await getLastMonthGroupAttacksAction({ groupName });
    if (!res3.success) {
        console.error(res3.errorMessage);
        return <ErrorMessage>{res3.errorMessage}</ErrorMessage>;
    }
    const lastMonthAttacks = res3.data;

    return (
        <main className="flex flex-col gap-4">
            <GroupHeaderStats
                groupName={groupName}
                totalAttacksByGroup={totalAttacksGroup}
                lastMonthAttacks={lastMonthAttacks}
            />
            <AreaChartCard
                data={groupHistogram}
                title={"Attacks per month"}
                subtitle={`Attacks by ${groupName}`}
                categories={[groupName]}
            />
            <VictimsCardContainer group={groupName} route={`groups/${params.id}`} />
        </main>
    );
}
