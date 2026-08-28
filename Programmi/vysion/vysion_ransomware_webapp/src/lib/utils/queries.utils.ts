import { type Queries } from "../types/api.types";

export function getQueryParams<T = Queries>(searchParams: URLSearchParams): T {
    const params: Record<string, unknown> = {};
    searchParams.forEach((value, key) => {
        if (params[key]) {
            if (Array.isArray(params[key])) {
                (params[key] as string[]).push(value);
            } else {
                params[key] = [params[key] as string, value];
            }
        } else {
            params[key] = value;
        }
    });
    return params as T;
}

export function getUrlQueryParams(params: Queries): URLSearchParams {
    const searchParams = new URLSearchParams();

    Object.keys(params).forEach((key) => {
        const value = params[key];

        if (Array.isArray(value)) {
            value.forEach((val) => {
                if (val === undefined || val === null || val === "") {
                    return;
                }
                searchParams.append(key, val as keyof Queries);
            });
        } else {
            if (value === undefined || value === null || value === "") {
                return;
            }
            searchParams.set(key, value as keyof Queries);
        }
    });
    return searchParams;
}

export function concatQueryParams(params1: URLSearchParams, params2: URLSearchParams): URLSearchParams {
    const resultParams = new URLSearchParams();
    const appendParams = (params: URLSearchParams) => {
        params.forEach((value, key) => {
            resultParams.append(key, value);
        });
    };

    appendParams(params1);
    appendParams(params2);

    return resultParams;
}

export function getApiQueries<T = Queries>(queries: T | undefined): URLSearchParams | undefined {
    if (!queries) {
        return undefined;
    }
    return getUrlQueryParams(queries as Queries);
}
