"use client";

import { userSignal } from "$lib/client/signals";
import { UserIcon } from "@heroicons/react/solid";
import { Divider, Icon } from "@tremor/react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import React, { useEffect, useRef } from "react";

export default function UserDropdown() {
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
    return (
        <div
            onClick={() => {
                setDropdownVisible(!dropDownVisible);
            }}
            className="relative h-8 w-8 cursor-pointer rounded-full bg-slate-500 transition-all duration-300 hover:brightness-90 lg:bg-primary lg:hover:bg-black/60"
        >
            <Icon
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-primary lg:text-background"
                icon={UserIcon}
                size="lg"
            />
            <nav
                ref={ref}
                className={`absolute right-0 flex w-48 flex-col rounded-md border bg-background-secondary py-2 shadow-md ${dropDownVisible ? "top-10 z-10 opacity-100" : "top-6 -z-10 opacity-0"} transition-all duration-300 ease-in-out`}
            >
                <span className="block w-full truncate whitespace-nowrap px-4 py-2 text-center text-sm font-semibold">
                    {userSignal.value?.name ?? "Loading..."}
                </span>
                <Divider className="my-2" />
                <Link href="/settings" className="flex">
                    <button
                        className="w-full bg-background-secondary px-4 py-2 text-xs font-bold capitalize hover:brightness-95"
                        onClick={() => setDropdownVisible(false)}
                    >
                        PROFILE
                    </button>
                </Link>
                <div className="flex">
                    <button
                        onClick={async () => await signOut({ redirect: false })}
                        className="w-full bg-background-secondary px-4 py-2 text-xs font-bold capitalize text-red-500 hover:brightness-95"
                    >
                        LOG OUT
                    </button>
                </div>
            </nav>
        </div>
    );
}
