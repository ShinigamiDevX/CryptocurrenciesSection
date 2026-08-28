"use client";

import { cn } from "$src/lib/utils/class.utils";
import { UploadIcon } from "@heroicons/react/solid";
import { Button } from "@tremor/react";
import { type ClassValue } from "clsx";

type Props = {
    className?: ClassValue;
    disabled?: boolean;
};

function VictimSubmitInformation({ className, disabled }: Props) {
    return (
        <Button type="submit" className={cn(className)} icon={UploadIcon} size="md" disabled={disabled}>
            Apply changes
        </Button>
    );
}

export default VictimSubmitInformation;
