"use client";

import { loginStatusSignal } from "$lib/client/signals";
import { LoginFormSchema } from "$lib/schemas/form.schemas";
import { firstFactorAuthAction } from "$lib/server/auth/firstFactorAuth";
import { getFormProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod";
import { Button, Divider, TextInput } from "@tremor/react";
import Link from "next/link";
import { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";

export default function FirstFactorForm({ hasLdap }: { hasLdap: boolean }) {
    const [lastResult, formAction] = useFormState(firstFactorAuthAction, undefined);
    const [form, fields] = useForm({
        lastResult,
        onValidate({ formData }) {
            return parseWithZod(formData, { schema: LoginFormSchema });
        },
        shouldValidate: "onSubmit",
        shouldRevalidate: "onInput",
    });

    useEffect(() => {
        if (lastResult?.status !== "success") {
            return;
        }
        if (fields.email.valid && fields.password.valid) {
            const email = fields.email.value;
            const password = fields.password.value;
            loginStatusSignal.value = { status: "secondFactor", email, password };
        }
    }, [fields, lastResult]);

    return (
        <form action={formAction} {...getFormProps(form)} className="flex w-full flex-col gap-8">
            <h1 className="text-xl font-semibold sm:text-center sm:text-3xl">Credentials</h1>
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                    <label className="pl-1 text-tremor-content-subtle" htmlFor="email">
                        EMAIL
                    </label>
                    <TextInput
                        autoFocus={true}
                        name={fields.email.name}
                        error={!fields.email.valid}
                        errorMessage={fields.email.errors?.[0]}
                        placeholder="email@example.com"
                        className="h-[50px] w-full rounded text-xl"
                        type="email"
                        required
                    />
                </div>
                <div className="flex flex-col gap-2">
                    <label className="pl-1 text-tremor-content-subtle" htmlFor="password">
                        PASSWORD
                    </label>
                    <TextInput
                        name={fields.password.name}
                        error={!fields.password.valid}
                        errorMessage={fields.password.errors?.[0]}
                        placeholder="Enter your password"
                        className="h-[50px] w-full rounded text-xl"
                        type="password"
                        required
                    />
                </div>
                <Link
                    className="pl-1 text-sm"
                    href={
                        fields.email.value && fields.email.valid
                            ? `/forgot-password?email=${fields.email.value}`
                            : "/forgot-password"
                    }
                >
                    Forgot password?
                </Link>
            </div>
            <LoginButton />
            {hasLdap && (
                <>
                    <Divider className="my-0" />
                    <LdapButton />
                </>
            )}
        </form>
    );
}

function LoginButton() {
    const { pending } = useFormStatus();
    return (
        <Button
            title="Login"
            type="submit"
            size="xl"
            className="h-[50px] w-full rounded-lg border border-none bg-accent-secondary py-2 text-background transition-all hover:brightness-100"
            disabled={pending}
        >
            <span>Login</span>
        </Button>
    );
}

function LdapButton() {
    return (
        <Button
            type="button"
            className="h-[50px] w-full rounded-lg border border-none bg-[#dcdcdc] py-2 text-primary transition-colors hover:bg-[#c2c2c2] hover:text-primary"
            variant="secondary"
            onClick={() => (loginStatusSignal.value = { status: "ldap" })}
        >
            Login via LDAP
        </Button>
    );
}
