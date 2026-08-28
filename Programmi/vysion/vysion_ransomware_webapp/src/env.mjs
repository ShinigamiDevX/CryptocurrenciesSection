import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
	/**
	 * Specify your server-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars.
	 */
	server: {
		NODE_ENV: z.string(),
		NEXTAUTH_URL: z.string().url(),
		NEXTAUTH_SECRET: z.string(),
		VYSION_API_KEY: z.string(),
		VYSION_API_URL: z.string(),
		DATABASE_URL: z.string(),
		ENCRYPTION_KEY: z.string(),
		MAIL_FROM: z.string(),
		MAIL_USER: z.string(),
		MAIL_PASSWORD: z.string(),
		MAIL_DOMAIN: z.string(),
		// LDAP settings 
		LDAP_SERVER_URI: z.string().optional(),
		LDAP_BIND_DN: z.string().optional(),
		LDAP_BIND_PASS: z.string().optional(),
		LDAP_USER_SEARCH_TREE: z.string().optional(),
		LDAP_USER_ROLE_GROUP: z.string().optional(),
		LDAP_ADMIN_ROLE_GROUP: z.string().optional(),
		LDAP_GUEST_ROLE_GROUP: z.string().optional(),
	},

	/**
	 * Specify your client-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars. To expose them to the client, prefix them with
	 * `NEXT_PUBLIC_`.
	 */
	client: {},

	/**
	 * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
	 * middlewares) or client-side so we need to destruct manually.
	 */
	runtimeEnv: {
		NODE_ENV: process.env.NODE_ENV,
		NEXTAUTH_URL: process.env.NEXTAUTH_URL,
		NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
		VYSION_API_KEY: process.env.VYSION_API_KEY,
		VYSION_API_URL: process.env.VYSION_API_URL,
		DATABASE_URL: process.env.DATABASE_URL,
		ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
		MAIL_FROM: process.env.MAIL_FROM,
		MAIL_USER: process.env.MAIL_USER,
		MAIL_PASSWORD: process.env.MAIL_PASSWORD,
		MAIL_DOMAIN: process.env.MAIL_DOMAIN,
		LDAP_SERVER_URI: process.env.LDAP_SERVER_URI,
		LDAP_BIND_DN: process.env.LDAP_BIND_DN,
		LDAP_BIND_PASS: process.env.LDAP_BIND_PASS,
		LDAP_USER_SEARCH_TREE: process.env.LDAP_USER_SEARCH_TREE,
		LDAP_USER_ROLE_GROUP: process.env.LDAP_USER_ROLE_GROUP,
		LDAP_ADMIN_ROLE_GROUP: process.env.LDAP_ADMIN_ROLE_GROUP,
		LDAP_GUEST_ROLE_GROUP: process.env.LDAP_GUEST_ROLE_GROUP,
	},
	/**
	 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
	 * useful for Docker builds.
	 */
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	/**
	 * Makes it so that empty strings are treated as undefined.
	 * `SOME_VAR: z.string()` and `SOME_VAR=''` will throw an error.
	 */
	emptyStringAsUndefined: true,
});
