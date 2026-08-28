import { cn } from "$src/lib/utils/class.utils";
import { Title } from "@tremor/react";
import { type ClassValue } from "clsx";
import React from "react";

export type Props = {
    children: React.ReactNode;
    title: string;
    className?: ClassValue;
    isContainer?: boolean;
    disabled?: boolean;
};
export default function TableCard({ children, title, className, isContainer, disabled }: Props) {
    return (
        <article
            className={cn(
                isContainer ? "h-full max-h-[var(--size-container)]" : "flex-grow",
                "flex flex-grow flex-col rounded-lg border bg-transparent",
                disabled && "bg-black/10 opacity-50 print:hidden",
                className
            )}
        >
            <div className="flex items-center p-4">
                <Title>{title}</Title>
            </div>
            {children}
        </article>
    );
}
