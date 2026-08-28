"use client";

import { adminResetSecondFactorAction } from "$lib/server/users/commands/adminResetSecondFactor";
import { adminResetUserPasswordAction } from "$lib/server/users/commands/adminResetUserPassword";
import { adminUpdateUserRoleAction } from "$lib/server/users/commands/adminUpdateUserRole";
import { CogIcon } from "@heroicons/react/outline";
import { UserRole, type User } from "@prisma/client";
import { Divider, Icon } from "@tremor/react";
import { signOut, useSession } from "next-auth/react";
import React, { useEffect, useRef } from "react";
import { toast } from "react-hot-toast";

type Props = {
    user: User;
    canDemote: boolean;
};

export default function UserDropdown({ user, canDemote }: Props) {
    const { data } = useSession();
    const [dropDownVisible, setDropdownVisible] = React.useState(false);
    const ref = useRef<HTMLDivElement>(null);

    async function updateUserRole(userId: number, newRole: UserRole) {
        const res = await adminUpdateUserRoleAction(userId, newRole);
        if (!res.success) {
            console.error("Error updating user", res.errorMessage);
            toast.error(res.errorMessage);
            return;
        }
        toast.success("User role updated successfully");
        if (Number(data?.user?.id) === userId) {
            toast.success("Please log in again to apply the changes");
            waitAndLogout();
        }
    }

    async function resetUserPassword(userId: number) {
        const res = await adminResetUserPasswordAction(userId);
        if (!res.success) {
            console.error("Error resetting user password", res.errorMessage);
            toast.error(res.errorMessage);
            return;
        }
        const newPassword = res.data;
        toast(`New password: ${newPassword}`);
    }

    async function resetUser2FA(userId: number) {
        const res = await adminResetSecondFactorAction(userId);
        if (!res.success) {
            console.error("Error resetting user 2FA", res.errorMessage);
            toast.error(res.errorMessage);
            return;
        }
        toast.success("User 2FA reset successfully");
        if (Number(data?.user?.id) === userId) {
            toast.success("Please log in again and set up 2FA");
            waitAndLogout();
        }
    }

    function waitAndLogout() {
        setTimeout(() => {
            signOut().catch((e) => {
                console.error("Error logging out", e);
                toast.error("Error logging out");
            });
        }, 2000);
    }

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
            className="relative size-8 cursor-pointer rounded-full hover:bg-slate-200"
        >
            <Icon icon={CogIcon} />
            <nav
                ref={ref}
                className={`absolute right-0 flex w-48 flex-col rounded-md border bg-background-secondary py-2 shadow-md ${dropDownVisible ? "top-10 z-10 opacity-100" : "top-6 -z-10 opacity-0"} transition-all duration-300 ease-in-out`}
            >
                <button
                    onClick={() =>
                        updateUserRole(user.id, user.role === UserRole.user ? UserRole.admin : UserRole.user)
                    }
                    disabled={user.role === UserRole.admin && !canDemote}
                    className={`block w-full cursor-not-allowed truncate whitespace-nowrap px-4 py-2 text-center text-sm font-semibold enabled:cursor-pointer ${user.role === UserRole.user ? "text-yellow-600" : canDemote ? "text-red-500" : "text-gray-400"}`}
                >
                    {user.role === UserRole.user ? "Promote to Admin" : "Demote to User"}
                </button>
                <Divider className="my-2" />
                <button
                    onClick={() => resetUserPassword(user.id)}
                    className="w-full bg-background-secondary px-4 py-2 text-xs font-bold capitalize text-orange-500 hover:brightness-95"
                >
                    Reset password
                </button>
                <button
                    disabled={!user.twoFactorSecret}
                    onClick={() => resetUser2FA(user.id)}
                    className="w-full bg-background-secondary px-4 py-2 text-xs font-bold capitalize text-orange-500 enabled:hover:brightness-95 disabled:cursor-not-allowed disabled:text-gray-400"
                >
                    Reset 2FA
                </button>
            </nav>
        </div>
    );
}
