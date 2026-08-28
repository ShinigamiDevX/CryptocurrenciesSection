import Dashboard from "$components/Dashboard/Dashboard";
import { type Metadata } from "next";

export const metadata: Metadata = {
    title: "Dashboard",
};

export default async function DashboardPage() {
    return <Dashboard />;
}
