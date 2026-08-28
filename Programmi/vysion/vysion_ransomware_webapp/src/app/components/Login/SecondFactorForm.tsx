"use client";

import { loginStatusSignal } from "$lib/client/signals";
import { checkOrSetup2faAction } from "$lib/server/auth/checkOrSetup2fa";
import { Title } from "@tremor/react";
import { signIn } from "next-auth/react";
import { useEffect, useTransition } from "react";
import { toast } from "react-hot-toast";
import VerificationInput from "react-verification-input";
import Spinner from "../Utils/Spinner";

export default function SecondFactorForm() {
    const [loading, startTransition] = useTransition();

    useEffect(() => {
        const check2faSetup = async () => {
            const { email } = loginStatusSignal.value;
            const res = await checkOrSetup2faAction(email ?? "");
            if (!res.success) {
                toast.error(res.errorMessage);
                return;
            }
            if (res.data) {
                loginStatusSignal.value = { ...loginStatusSignal.value, status: "2faSetup", keyUri: res.data };
            }
        };
        check2faSetup().catch((e) => {
            console.error(e);
            toast.error("An error occurred while checking 2FA");
        });
    }, []);

    async function login(totp: string) {
        const { email, password } = loginStatusSignal.value;
        const loginRes = await signIn("Postgres", {
            email,
            password,
            totp,
            redirect: false,
        });

        if (!loginRes?.ok) {
            console.error("Invalid access code", loginRes?.error);
            toast.error("Invalid access code, please try again");
        }
        // redirect will happen automatically
    }

    return (
        <form className="flex flex-col items-center gap-8">
            {loading && <Spinner />}
            <Title className="text-center font-semibold text-text-secondary">
                Please enter the code from your authenticator app on your device
            </Title>
            <VerificationInput
                autoFocus={true}
                onComplete={(e) => startTransition(() => login(e))}
                length={6}
                validChars="0-9"
                placeholder="0"
                classNames={{
                    container: "h-[50px]",
                    character: "rounded border-tremor-border text-text-primary bg-white",
                    characterSelected: "text-tremor-brand shadow-tremor-input bg-white border-tremor-border",
                    characterInactive: "bg-white text-tremor-content-subtle",
                }}
            />
            <span className="pl-1 text-sm text-text-secondary">
                Can&apos;t access your code?
                <span className="font-bold"> Contact your administrator</span>
            </span>
        </form>
    );
}
