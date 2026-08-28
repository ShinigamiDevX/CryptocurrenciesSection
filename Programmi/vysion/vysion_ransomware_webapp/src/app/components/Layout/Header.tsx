"use client";

import UserDropdown from "$components/Header/UserDropdown";
import useAuthUser from "$hooks/useAuthUser";
import { useSession } from "next-auth/react";
import Link from "next/link";
import AlertsDropdown from "../Header/AlertsDropdown";
import EactdaLogoNativeIcon from "../NativeIcons/EactdaLogoNativeIcon";

export default function Header() {
    const { status } = useSession({ required: true });
    useAuthUser(status);
    return (
        <header className="w-full print:hidden">
            <nav className="flex items-center justify-between gap-4 rounded-xl bg-sidebar px-4 py-2 lg:border lg:bg-white">
                <Link href="/" className="relative rounded">
                    <EactdaLogoNativeIcon className="h-11 text-white lg:text-black" />
                </Link>
                <div className="flex flex-auto items-center justify-end gap-4">
                    <AlertsDropdown />
                    <UserDropdown />
                </div>
            </nav>
        </header>
    );
}
