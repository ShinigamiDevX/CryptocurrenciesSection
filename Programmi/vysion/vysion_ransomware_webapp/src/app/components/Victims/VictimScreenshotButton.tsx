"use client";

import { PhotographIcon } from "@heroicons/react/outline";
import { Button, Dialog, DialogPanel } from "@tremor/react";
import Image from "next/image";
import { Suspense, useState } from "react";
import DownloadButton from "../Utils/DownloadButton";
import Loading from "../Utils/Loading";

type Props = {
    id: string;
    name: string;
    media: {
        image: number[];
        type: string;
    };
};

function VictimScreenshotButton({ id, name, media }: Props) {
    const [open, setOpen] = useState(false);

    const handleOpen = () => setOpen(true);
    const handleClose = () => setOpen(false);
    const binary = Buffer.from(media.image);        // Node Buffer
    const uint8 = new Uint8Array(binary);           // Convert to Uint8Array
    const image = URL.createObjectURL(new Blob([uint8], { type: media.type }));
    return (
        <>
            <Button icon={PhotographIcon} variant="secondary" color="neutral" size="sm" onClick={handleOpen}>
                Render Media
            </Button>
            <Dialog open={open} onClose={handleClose} static={true}>
                <DialogPanel className="flex max-w-[1600px] flex-col items-center">
                    <h3 className="text-center text-lg font-semibold">{name} - Threat Media Visualization</h3>
                    <Suspense
                        fallback={
                            <div className="h-full max-h-80 w-full">
                                <Loading />
                            </div>
                        }
                    >
                        <Image className="!static mt-8" src={image} alt="Render screenshot" fill />
                    </Suspense>
                    <DownloadButton
                        className="mt-4 w-full md:w-fit"
                        text="Download media"
                        url={image}
                        fileName={`${id}.png`}
                    />
                </DialogPanel>
            </Dialog>
        </>
    );
}

export default VictimScreenshotButton;
