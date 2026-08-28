import path from "path";

/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
await import("./src/env.mjs");

/** @type {import("next").NextConfig} */
const config = {
    reactStrictMode: true,
    output: "standalone",
    webpack: (config) => {
        config.resolve.alias["handlebars"] = path.resolve("./node_modules/handlebars/dist/handlebars.js");
        return config;
    },
    experimental: {
        turbo: {
            resolveAlias: {
                handlebars: "./node_modules/handlebars/dist/handlebars.js",
            }
        }
    }
};

export default config;
