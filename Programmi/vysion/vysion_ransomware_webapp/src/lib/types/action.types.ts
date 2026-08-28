export enum ActionErrors {
    INTERNAL_SERVER_ERROR = "Internal server error",
    NOT_FOUND = "Not found",
    UNAUTHORIZED = "Unauthorized",
    FORBIDDEN = "Forbidden",
    BAD_REQUEST = "Bad request",
    CONFLICT = "Conflict",
    UNPROCESSABLE_ENTITY = "Unprocessable entity",
    TOO_MANY_REQUESTS = "Too many requests",
    UNKNOWN = "Unknown error",
}

// StatusCode to ActionErrors mapping
export const ActionErrorsMap: Record<number, ActionErrors> = {
    400: ActionErrors.BAD_REQUEST,
    401: ActionErrors.UNAUTHORIZED,
    403: ActionErrors.FORBIDDEN,
    404: ActionErrors.NOT_FOUND,
    409: ActionErrors.CONFLICT,
    422: ActionErrors.UNPROCESSABLE_ENTITY,
    429: ActionErrors.TOO_MANY_REQUESTS,
    500: ActionErrors.INTERNAL_SERVER_ERROR,
};

export type ActionResult<T> = {
    success: true;
    data: T;
};

export type ActionError = {
    success: false;
    errorCode: ActionErrors | number;
    errorMessage: string;
};

export type ActionResponse<T> = ActionResult<T> | ActionError;
