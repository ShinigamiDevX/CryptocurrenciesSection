"use client";

import { cn } from "$src/lib/utils/class.utils";
import { Icon, type Color } from "@tremor/react";
import { type ClassValue } from "clsx";
import Link from "next/link";
import { type ElementType } from "react";

type Props = {
    route: string | undefined;
    title: string;
    active: boolean;
    icon: ElementType;
    type?: "button" | "link";
    className?: ClassValue;
    onClick?: () => void;
};
export default function MainSidebarButton({ title, route, icon, active, className, type = "link", onClick }: Props) {
    if (type === "button" && !route) {
        return (
            <button
                className={cn("sidebar-btn font-semibold", className, active && "brightness-150")}
                onClick={onClick}
            >
                <Icon icon={icon} size="md" color={"white" as Color} />
                {title}
            </button>
        );
    }
    return (
        <Link href={route!}>
            <button className={cn("sidebar-btn", className, active && "brightness-150")} onClick={onClick}>
                <Icon icon={icon} size="md" color={"white" as Color} />
                {title}
            </button>
        </Link>
    );
}
