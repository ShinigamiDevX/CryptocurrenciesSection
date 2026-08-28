"use client";

import { DocumentDuplicateIcon } from "@heroicons/react/outline";
import { Button } from "@tremor/react";
import { useState } from "react";

export default function CopyButton({ value }: { value: string }) {
    const [copied, setCopied] = useState(false);
    async function onClick(e: React.MouseEvent) {
        e.preventDefault();
        await navigator.clipboard.writeText(value);
        setCopied(true);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        setCopied(false);
    }
    return (
        <Button
            className="w-fit"
            icon={DocumentDuplicateIcon}
            variant="primary"
            size="sm"
            color="gray"
            onClick={onClick}
        >
            {copied ? "URL Copied" : "Copy URL"}
        </Button>
    );
}
