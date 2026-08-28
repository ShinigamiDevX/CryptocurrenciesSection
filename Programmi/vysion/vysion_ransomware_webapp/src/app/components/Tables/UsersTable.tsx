"use client";

import { adminDeleteUserAction } from "$lib/server/users/commands/adminDeleteUser";
import { type TableColumn, type TableData } from "$lib/types/table.types";
import { TrashIcon } from "@heroicons/react/outline";
import { UserRole, type User } from "@prisma/client";
import { Badge, Button, Dialog, DialogPanel, Icon } from "@tremor/react";
import { formatRelative } from "date-fns";
import { enGB } from "date-fns/locale";
import { useState } from "react";
import { toast } from "react-hot-toast";
import UserDropdown from "../Admin/UserDropDown";
import SortableTable from "./SortableTable/SortableTable";

export default function UsersTable({ users }: { users: User[] }) {
    const getIsDeleteDisabled = (user: User) => {
        const isUserAdmin = user.role === UserRole.admin && users.filter((u) => u.role === UserRole.admin).length === 1;
        return users.length === 1 || isUserAdmin;
    };

    const columns: TableColumn[] = [
        {
            label: "ID",
            accessor: "id",
            sortable: true,
        },
        {
            label: "Name",
            accessor: "name",
            sortable: true,
        },
        {
            label: "Email",
            accessor: "email",
            sortable: true,
        },
        {
            label: "Role",
            accessor: "role",
            sortable: true,
        },
        {
            label: "Provider",
            accessor: "provider",
            sortable: true,
        },
        {
            label: "2FA",
            accessor: "twoFactorSecret",
            sortable: true,
        },
        {
            label: "Joined At",
            accessor: "createdAt",
            sortable: true,
        },
        {
            label: "",
            accessor: "options",
            sortable: false,
        },
    ];

    const data: TableData<unknown>[] = users.map((user) => ({
        id: <>{user.id}</>,
        name: (
            <span key={user.name} className="text-nowrap">
                {user.name}
            </span>
        ),
        email: (
            <span key={user.email} className="truncate">
                {user.email}
            </span>
        ),
        role: (
            <Badge key={user.role} color={user.role === "user" ? "green" : "yellow"}>
                {user.role}
            </Badge>
        ),
        provider: <span key={user.provider}>{user.provider}</span>,
        twoFactorSecret: (
            <span
                key={user.twoFactorSecret}
                className={`font-bold ${user.twoFactorSecret ? "text-green-500" : "text-red-500"}`}
            >
                {user.twoFactorSecret ? "YES" : "NO"}
            </span>
        ),
        createdAt: (
            <span key={user.createdAt.getTime()} className="text-nowrap capitalize">
                {formatRelative(new Date(user.createdAt), new Date(), { locale: enGB })}
            </span>
        ),
        options: (
            <div className="flex items-center justify-center">
                <UserDropdown
                    user={user}
                    canDemote={
                        user.role === UserRole.admin &&
                        users.length > 1 &&
                        users.filter((u) => u.role === UserRole.admin).length > 1
                    }
                />
                <DeleteUserDialog user={user} disabled={getIsDeleteDisabled(user)} />
            </div>
        ),
    }));

    return <SortableTable {...{ data, columns }} />;
}

function DeleteUserDialog({ user, disabled }: { user: User; disabled: boolean }) {
    const [open, setIsOpen] = useState(false);

    async function deleteUser(userId: number) {
        const res = await adminDeleteUserAction(userId);
        if (!res.success) {
            console.error("Error deleting user", res.errorMessage);
            toast.error(res.errorMessage);
            return;
        }
        toast.success("User deleted successfully");
        setIsOpen(false);
    }

    return (
        <>
            <button
                title="Delete User"
                type="button"
                className="cursor-not-allowed rounded-full enabled:cursor-pointer enabled:hover:bg-slate-200"
                disabled={disabled}
                onClick={() => setIsOpen(true)}
            >
                <Icon icon={TrashIcon} color={disabled ? "gray" : "red"} />
            </button>
            <Dialog open={open} onClose={(val) => setIsOpen(val)} static={true}>
                <DialogPanel>
                    <h3 className="text-center text-lg font-semibold">Delete user</h3>
                    <p className="mt-6 text-wrap text-sm leading-6">
                        {`Are you sure you want to delete user ${user.name}? This action cannot be undone.`}
                    </p>
                    <Button
                        type="button"
                        className="mt-6 w-full"
                        color="red"
                        size="sm"
                        onClick={async (e) => {
                            e.preventDefault();
                            await deleteUser(user.id);
                        }}
                    >
                        Delete
                    </Button>
                </DialogPanel>
            </Dialog>
        </>
    );
}
