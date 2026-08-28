"use client";

import { userSignal } from "$lib/client/signals";
import { readAlertAction } from "$lib/server/alerts/commands/readAlert";
import { BellIcon } from "@heroicons/react/solid";
import { useSignals } from "@preact/signals-react/runtime";
import { type Alert } from "@prisma/client";
import { Icon } from "@tremor/react";
import Link from "next/link";
import React, { useEffect, useRef } from "react";
import { toast } from "react-hot-toast";

export default function AlertsDropdown() {
    useSignals();
    const user = userSignal.value;
    const unreadAlerts = user?.alerts?.filter((alert) => !alert.read);
    const [dropDownVisible, setDropdownVisible] = React.useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setDropdownVisible(false);
            }
        };
        document.addEventListener("click", handleClickOutside, true);
        return () => {
            document.removeEventListener("click", handleClickOutside, true);
        };
    }, []);

    async function setReadAlert(alert: Alert, read: boolean) {
        if (!user) return;
        if (alert.read === read) return;
        const res = await readAlertAction(alert.id, read);
        if (!res.success) {
            toast.error(res.errorMessage);
            return;
        }
        userSignal.value = { ...user, alerts: user.alerts.map((a) => (a.id === alert.id ? res.data : a)) };
    }

    return (
        <div
            onClick={() => {
                setDropdownVisible(!dropDownVisible);
            }}
            className="relative cursor-pointer"
        >
            {unreadAlerts?.length ? (
                <div className="absolute -right-[0.05rem] -top-[0.05rem] flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                    {unreadAlerts?.length > 99 ? "+99" : unreadAlerts?.length}
                </div>
            ) : null}
            <Icon
                icon={BellIcon}
                className="text-slate-500 transition-all duration-300 hover:brightness-90 lg:text-primary lg:hover:text-black/60"
                size="lg"
            />
            <nav
                ref={ref}
                className={`absolute right-0 flex max-h-[720px] w-48 flex-col overflow-auto rounded-md border bg-background-secondary py-2 shadow-md ${dropDownVisible ? "top-10 z-10 opacity-100" : "top-6 -z-10 opacity-0"} transition-all duration-300 ease-in-out`}
            >
                {unreadAlerts?.length ? (
                    unreadAlerts.map((alert) => (
                        <Link
                            href="/alerts"
                            key={alert.id}
                        >
                            <button
                                className="block w-full truncate bg-background-secondary px-4 py-2 text-left text-sm hover:brightness-95"
                                onClick={async () => {
                                    setDropdownVisible(false);
                                    await setReadAlert(alert, true);
                                }}
                            >
                                {`${alert.newHits} new hits for ${alert.keyword}`}
                            </button>
                        </Link>
                    ))
                ) : (
                    <span className="flex w-full justify-center px-4 py-2 text-sm">No new alerts</span>
                )}
            </nav>
        </div>
    );
}
