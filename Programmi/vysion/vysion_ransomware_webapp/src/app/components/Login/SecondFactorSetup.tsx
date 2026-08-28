"use client";

import Spinner from "$components/Utils/Spinner";
import { loginStatusSignal } from "$lib/client/signals";
import { Title } from "@tremor/react";
import { signIn } from "next-auth/react";
import { useState, useTransition } from "react";
import { toast } from "react-hot-toast";
import QRCode from "react-qr-code";
import VerificationInput from "react-verification-input";

export default function SecondFactorSetup() {
    const { email, keyUri } = loginStatusSignal.value;
    const secretKey = keyUri?.split("=")[1]?.replace("&period", "");

    const [loading, startTransition] = useTransition();
    const [showSecret, setShowSecret] = useState<boolean>(false);

    async function login(totp: string) {
        if (!email || !totp) {
            toast.error("Email and code are required");
            return;
        }
        const loginRes = await signIn("Postgres", {
            redirect: false,
            email,
            totp,
        });
        if (!loginRes?.ok) {
            console.error("Invalid access code", loginRes?.error);
            toast.error("Invalid access code, please try again");
        }
        // redirect will happen automatically
    }

    return (
        <form className="flex w-full flex-col gap-8">
            {loading && <Spinner />}
            <div className="flex flex-col gap-8">
                <div className="flex flex-col gap-4">
                    <Title className="text-center font-semibold text-text-secondary">
                        Please scan this code with your preferred mobile authenticator app
                    </Title>
                    <div className="flex w-full flex-col items-center justify-center gap-2">
                        <QRCode className="h-[200px]" value={keyUri ?? ""} />
                        <span className="w-[200px] pl-1 text-center text-sm text-text-secondary">
                            Alternatively you can manually introduce a{" "}
                            <button type="button" className="font-bold" onClick={() => setShowSecret(!showSecret)}>
                                secret key
                            </button>
                        </span>
                        {showSecret && (
                            <span className="text-center text-sm font-semibold text-text-secondary">{secretKey}</span>
                        )}
                    </div>
                </div>
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <label className="pl-1 text-tremor-content-subtle" htmlFor="password">
                            AUTHENTICATOR CODE
                        </label>
                        <div className="flex w-full items-center justify-center">
                            <VerificationInput
                                autoFocus={true}
                                onComplete={(e) => startTransition(() => login(e))}
                                length={6}
                                validChars="0-9"
                                placeholder="0"
                                classNames={{
                                    container: "h-[50px]",
                                    character: "rounded border-tremor-border text-text-primary bg-white",
                                    characterSelected:
                                        "text-tremor-brand shadow-tremor-input bg-white border-tremor-border",
                                    characterInactive: "bg-white text-tremor-content-subtle",
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </form>
    );
}
