"use client";

import useAuthUser from "$hooks/useAuthUser";
import { useSession } from "next-auth/react";
import MainSidebar from "./MainSidebar";
import MobileSidebar from "./MobileSidebar";

export default function Sidebar() {
    const { status, data } = useSession({ required: true });
    useAuthUser(status);

    return (
        <>
            <MainSidebar sessionData={data} />
            <MobileSidebar sessionData={data} />
        </>
    );
}
