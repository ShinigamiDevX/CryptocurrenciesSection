"use client";

import Loading from "$components/Utils/Loading";
import { Badge, Card, Divider, Title } from "@tremor/react";
import { useSession } from "next-auth/react";
import AlertSettings from "./AlertSettings";
import SecuritySettings from "./SecuritySettings";

export default function Settings() {
    const { data } = useSession();
    const user = data?.user;
    return (
        <Card className="flex h-full flex-col gap-8">
            <div className="flex flex-col gap-8">
                <Title>User Data</Title>
                <div className="flex flex-col gap-4">
                    <div className="flex">
                        <div className="w-20">
                            <span className="font-bold">Id:</span>
                        </div>
                        <div className="w-full">
                            <span>{user ? user.id : <LoadingValue />}</span>
                        </div>
                    </div>
                    <div className="flex">
                        <div className="w-20">
                            <span className="font-bold">Email:</span>
                        </div>
                        <div className="w-full">
                            <span>{user ? user.email : <LoadingValue />}</span>
                        </div>
                    </div>
                    <div className="flex">
                        <div className="w-20">
                            <span className="font-bold">Role:</span>
                        </div>
                        <div className="w-full capitalize">
                            {user ? (
                                <Badge color={user.role === "user" ? "green" : "yellow"}>{user.role}</Badge>
                            ) : (
                                <LoadingValue />
                            )}
                        </div>
                    </div>
                </div>
            </div>
            <Divider className="m-0 w-64" />
            <AlertSettings />
            <Divider className="m-0 w-64" />
            <SecuritySettings disabled={data?.provider !== "Postgres" || !user} />
        </Card>
    );
}

function LoadingValue() {
    return (
        <div className="h-[18px] w-[200px]">
            <Loading />
        </div>
    );
}
