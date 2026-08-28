"use client";

import { ArrowRightIcon } from "@heroicons/react/outline";
import {
    BellIcon,
    ChartBarIcon,
    CogIcon,
    LogoutIcon,
    ShieldExclamationIcon,
    UserIcon,
    UsersIcon,
} from "@heroicons/react/solid";
import { UserRole } from "@prisma/client";
import { Icon } from "@tremor/react";
import { type Session } from "next-auth";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import MobileSidebarButton from "./Buttons/MobileSidebarButton";

export default function MobileSidebar({ sessionData }: { sessionData: Session | null }) {
    const currentRoute = usePathname().split("/")[1] ?? "";
    const [sidebarVisible, setSidebarVisible] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setSidebarVisible(false);
            }
        };
        document.addEventListener("click", handleClickOutside, true);
        return () => {
            document.removeEventListener("click", handleClickOutside, true);
        };
    }, []);

    return (
        <main ref={ref} className="z-20 h-svh lg:hidden">
            <nav
                className={`absolute top-1/2 -translate-y-1/2 rounded-2xl border bg-background-secondary px-2 py-2 shadow-xl ${sidebarVisible ? "left-4" : "-left-full"} transition-all duration-300 ease-in-out`}
            >
                <div className="flex flex-col items-start justify-start gap-4 pb-4">
                    <MobileSidebarButton route="/dashboard" icon={ChartBarIcon} active={currentRoute === "dashboard"} />
                    <MobileSidebarButton
                        route="/groups"
                        icon={ShieldExclamationIcon}
                        active={currentRoute === "groups"}
                    />
                    <MobileSidebarButton route="/victims" icon={UsersIcon} active={currentRoute === "victims"} />
                </div>

                <div className="flex w-full flex-col gap-4 border-t border-slate-500 py-4">
                    <MobileSidebarButton route="/alerts" icon={BellIcon} active={currentRoute === "alerts"} />
                </div>
                <div className="flex w-full flex-col gap-4 border-t border-slate-500 pt-4">
                    <MobileSidebarButton route="/settings" icon={UserIcon} active={currentRoute === "profile"} />
                    {sessionData?.provider === "Postgres" && sessionData.user.role === UserRole.admin && (
                        <MobileSidebarButton route="/admin" icon={CogIcon} active={currentRoute === "admin"} />
                    )}
                    <MobileSidebarButton
                        route={undefined}
                        type="button"
                        icon={LogoutIcon}
                        active={false}
                        onClick={() => signOut()}
                    />
                </div>
            </nav>
            <button
                onClick={() => setSidebarVisible(true)}
                className={`absolute left-2 top-1/2 flex -translate-y-1/2 items-center rounded-full border bg-background-secondary shadow-md hover:brightness-90 ${sidebarVisible ? "-z-10 opacity-0" : "opacity-100"} transition-all duration-300 ease-in-out`}
            >
                <Icon icon={ArrowRightIcon} size="md" color="slate" />
            </button>
        </main>
    );
}
