"use client";

import { ChevronDoubleLeftIcon } from "@heroicons/react/outline";
import { Icon } from "@tremor/react";
import Link from "next/link";

type Props = {
    url: string;
    size?: "sm" | "xs" | "md" | "lg" | "xl" | undefined;
    tooltip?: string;
};

function GoBackButton({ url, size, tooltip }: Props) {
    return (
        <Link className="shrink-0" href={decodeURIComponent(url)}>
            <Icon size={size ?? "sm"} icon={ChevronDoubleLeftIcon} tooltip={tooltip} />
        </Link>
    );
}

export default GoBackButton;
