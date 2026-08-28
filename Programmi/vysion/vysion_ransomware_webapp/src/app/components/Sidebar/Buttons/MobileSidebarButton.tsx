"use client";

import { cn } from "$src/lib/utils/class.utils";
import { Icon } from "@tremor/react";
import { type ClassValue } from "clsx";
import Link from "next/link";
import { type ElementType } from "react";

type Props = {
    route: string | undefined;
    active: boolean;
    icon: ElementType;
    className?: ClassValue;
    type?: "link" | "button";
    onClick?: () => void;
};
export default function MobileSidebarButton({ route, icon, active, className, type = "link", onClick }: Props) {
    if (type === "button" && !route) {
        return (
            <button className={cn("sidebar-btn-mobile", className, active && "brightness-90")} onClick={onClick}>
                <Icon icon={icon} size="md" color="slate" />
            </button>
        );
    }
    return (
        <Link href={route!}>
            <button className={cn("sidebar-btn-mobile", className, active && "brightness-90")} onClick={onClick}>
                <Icon icon={icon} size="md" color="slate" />
            </button>
        </Link>
    );
}
