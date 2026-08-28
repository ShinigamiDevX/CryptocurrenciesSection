"use client";

import { userSignal } from "$lib/client/signals";
import {
    BellIcon,
    ChartBarIcon,
    CogIcon,
    LightningBoltIcon,
    LogoutIcon,
    ShieldExclamationIcon,
    UsersIcon,
} from "@heroicons/react/solid";
import { useSignals } from "@preact/signals-react/runtime";
import { UserRole } from "@prisma/client";
import { type Session } from "next-auth";
import { signOut } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import VysionLogo from "public/images/logo_vysion_ransomware.png";
import MainSidebarButton from "./Buttons/MainSidebarButton";
export default function MainSidebar({ sessionData }: { sessionData: Session | null }) {
    useSignals();
    const currentRoute = usePathname().split("/")[1] ?? "";
    const user = userSignal.value;
    const unreadAlerts = user?.alerts?.filter((alert) => !alert.read);
    return (
        <main className="z-10 hidden min-h-svh items-center justify-between px-4 py-4 pr-0 lg:flex">
            <nav className="gap hidden h-full w-full flex-col gap-8 rounded-2xl bg-sidebar px-4 py-8 lg:flex lg:w-80">
                <div className="flex items-center justify-center">
                    <Link className="flex flex-col items-center gap-2" href="/">
                        <Image src={VysionLogo} alt="Vysion Ransomware" height={96} />
                    </Link>
                </div>
                <div className="flex flex-col items-start justify-start gap-8 overflow-y-auto">
                    <div className="w-full">
                        <h6 className="o-underline block pb-4 pt-1 text-xs font-bold text-neutral-400 lg:min-w-full">
                            Ransomware Monitor
                        </h6>
                        <div className="flex w-full flex-col gap-4">
                            <MainSidebarButton
                                route="/dashboard"
                                title="Dashboard"
                                icon={ChartBarIcon}
                                active={currentRoute === "dashboard"}
                            />
                            <MainSidebarButton
                                route="/groups"
                                title="Threat Groups"
                                icon={ShieldExclamationIcon}
                                active={currentRoute === "groups"}
                            />
                            <MainSidebarButton
                                route="/victims"
                                title="Victims"
                                icon={UsersIcon}
                                active={currentRoute === "victims"}
                            />
                        </div>
                    </div>
                    <div className="w-full">
                        <h6 className="o-underline block pb-4 pt-1 text-xs font-bold text-neutral-400 lg:min-w-full">
                            Darknet Alerts
                        </h6>
                        <div className="relative flex w-full flex-col gap-4">
                            {unreadAlerts?.length ? (
                                <div className="absolute left-[0.25rem] top-[0.25rem] z-10 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                                    {unreadAlerts?.length > 99 ? "+99" : unreadAlerts?.length}
                                </div>
                            ) : null}
                            <MainSidebarButton
                                route="/alerts"
                                title="Alerts"
                                icon={BellIcon}
                                active={currentRoute === "alerts"}
                            />
                        </div>
                    </div>
                    <div className="w-full">
                        <h6 className="o-underline block pb-4 pt-1 text-xs font-bold text-neutral-400 lg:min-w-full">
                            User Settings
                        </h6>
                        <div className="flex w-full flex-col gap-4">
                            <MainSidebarButton
                                route="/settings"
                                title="Settings"
                                icon={CogIcon}
                                active={currentRoute === "profile"}
                            />
                            {sessionData?.provider === "Postgres" && sessionData.user.role === UserRole.admin ? (
                                <MainSidebarButton
                                    route="/admin"
                                    title="Admin Panel"
                                    icon={LightningBoltIcon}
                                    active={currentRoute === "admin"}
                                />
                            ) : null}
                            <MainSidebarButton
                                route={undefined}
                                type="button"
                                title="Logout"
                                icon={LogoutIcon}
                                active={false}
                                onClick={() => signOut()}
                            />
                        </div>
                    </div>
                </div>
            </nav>
        </main>
    );
}
