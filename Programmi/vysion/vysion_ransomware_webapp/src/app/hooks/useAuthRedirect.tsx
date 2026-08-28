"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function useAuthRedirect() {
    const router = useRouter();

    const { status } = useSession();

    useEffect(() => {
        if (status === "authenticated") {
            router.replace("/");
        }
    }, [router, status]);
}
