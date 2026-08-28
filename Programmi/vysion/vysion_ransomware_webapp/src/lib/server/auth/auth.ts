import { symmetricDecrypt } from "$lib/utils/crypto.utils";
import { env } from "$src/env.mjs";
import { getPrismaKnownErrors } from "$src/lib/utils/db.utils";
import { type User, UserRole } from "@prisma/client";
import { type PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { Client, InvalidCredentialsError, type SearchOptions } from "ldapts";
import { type DefaultSession, type DefaultUser, getServerSession, type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { authenticator } from "otplib";
import { UsersRepository } from "../users/database/users.repository";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
    interface Session extends DefaultSession {
        provider: "Postgres" | "LDAP"; // Add any new providers here
        user: {
            id: string;
            email: string;
            role?: UserRole; // Optional role field (must be supported by the auth provider)
        };
    }
    interface User extends DefaultUser {
        role?: UserRole; // Optional role field (must be supported by the auth provider)
    }
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authOptions: NextAuthOptions = {
    callbacks: {
        async jwt({ token, user, account }) {
            if (user) {
                token = {
                    ...user,
                };
            }
            if (account) {
                token.provider = account.provider;
            }
            return token;
        },
        async session({ session, token }) {
            return {
                ...session,
                provider: token.provider,
                user: {
                    ...token,
                },
                maxAge: 14 * 24 * 60 * 60, // 14 days
            };
        },
    },
    pages: {
        signIn: "/login", // Comment this line to use the default sign in page
    },
    providers: [
        // CredentialsProvider for Postgres database with 2FA and a UserRole field
        CredentialsProvider({
            id: "Postgres",
            name: "Postgres",
            credentials: {
                email: { label: "Email", type: "email" },
                totp: { label: "Totp Code", type: "totp" },
            },
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            async authorize(credentials, req) {
                if (!credentials) {
                    console.error("No credentials provided");
                    return null;
                }

                if (!credentials.email || !credentials.totp) {
                    console.error("Missing email or totp");
                    return null;
                }
                const user = await UsersRepository.getUserByEmail(credentials.email);
                if (!user?.twoFactorSecret) {
                    console.error("User does not have 2FA enabled");
                    return null;
                }
                let secret;
                try {
                    secret = symmetricDecrypt(user.twoFactorSecret, env.ENCRYPTION_KEY);
                } catch (e: unknown) {
                    console.error("Error decrypting 2FA secret", e);
                    return null;
                }
                const totpCorrect = authenticator.check(credentials.totp, secret);
                if (!totpCorrect) {
                    console.error("Invalid totp code");
                    return null;
                }
                return {
                    id: `${user.id}`,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                };
            },
        }),
        /**
         * LDAP Auth example
         * @see https://next-auth.js.org/tutorials/ldap-auth-example
         */
        CredentialsProvider({
            id: "ldap",
            name: "ldap",
            credentials: {
                username: { label: "Username", type: "text" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                if (
                    !env?.LDAP_SERVER_URI ||
                    !env?.LDAP_BIND_DN ||
                    !env?.LDAP_BIND_PASS ||
                    !env?.LDAP_USER_SEARCH_TREE
                ) {
                    throw new Error("LDAP environment variables not set");
                }

                if (!credentials?.username || !credentials?.password) {
                    throw new Error("Username and password are required");
                }

                const client = new Client({ url: env.LDAP_SERVER_URI });
                const bindDN = String(env.LDAP_BIND_DN);
                const bindPass = String(env.LDAP_BIND_PASS);
                const searchTree = String(env.LDAP_USER_SEARCH_TREE);

                try {
                    await client.bind(bindDN, bindPass);
                    const opts: SearchOptions = {
                        filter: `(uid=${credentials.username})`, // Adjust filter to match schema
                        scope: "sub",
                        attributes: ["dn", "cn", "sn", "uid", "mail"], // Add attributes as needed
                    };
                    const { searchEntries } = await client.search(searchTree, opts);
                    console.log("[LDAP Auth] Search entries:", searchEntries);
                    const entry = searchEntries[0];
                    if (!entry) {
                        console.error("[LDAP Auth] User not found");
                        const user = await UsersRepository.getUserByName(credentials.username);
                        if (user) {
                            await UsersRepository.deleteUser(user.id);
                        }
                        throw new Error(`User ${credentials.username} not found`);
                    }
                    const userDN = entry.dn;
                    await client.bind(userDN, credentials.password);
                    const user = await UsersRepository.getUserByName(credentials.username);
                    if (!user) {
                        const newUser = await UsersRepository.createUser({
                            name: credentials.username,
                            email: entry.mail?.toString(),
                            role: UserRole.user,
                            provider: "ldap",
                        });
                        if (newUser.name === "PrismaClientKnownRequestError") {
                            const errors = getPrismaKnownErrors(
                                (newUser as PrismaClientKnownRequestError).meta?.target as string[]
                            );
                            console.error("[LDAP Auth] Error creating user:", errors);
                            throw new Error("Error while retrieving credentials");
                        }
                        return {
                            id: (newUser as User).id.toString(),
                            email: (newUser as User).email,
                            name: (newUser as User).name,
                            role: (newUser as User).role,
                        };
                    }
                    return {
                        id: user.id.toString(),
                        email: user.email,
                        name: user.name,
                        role: user.role,
                    };
                } catch (error) {
                    console.error("[LDAP Auth] Error:", error);
                    if (error instanceof InvalidCredentialsError) {
                        throw new Error("Invalid credentials");
                    }
                    throw error;
                } finally {
                    await client.unbind();
                }
            },
        }),
    ],
    secret: env.NEXTAUTH_SECRET,
};

/**
 * Wrapper for `getServerSession` so that you don"t need to import the `authOptions` in every file.
 *
 * @see https://next-auth.js.org/configuration/nextjs
 */
export const getServerAuthSession = () => getServerSession(authOptions);
