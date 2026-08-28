"use client";

import { userSignal } from "$lib/client/signals";
import { deleteAlertAction } from "$lib/server/alerts/commands/deleteAlert";
import { deleteALlAlertsFromUserAction } from "$lib/server/alerts/commands/deleteAllAlertsFromUser";
import { markAllAlertsFromUserAsReadAction } from "$lib/server/alerts/commands/markAllAlertsFromUserAsRead";
import { readAlertAction } from "$lib/server/alerts/commands/readAlert";
import { EyeIcon, TrashIcon } from "@heroicons/react/outline";
import { useSignals } from "@preact/signals-react/runtime";
import { type Alert } from "@prisma/client";
import { Icon } from "@tremor/react";
import { useTransition } from "react";
import { toast } from "react-hot-toast";
import Loading from "../Utils/Loading";
import AlertCard from "./AlertCard";

export default function Alerts() {
    useSignals();

    const [loading, startTransition] = useTransition();
    const user = userSignal.value;

    if (!user) {
        return (
            <div className="flex flex-col gap-4 px-4">
                <div className="mx-1 flex h-[var(--size-table-thread)] items-center justify-center gap-2 rounded-lg border bg-background-secondary px-4 sm:justify-end">
                    <div className="h-7 w-36">
                        <Loading />
                    </div>
                    <div className="h-7 w-24">
                        <Loading />
                    </div>
                </div>
                <LoadingAlerts />
            </div>
        );
    }

    const orderedAlerts = user.alerts?.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    async function setReadAlert(alert: Alert, read: boolean) {
        startTransition(async () => {
            if (!user) return;
            if (alert.read === read) return;
            const res = await readAlertAction(alert.id, read);
            if (!res.success) {
                toast.error(res.errorMessage);
                return;
            }
            userSignal.value = { ...user, alerts: user.alerts.map((a) => (a.id === alert.id ? res.data : a)) };
        });
    }

    async function deleteAlert(alertToDelete: Alert) {
        startTransition(async () => {
            if (!user) return;
            const res = await deleteAlertAction(alertToDelete.id);
            if (!res.success) {
                toast.error(res.errorMessage);
                return;
            }
            userSignal.value = { ...user, alerts: user.alerts.filter((a) => a.id !== alertToDelete.id) };
        });
    }

    async function deleteAllAlertsFromUser() {
        startTransition(async () => {
            if (!user) return;
            const res = await deleteALlAlertsFromUserAction(user.id);
            if (!res.success) {
                toast.error(res.errorMessage);
                return;
            }
            toast("All alerts deleted");
            userSignal.value = { ...user, alerts: [] };
        });
    }

    async function markAllAlertsFromUserAsRead() {
        startTransition(async () => {
            if (!user) return;
            const res = await markAllAlertsFromUserAsReadAction(user.id);
            if (!res.success) {
                toast.error(res.errorMessage);
                return;
            }
            toast("All alerts marked as read");
            userSignal.value = { ...user, alerts: user.alerts.map((a) => ({ ...a, read: true })) };
        });
    }

    function LoadingAlerts() {
        const numberRows = Array.from({ length: 6 }, (_, index) => index);
        return (
            <>
                {numberRows.map((_, index) => (
                    <div key={index} className="h-[92px] w-full">
                        <Loading />
                    </div>
                ))}
            </>
        );
    }

    return (
        <main className="flex flex-1 flex-col gap-4 overflow-auto">
            <div className="mx-4 flex flex-wrap items-center justify-end gap-2 rounded-lg border bg-background-secondary px-4 py-1">
                <button
                    title="Mark all as read"
                    className="flex shrink-0 items-center justify-center gap-1 rounded border bg-background-secondary px-2 py-1 text-sm font-semibold text-tremor-brand enabled:hover:brightness-95 disabled:text-secondary"
                    disabled={!orderedAlerts?.length || orderedAlerts?.every((a) => a.read) || loading}
                    onClick={markAllAlertsFromUserAsRead}
                >
                    <Icon
                        icon={EyeIcon}
                        className="p-0"
                        color={!orderedAlerts?.length || orderedAlerts?.every((a) => a.read) ? "slate" : "blue"}
                    />
                    Mark all as read
                </button>
                <button
                    title="Delete all"
                    className="flex shrink-0 items-center justify-center gap-1 rounded border bg-background-secondary px-2 py-1 text-sm font-semibold text-red-500 enabled:hover:brightness-95 disabled:text-secondary"
                    disabled={!orderedAlerts?.length || loading}
                    onClick={deleteAllAlertsFromUser}
                >
                    <Icon icon={TrashIcon} className="p-0" color={orderedAlerts?.length ? "red" : "slate"} />
                    Delete all
                </button>
            </div>
            <div className="flex flex-1 flex-col gap-2 overflow-auto px-4 pb-4">
                {orderedAlerts ? (
                    orderedAlerts.length ? (
                        orderedAlerts.map((alert) => {
                            return (
                                <AlertCard
                                    key={alert.id}
                                    alert={alert}
                                    deleteAlert={deleteAlert}
                                    setReadAlert={setReadAlert}
                                    loading={loading}
                                />
                            );
                        })
                    ) : (
                        <div className="flex flex-grow items-center justify-center">
                            <span className="text-secondary">No alerts found</span>
                        </div>
                    )
                ) : (
                    <LoadingAlerts />
                )}
            </div>
        </main>
    );
}
