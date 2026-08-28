import TableCard from "$components/Cards/TableCard";
import GroupsTable from "$components/Tables/GroupsTable";
import ErrorMessage from "$components/Utils/ErrorMessage";
import { getGroupStatsAction } from "$lib/server/ransomware/queries/getGroupStats";
import { type Metadata } from "next";

export const metadata: Metadata = {
    title: "Groups",
};

export default async function Groups() {
    const res = await getGroupStatsAction();
    if (!res.success) {
        return <ErrorMessage>{res.errorMessage}</ErrorMessage>;
    }

    return (
        <TableCard title={"Groups"}>
            <GroupsTable groupStats={res.data.hits} />
        </TableCard>
    );
}
