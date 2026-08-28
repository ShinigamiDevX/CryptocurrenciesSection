import { DownloadIcon } from "@heroicons/react/outline";
import { Button } from "@tremor/react";

function DownloadUmfButton({ name, umf }: { name: string; umf: Record<string, unknown> }) {
    const downloadUmf = () => {
        const el = document.createElement("a");
        const file = new Blob([JSON.stringify(umf)], { type: "application/json" });
        el.href = URL.createObjectURL(file);
        el.download = `${name.replace(/ /g, "_")}-umf.json`;
        document.body.appendChild(el);
        el.click();
        document.body.removeChild(el);
    };
    return (
        <Button className="" color="gray" icon={DownloadIcon} onClick={downloadUmf}>
            UMF
        </Button>
    );
}

export default DownloadUmfButton;
