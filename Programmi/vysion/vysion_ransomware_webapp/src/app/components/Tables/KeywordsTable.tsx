"use client";

import { userSignal } from "$lib/client/signals";
import { deleteKeywordSubscriptionAction } from "$lib/server/keywordSubscriptions/commands/deleteKeywordSubscription";
import { enableKeywordSubscriptionAction } from "$lib/server/keywordSubscriptions/commands/enableKeywordSubscription";
import { formatKeyword } from "$lib/utils/alert.utils";
import { type TableColumn, type TableData } from "$src/lib/types/table.types";
import { TrashIcon } from "@heroicons/react/outline";
import { useSignals } from "@preact/signals-react/runtime";
import { AlertType, type KeywordSubscription } from "@prisma/client";
import { Badge, Icon, Switch } from "@tremor/react";
import { formatRelative } from "date-fns";
import { enGB } from "date-fns/locale";
import { useTransition } from "react";
import { toast } from "react-hot-toast";
import Loading from "../Utils/Loading";
import SortableTable from "./SortableTable/SortableTable";
import TableHead from "./SortableTable/TableHead";

export default function KeywordsTable() {
    useSignals();
    const [loading, startTransition] = useTransition();

    const user = userSignal.value;
    const orderedSubscriptions = user?.keywordSubscriptions?.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );

    const columns: TableColumn[] = [
        {
            label: "Keyword",
            accessor: "keyword",
            sortable: true,
        },
        {
            label: "Added",
            accessor: "added",
            sortable: true,
            order: "desc",
        },
        {
            label: "Type",
            accessor: "type",
            sortable: true,
        },
        {
            label: "Enabled",
            accessor: "enabled",
            sortable: true,
        },
        {
            label: "Options",
            accessor: "options",
            sortable: false,
        },
    ];

    const data: TableData<unknown>[] | undefined = orderedSubscriptions?.map((sub) => ({
        keyword: formatKeyword(sub.keyword, sub.type),
        added: <span className="capitalize">{formatRelative(sub.createdAt, new Date(), { locale: enGB })}</span>, 
        type: formatKeywordType(sub.type),
        enabled: (
            <div key={sub.enabled ? "1" : "0"} className="flex">
                <Switch
                    title={sub.enabled ? "Disable subscription" : "Enable subscription"}
                    defaultChecked={sub.enabled}
                    disabled={loading}
                    onChange={() => toggleKeyword(sub)}
                />
            </div>
        ),
        options: (
            <div className="flex justify-end">
                <button
                    disabled={loading}
                    title="Delete keyword"
                    className="rounded-full hover:bg-slate-200"
                    onClick={() => deleteKeyword(sub)}
                >
                    <Icon icon={TrashIcon} color="red" />
                </button>
            </div>
        ),
    }));

    function formatKeywordType(type: AlertType) {
        return (
            <Badge key={type} color={type === AlertType.darknet ? "red" : type === AlertType.group ? "blue" : "green"}>
                {type}
            </Badge>
        );
    }

    async function toggleKeyword(sub: KeywordSubscription) {
        startTransition(async () => {
            if (!user) return;
            const res = await enableKeywordSubscriptionAction(sub.id, !sub.enabled);
            if (!res.success) {
                console.error(res.errorMessage);
                toast.error(res.errorMessage);
                return;
            }
            const updatedKeyword = res.data;
            userSignal.value = {
                ...user,
                keywordSubscriptions: user.keywordSubscriptions.map((sub) =>
                    sub.id === updatedKeyword.id ? updatedKeyword : sub
                ),
            };
        });
    }

    async function deleteKeyword(subscriptionToDelete: KeywordSubscription) {
        startTransition(async () => {
            if (!user) return;
            const res = await deleteKeywordSubscriptionAction(subscriptionToDelete.keyword, subscriptionToDelete.type);
            if (!res.success) {
                console.error(res.errorMessage);
                toast.error(res.errorMessage);
                return;
            }
            userSignal.value = {
                ...user,
                keywordSubscriptions: user.keywordSubscriptions.filter((sub) => sub.id !== subscriptionToDelete.id),
            };
        });
    }

    return (
        <>
            {data ? (
                data.length ? (
                    <SortableTable data={data} columns={columns} />
                ) : (
                    <NoResults columns={columns} />
                )
            ) : (
                <LoadingResults columns={columns} />
            )}
        </>
    );
}

function NoResults({ columns }: { columns: TableColumn[] }) {
    return (
        <table className="w-full text-left text-sm text-gray-500">
            <TableHead {...{ columns, handleSorting: undefined }} />
            <tbody className="h-full">
                <tr className="h-full">
                    <td colSpan={columns.length} className="h-full px-4 py-2 text-center">
                        No keywords added
                    </td>
                </tr>
            </tbody>
        </table>
    );
}

function LoadingResults({ columns }: { columns: TableColumn[] }) {
    return (
        <table className="relative w-full border-separate">
            <TableHead {...{ columns, handleSorting: undefined }} />
            <tbody>
                {Array.from({ length: 10 }).map((_, index) => (
                    <tr key={index}>
                        {columns.map((column) => (
                            <td key={column.accessor} className="h-8 border-b px-4 py-2">
                                <Loading />
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
