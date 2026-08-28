"use client";

import FirstFactorForm from "$components/Login/FirstFactorForm";
import SecondFactorForm from "$components/Login/SecondFactorForm";
import SecondFactorSetup from "$components/Login/SecondFactorSetup";
import ErrorMessage from "$components/Utils/ErrorMessage";
import useAuthRedirect from "$hooks/useAuthRedirect";
import { loginStatusSignal } from "$lib/client/signals";
import LdapForm from "$src/app/components/Login/LdapForm";
import { useSignals } from "@preact/signals-react/runtime";

export default function LoginWrapper({ hasLdap }: { hasLdap: boolean }) {
    useAuthRedirect();
    useSignals();
    // Component will render the correct form based on the global login status
    const loginStatus = loginStatusSignal.value.status;

    if (hasLdap && loginStatus === "ldap") {
        return (
            <main className="flex w-full flex-col gap-8">
                <LdapForm />
            </main>
        );
    }

    if (loginStatus === "firstFactor") {
        return <FirstFactorForm hasLdap={hasLdap} />;
    }

    if (loginStatus === "secondFactor") {
        return <SecondFactorForm />;
    }

    if (loginStatus === "2faSetup") {
        return <SecondFactorSetup />;
    }

    return <ErrorMessage>Invalid login status</ErrorMessage>;
}
