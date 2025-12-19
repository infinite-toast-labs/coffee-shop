export type ApiError = {
  error: string;
  code: string;
  detail?: string;
};

export const isD1NotReadyError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }
  return /no such table/i.test(error.message) || /table .* does not exist/i.test(error.message);
};

export const toApiError = (error: unknown): ApiError => {
  if (isD1NotReadyError(error)) {
    return {
      error: "Database not initialized",
      code: "DB_NOT_READY",
      detail:
        "Run D1 migrations for this environment before using the API.",
    };
  }

  return {
    error: "Unexpected backend error",
    code: "BACKEND_ERROR",
  };
};
