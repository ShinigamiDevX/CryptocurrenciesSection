"use client";

import { Button } from "@tremor/react";

type Props = {
    HTML: string;
    docId: string;
};

export default function DownloadHTMLButton({ HTML, docId }: Props) {
    function downloadHTML() {
        const element = document.createElement("a");
        const file = new Blob([HTML], { type: "text/html" });
        element.href = URL.createObjectURL(file);
        element.download = `${docId}.html`;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    }
    return (
        <Button className="sm:absolute sm:right-8 sm:top-4" onClick={downloadHTML}>
            Download HTML
        </Button>
    );
}
