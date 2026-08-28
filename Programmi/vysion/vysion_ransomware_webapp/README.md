# Tools4LEAS - Vysion app

## Overview

This repository contains the code for the **Tools4LEAS** web application, a [_Vysion_](https://vysion.ai/) forked application. **Vysion** is a web application that provides dark web intelligence by automatically detecting, collecting and investigating information from darknets and cybercrime forums. The application is built using the Next framework.

## Configuration

Before launching the containers, make sure to create the environment file **.env** under the folder */docker/*. A template file "**.env_template**" is provided, and it should look like this:

```bash
# Used by docker compose
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=vysion
CONTAINER_NAME=postgres
# Used by NextJS
DATABASE_URL=postgres://${DATABASE_USER}:${DATABASE_PASSWORD}@${CONTAINER_NAME}:5432/${DATABASE_NAME}
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET="RANDOM_SECRET_KEY"
VYSION_API_URL=http://vysion-api:8000
VYSION_API_KEY="32_BYTE_RANDOM_STRING"
ENCRYPTION_KEY="32_BYTE_RANDOM_STRING"
# Used by mailserver
MAIL_FROM=info@byronlabs.io
MAIL_USER=apikey
MAIL_PASSWORD=MAIL_API_KEY
MAIL_DOMAIN=smtp.example.io
```

### Database Configuration

In order to correctly configure the 2FA authentication, the **NEXTAUTH_SECRET** environment variable **must be set to a random 32 character string**.
> Note: For the sake of simplicity, the database is deployed with a default user and password `eactda@byronlabs.io:Admin!1234%`. You can change it in the [`docker/config/init.sql`](docker/config/init.sql) file, and the hashing function of new passwords must be done with **bcrypt** and **12** rounds.

### LDAP Configuration (Optional)

The LDAP authentication feature is optional and can be enabled by setting the following environment variables together. Ensure that all variables are configured if you choose to use LDAP for user authentication:

```bash
# LDAP Config (Optional)
LDAP_SERVER_URI="ldap://localhost:389"
LDAP_BIND_DN="cn=admin,dc=example,dc=com"
LDAP_BIND_PASS="PASSWORD_FOR_BIND_DN"
LDAP_USER_SEARCH_TREE="ou=users,dc=example,dc=com"
```

- `LDAP_SERVER_URI`: Specifies the URI of your LDAP server, including the protocol, host, and port.
- `LDAP_BIND_DN`: The distinguished name (DN) of the LDAP user that the application will use for binding to the LDAP server.
- `LDAP_BIND_PASS`: The password associated with the LDAP bind DN.
- `LDAP_USER_SEARCH_TREE`: The base directory tree where user searches will be conducted.

To ensure proper functioning of the application, LDAP users must have a `mail` attribute set in their LDAP entries and use `uid` as their username. This configuration allows your application to authenticate users against the specified LDAP server using their LDAP credentials, and ensures that the necessary user details are present for application functionality.

> These settings are not mandatory but must be fully configured if LDAP integration is to be activated. All users logging via LDAP will be created in the database with the `provider` flag set to `ldap` and with role set to `user`.



## Learn More

To learn more about Next.js, take a look at the following resources:

-   [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
-   [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

To learn more about Vysion , take a look at the following resources:

-   [Vysion Features](https://vysion.ai/#features) - learn about Vysion features and API.

---

Node: v20.13.0
