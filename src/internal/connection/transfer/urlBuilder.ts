import type {TransferRoute, TransferRoutes} from '../connection.js';

export interface TransferUrlOptions {
    /**
     * Path arguments to replace in the route, e.g. `{id}` in `/api/item/{id}`.
     */
    pathArgs?: Record<string, string>;
    /**
     * Query parameters to append to the URL, e.g. `?search=test&limit=10`.
     */
    queryParams?: Record<string, string | number | null>;
}

export type TransferUrlBuilder = ReturnType<typeof createUrlBuilder>;
export type BuiltUrl = URL & {
    method?: string
};

export function createUrlBuilder(
    baseUrl: string,
    routes: TransferRoutes
) {
    const applyPathArgs = (
        path: string,
        pathArgs?: Record<string, string>
    ) => {
        if (!pathArgs) {
            return path;
        }

        let resultPath = path;
        for (const [key, value] of Object.entries(pathArgs)) {
            resultPath = resultPath.replace(`{${key}}`, encodeURIComponent(value));
        }
        if (resultPath.includes('{') || resultPath.includes('}')) {
            throw new Error(`Missing path argument for path: ${resultPath}`);
        }
        return resultPath;
    };

    const applyQueryParams = (
        url: URL,
        queryParams?: Record<string, string | number | null>
    ) => {
        if (!queryParams) {
            return url;
        }

        for (const [key, value] of Object.entries(queryParams)) {
            if (value !== null && value !== undefined) {
                url.searchParams.append(key, String(value));
            }
        }
        return url;
    };

    return (
        path: TransferRoute,
        options: TransferUrlOptions = {}
    ): BuiltUrl => {
        // noinspection SuspiciousTypeOfGuard
        const knownRoute = routes[path as keyof TransferRoutes];
        path = (knownRoute)?.route || path;

        const method = (knownRoute)?.method;

        const builtUrl = applyQueryParams(
            new URL(applyPathArgs(path, options.pathArgs), baseUrl),
            options.queryParams
        );

        if (method) {
            (builtUrl as BuiltUrl).method = method;
        }

        return builtUrl as BuiltUrl;
    };
}
