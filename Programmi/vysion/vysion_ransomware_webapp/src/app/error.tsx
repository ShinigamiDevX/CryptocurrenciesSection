"use client";

import { HomeIcon } from "@heroicons/react/outline";
import { Button } from "@tremor/react";
import Link from "next/link";

function Error() {
    return (
        <div className="relative top-0 z-50 mx-auto my-32 max-w-sm text-center">
            <h4 className="text-lg font-medium">
                There was an error trying to process your request. Please try again at a later time.
            </h4>
            <div className="mt-6 flex justify-center">
                <Link href="/">
                    <Button icon={HomeIcon} size="md">
                        Back to Home
                    </Button>
                </Link>
            </div>
        </div>
    );
}

export default Error;
