import { type SearchDto } from "$src/lib/types/dto.types";
import { cn } from "$src/lib/utils/class.utils";
import { getApiQueries } from "$src/lib/utils/queries.utils";
import {
    DocumentSearchIcon,
    GlobeIcon,
    MailIcon,
    MailOpenIcon,
    ShieldExclamationIcon,
    TrashIcon,
    UsersIcon,
} from "@heroicons/react/outline";
import { AlertType, type Alert } from "@prisma/client";
import { Card, Icon, Text } from "@tremor/react";
import Link from "next/link";
import sanitizeHtml from "sanitize-html";

type Props = {
    alert: Alert;
    loading: boolean;
    setReadAlert: (alert: Alert, read: boolean) => void;
    deleteAlert: (alert: Alert) => void;
};
export default function AlertCard({ alert, loading, setReadAlert, deleteAlert }: Props) {
    const params: Partial<SearchDto> = {
        q: alert.type !== AlertType.country ? alert.keyword : undefined,
        c: alert.type === AlertType.country ? alert.keyword : undefined,
        page: 1,
        gte: alert.createdAt.getTime() - Number(alert.timeRange),
        lte: alert.createdAt.getTime(),
    };
    const queries = getApiQueries(params);
    return (
        <Card className={cn("w-full shrink-0 bg-background-secondary", alert.read && "opacity-50")} key={alert.id}>
            <div className="flex justify-between">
                <div className="flex gap-6">
                    <div className="flex items-center">
                        <Icon
                            size="lg"
                            icon={
                                alert.type === AlertType.darknet
                                    ? ShieldExclamationIcon
                                    : alert.type === AlertType.group
                                        ? UsersIcon
                                        : GlobeIcon
                            }
                            color={
                                alert.type === AlertType.darknet
                                    ? "red"
                                    : alert.type === AlertType.group
                                        ? "blue"
                                        : "green"
                            }
                            tooltip={`${alert.type} alert`}
                        />
                    </div>
                    <div className="flex flex-col">
                        <span
                            className=""
                            dangerouslySetInnerHTML={{
                                __html: sanitizeHtml(alert.htmlMessage, {
                                    allowedTags: ["strong"],
                                }),
                            }}
                        ></span>
                        <Text>{alert.createdAt.toUTCString()}</Text>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Link href={`/victims?${queries?.toString()}`}>
                        <button
                            disabled={loading}
                            title="Go to victim results"
                            onClick={() => setReadAlert(alert, true)}
                            className="rounded-full hover:bg-slate-200"
                        >
                            <Icon icon={DocumentSearchIcon} color="blue" />
                        </button>
                    </Link>
                    <button
                        disabled={loading}
                        title={alert.read ? "Mark as unread" : "Mark as read"}
                        onClick={() => setReadAlert(alert, !alert.read)}
                        className="rounded-full hover:bg-slate-200"
                    >
                        <Icon icon={alert.read ? MailOpenIcon : MailIcon} color={alert.read ? "slate" : "green"} />
                    </button>
                    <button
                        disabled={loading}
                        title="Delete alert"
                        className="rounded-full hover:bg-slate-200"
                        onClick={() => deleteAlert(alert)}
                    >
                        <Icon icon={TrashIcon} color="red" />
                    </button>
                </div>
            </div>
        </Card>
    );
}
