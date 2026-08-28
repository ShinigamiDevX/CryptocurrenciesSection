import Footer from "$components/Layout/Footer";
import Sidebar from "$components/Sidebar/Sidebar";
import { Suspense, type ReactNode } from "react";
import Loading from "./admin/loading";

export default function LoggedInLayout({ children }: { children: ReactNode }) {
    return (
        <main className="flex h-svh w-screen">
            <Suspense fallback={<Loading />}>
                <Sidebar />
            </Suspense>
            <div className="flex h-full w-full flex-col gap-4 overflow-auto p-4">
                <div className="flex flex-grow flex-col">{children}</div>
                <Footer />
            </div>
        </main>
    );
}
