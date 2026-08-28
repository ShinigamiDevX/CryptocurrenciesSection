"use client";

import { cn } from "$src/lib/utils/class.utils";
import { DownloadIcon } from "@heroicons/react/outline";
import { Button } from "@tremor/react";
import { type ClassValue } from "clsx";

type Props = {
    url: string;
    fileName: string;
    text?: string;
    className?: ClassValue;
};

function DownloadButton({ url, fileName, text, className }: Props) {
    const onClickHandle = () => {
        const el = document.createElement("a");
        el.href = url;
        el.download = fileName;
        document.body.appendChild(el);
        el.click();
        document.body.removeChild(el);
    };
    return (
        <Button className={cn(className)} icon={DownloadIcon} onClick={onClickHandle}>
            {text ?? "Download"}
        </Button>
    );
}

export default DownloadButton;
