"use client";

import { CodeIcon, DocumentIcon } from "@heroicons/react/outline";
import { Button, Dialog, DialogPanel } from "@tremor/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SourceCodeButtons({
    docId,
    route,
    disabled,
}: {
    docId: string;
    route: string;
    disabled?: boolean;
}) {
    const router = useRouter();
    const [selectedPage, setPage] = useState<"source" | "render" | null>(null);
    const redirectPage = () => {
        if (!selectedPage) {
            return;
        }
        if (selectedPage === "source") {
            router.push(`/${route}/html/${docId}`);
        } else {
            router.push(`/${route}/html/render/${docId}`);
        }
    };

    return (
        <>
            <Button
                type="button"
                icon={CodeIcon}
                variant="secondary"
                size="sm"
                disabled={disabled}
                onClick={() => setPage("source")}
            >
                Source code
            </Button>
            <Button
                type="button"
                icon={DocumentIcon}
                variant="secondary"
                color="red"
                size="sm"
                disabled={disabled}
                onClick={() => setPage("render")}
            >
                Render page
            </Button>
            <Dialog open={!!selectedPage} onClose={() => setPage(null)} static={true}>
                <DialogPanel className="">
                    <h3 className="text-center text-lg font-semibold">Third party HTML rendering</h3>
                    <p className="mt-4 text-wrap text-sm leading-6">
                        Render any third party HTML could lead to IP leakage or third party JS rendering.
                    </p>
                    <Button className="mt-6 w-full" type="button" size="sm" onClick={() => redirectPage()}>
                        Render anyway
                    </Button>
                </DialogPanel>
            </Dialog>
        </>
    );
}
