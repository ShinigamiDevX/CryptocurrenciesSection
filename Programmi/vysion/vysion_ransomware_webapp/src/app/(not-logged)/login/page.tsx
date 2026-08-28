import LoginWrapper from "$components/Login/LoginWrapper";
import { env } from "$src/env.mjs";

export default function Login() {
    const hasLdap =
        !!env?.LDAP_SERVER_URI && !!env?.LDAP_BIND_DN && !!env?.LDAP_BIND_PASS && !!env?.LDAP_USER_SEARCH_TREE;

    return <LoginWrapper hasLdap={hasLdap} />;
}
