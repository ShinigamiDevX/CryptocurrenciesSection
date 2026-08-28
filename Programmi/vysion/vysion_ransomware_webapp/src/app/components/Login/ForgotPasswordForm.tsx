"use client";

import PasswordTips from "$components/Login/PasswordTips";
import useAuthRedirect from "$hooks/useAuthRedirect";
import sendForgotPasswordEmailAction from "$lib/server/email/commands/sendForgotPassswordEmail";
import forgotPasswordAction from "$lib/server/users/commands/forgotPassword";
import { ForgotPasswordFormSchema } from "$src/lib/schemas/form.schemas";
import { getFormProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod";
import { Button, TextInput, Title } from "@tremor/react";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import toast from "react-hot-toast";
import VerificationInput from "react-verification-input";

export default function ForgotPasswordForm() {
    useAuthRedirect();
    const searchParams = useSearchParams();
    const initialEmail = searchParams.get("email");
    const router = useRouter();

    const [totp, setTotp] = useState("");
    const [encryptedTotp, setEncryptedTotp] = useState("");

    const [lastResult, formAction] = useFormState(forgotPasswordAction, undefined);
    const [form, fields] = useForm({
        lastResult,
        onValidate({ formData }) {
            return parseWithZod(formData, { schema: ForgotPasswordFormSchema });
        },
        shouldValidate: "onSubmit",
        shouldRevalidate: "onInput",
        defaultValue: {
            email: initialEmail ?? "",
        },
    });

    useEffect(() => {
        if (lastResult?.status !== "success") return;
        toast.success("Password updated successfully");
        router.push("/login");
    }, [lastResult, router]);

    async function sendPasswordResetEmail(e: FormEvent) {
        e.preventDefault();
        const email = fields.email?.value;
        if (!email) {
            fields.email.valid = false;
            toast.error("Please enter a valid email address");
            return;
        }
        const res = await sendForgotPasswordEmailAction(email);
        if (!res.success) {
            console.error("Error sending password reset email", res.errorMessage);
            return;
        }
        toast.success(
            "If the email address is valid, you will receive an email with a temporary code to reset your password"
        );
        setEncryptedTotp(res.data);
    }

    return (
        <>
            {!encryptedTotp ? (
                <form {...getFormProps(form)} onSubmit={sendPasswordResetEmail} className="flex w-full flex-col gap-8">
                    <div className="flex flex-col gap-8">
                        <div className="flex flex-col gap-4">
                            <Title className="text-center">
                                We&apos;ll send you an email with a temporary code to reset your password
                            </Title>
                            <div className="flex flex-col gap-2">
                                <label className="pl-1 text-tremor-content-subtle" htmlFor="email">
                                    EMAIL
                                </label>
                                <TextInput
                                    name={fields.email.name}
                                    error={!fields.email.valid}
                                    errorMessage={fields.email.errors?.[0]}
                                    defaultValue={initialEmail ?? ""}
                                    autoFocus={true}
                                    className="h-[50px] w-full rounded text-xl"
                                    type="email"
                                    required
                                />
                            </div>
                        </div>
                    </div>
                    <SubmitButton />
                </form>
            ) : (
                <form {...getFormProps(form)} action={formAction} className="flex w-full flex-col gap-8">
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-6">
                            <Title className="text-center">Change your password</Title>
                            <PasswordTips />
                            <div className="flex flex-col gap-2">
                                <label className="pl-1 text-tremor-content-subtle" htmlFor="email">
                                    NEW PASSWORD
                                </label>
                                <TextInput
                                    name={fields.newPassword.name}
                                    error={!fields.newPassword.valid}
                                    errorMessage={fields.newPassword.errors?.[0]}
                                    autoFocus={true}
                                    className="h-[50px] w-full rounded text-xl"
                                    type="password"
                                    required
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="pl-1 text-tremor-content-subtle" htmlFor="email">
                                    REPEAT NEW PASSWORD
                                </label>
                                <TextInput
                                    name={fields.confirmPassword.name}
                                    error={!fields.confirmPassword.valid}
                                    errorMessage={fields.confirmPassword.errors?.[0]}
                                    placeholder="••••••••"
                                    className="h-[50px] w-full rounded text-xl"
                                    type="password"
                                    required
                                />
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="pl-1 text-tremor-content-subtle" htmlFor="email">
                                EMAIL CODE
                            </label>
                            <div className="flex flex-col gap-4">
                                <div className="flex flex-col items-center gap-2">
                                    <VerificationInput
                                        onChange={(value) => setTotp(value)}
                                        length={6}
                                        validChars="0-9"
                                        placeholder="0"
                                        classNames={{
                                            container: "h-[50px]",
                                            character:
                                                "rounded border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-950 text-text",
                                            characterSelected:
                                                "bg-white border dark:bg-[#090E1A] text-accent dark:text-accent",
                                            characterInactive: "bg-white text-text-secondary dark:bg-[#090E1A]",
                                        }}
                                    />
                                    {!fields.submmittedTotp.valid ? (
                                        <span className="text-red-500 text-sm">
                                            {fields.submmittedTotp.errors?.[0]}
                                        </span>
                                    ) : null}
                                    {!form.valid && <span className="text-red-500 text-sm">{form.errors?.[0]}</span>}
                                </div>
                                <span className="pl-1 text-sm text-text-secondary">
                                    Didn&apos;t receive the email code?{" "}
                                    <button
                                        type="button"
                                        className="font-bold text-accent"
                                        onClick={sendPasswordResetEmail}
                                    >
                                        Resend code
                                    </button>
                                </span>
                            </div>
                        </div>
                    </div>
                    {/* Hidden inputs for correct form submission */}
                    <input type="hidden" name={fields.email.name} value={fields.email.value} />
                    <input type="hidden" name={fields.submmittedTotp.name} value={totp} />
                    <input type="hidden" name={fields.encryptedTotp.name} value={encryptedTotp} />
                    <SubmitButton />
                </form>
            )}
        </>
    );

    function SubmitButton() {
        const { pending } = useFormStatus();
        return (
            <Button
                type="submit"
                className="h-[50px] w-full rounded-lg border border-none bg-accent-secondary py-2 text-background"
                disabled={pending}
                title="Change Password"
            >
                <span className="text-lg">{!encryptedTotp ? "Send Email" : "Change Password"} </span>
            </Button>
        );
    }
}
