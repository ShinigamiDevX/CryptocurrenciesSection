"use client";

import { userSignal } from "$lib/client/signals";
import { getAuthUserAction } from "$lib/server/auth/getAuthUser";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "react-hot-toast";

export default function useAuthUser(status: "authenticated" | "loading") {
    const router = useRouter();

    useEffect(() => {
        if (status !== "authenticated") {
            return;
        }
        const loginOrRegister = async () => {
            const res = await getAuthUserAction();
            if (!res.success) {
                toast.error("Invalid user session, please log in again");
                await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait so the user can see the message
                await signOut({ redirect: false }); // will auto redirect to login
                return;
            }
            userSignal.value = res.data;
        };
        loginOrRegister().catch((e) => {
            toast.error("An error occurred while fetching user data");
            console.error(e);
        });
    }, [router, status]);
}
