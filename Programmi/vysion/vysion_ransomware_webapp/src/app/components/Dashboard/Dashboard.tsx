import DashboardLayout from "$components/Dashboard/DashboardLayout";
import { type Metadata } from "next";

export const metadata: Metadata = {
    title: "Dashboard",
};

export default async function Dashboard() {
    return (
        <main className="flex flex-col gap-4">
            <DashboardLayout />
        </main>
    );
}
