"use client";

import { type User } from "@prisma/client";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import TableCard from "../Cards/TableCard";
import UsersTable from "../Tables/UsersTable";
import CreateUserForm from "./CreateUserForm";

export default function AdminDashboard({ users }: { users: User[] }) {
    const router = useRouter();
    const { data } = useSession({ required: true });
    if (data?.provider !== "Postgres" && data?.user?.role !== "admin") {
        router.replace("/dashboard");
    }
    return (
        <TableCard title="Users">
            <div className="flex flex-1 flex-col gap-4">
                <div className="relative h-[calc(var(--size-table)-88px)] w-full overflow-auto">
                    <UsersTable users={users} />
                </div>
                <CreateUserForm />
            </div>
        </TableCard>
    );
}
