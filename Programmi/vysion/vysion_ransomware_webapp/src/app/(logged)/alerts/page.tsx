import Alerts from "$components/Alerts/Alerts";
import KeywordSubscriptions from "$components/Alerts/KeywordSubscriptions";
import TableCard from "$components/Cards/TableCard";
import { type Metadata } from "next";

export const metadata: Metadata = {
    title: "Alerts",
};

export default function AlertsPage() {
    return (
        <div className="grid h-full flex-1 grid-cols-1 gap-4 md:grid-cols-2">
            <TableCard title={"Recent Alerts"} isContainer={true}>
                <Alerts />
            </TableCard>
            <TableCard title="Keyword Subscriptions" isContainer={true}>
                <KeywordSubscriptions />
            </TableCard>
        </div>
    );
}
