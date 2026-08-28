"use client";

import Spinner from "$components/Utils/Spinner";
import { loginStatusSignal } from "$lib/client/signals";
import { LdapFormSchema } from "$lib/schemas/form.schemas";
import { getFormProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod";
import { Button, Divider, TextInput } from "@tremor/react";
import { signIn } from "next-auth/react";
import { useState } from "react";
import toast from "react-hot-toast";

function LdapForm() {
    const [loading, setLoading] = useState(false);
    const [form, fields] = useForm({
        shouldValidate: "onSubmit",
        shouldRevalidate: "onInput",
        onValidate({ formData }) {
            return parseWithZod(formData, { schema: LdapFormSchema });
        },
        async onSubmit(e, context) {
            e.preventDefault();
            if (loading) {
                return;
            }
            const formData = context.formData;
            const username = formData.get("username") as string;
            const password = formData.get("password") as string;
            await login({ username, password });
        },
    });

    async function login({ username, password }: { username: string; password: string }) {
        if (!username || !password) {
            console.error("Username and password are required");
            toast.error("Username and password are required");
            return;
        }
        setLoading(true);
        const res = await signIn("ldap", {
            redirect: false,
            username,
            password,
        })
            .catch((e) => {
                console.error("Error while logging in:", e);
            })
            .finally(() => setLoading(false));
        if (!res?.ok) {
            console.error("Error while logging in", res?.error);
            toast.error(res?.error ?? "Error while logging in, please try again or contact support");
        }
    }

    return (
        <>
            <h1 className="text-xl font-semibold sm:text-center sm:text-3xl">LDAP</h1>
            <form className="flex flex-col gap-4" {...getFormProps(form)}>
                <div className="flex flex-col gap-2">
                    <label className="pl-1 text-tremor-content-subtle" htmlFor={fields.username.name}>
                        USERNAME
                    </label>
                    <TextInput
                        autoFocus={true}
                        name={fields.username.name}
                        error={!fields.username.valid}
                        errorMessage={fields.username.errors?.[0]}
                        placeholder="Enter your username"
                        className="h-[50px] w-full rounded text-xl"
                        type="text"
                        required
                        disabled={loading}
                    />
                </div>
                <div className="flex flex-col gap-2">
                    <label className="pl-1 text-tremor-content-subtle" htmlFor={fields.password.name}>
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
                        disabled={loading}
                    />
                </div>
                <Button
                    title="Login"
                    type="submit"
                    size="xl"
                    className="h-[50px] w-full rounded-lg border border-none bg-accent-secondary py-2 text-background transition-all hover:brightness-100"
                    disabled={loading}
                >
                    <span>Login</span>
                </Button>
            </form>
            <Divider className="my-0" />
            <CredentialsButton loading={loading} />
            {loading && <Spinner />}
        </>
    );
}

export default LdapForm;

function CredentialsButton({ loading }: { loading: boolean }) {
    const handleClick = () => {
        if (loading) {
            return;
        }
        loginStatusSignal.value = { status: "firstFactor" };
    };
    return (
        <Button
            type="button"
            className="h-[50px] w-full rounded-lg border border-none bg-[#dcdcdc] py-2 text-primary transition-colors hover:bg-[#c2c2c2] hover:text-primary"
            variant="secondary"
            disabled={loading}
            onClick={handleClick}
        >
            Login via Credentials
        </Button>
    );
}
