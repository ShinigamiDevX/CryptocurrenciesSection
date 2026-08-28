"use client";

import { type VictimReport } from "$src/lib/types/api.types";
import { PencilAltIcon } from "@heroicons/react/outline";
import { Button, Dialog, DialogPanel } from "@tremor/react";
import { useState } from "react";
import VictimsEditForm from "./VictimsEditForm";

type Props = {
    data: VictimReport;
    onSubmit: (data: VictimReport) => void;
};

function VictimEditButton({ data, onSubmit }: Props) {
    const [open, setOpen] = useState(false);

    const handleOpen = () => setOpen(true);
    const handleClose = () => setOpen(false);
    const handleFinally = (newData: VictimReport) => {
        onSubmit(newData);
        handleClose();
    };
    return (
        <>
            <Button icon={PencilAltIcon} variant="primary" size="sm" onClick={handleOpen}>
                Edit
            </Button>
            <Dialog open={open} onClose={handleClose} static={true}>
                <DialogPanel>
                    <VictimsEditForm data={data} onCancel={handleClose} onFinally={handleFinally} />
                </DialogPanel>
            </Dialog>
        </>
    );
}

export default VictimEditButton;
