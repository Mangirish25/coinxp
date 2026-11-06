export function errorHandler(error, _req, res, _next) {
  const status =
    Number.isInteger(error.status) && error.status >= 400 && error.status < 600
      ? error.status
      : 500;
  const hasSafeCode =
    error.expose === true && typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code);
  const code =
    status === 500
      ? 'INTERNAL_ERROR'
      : hasSafeCode
        ? error.code
        : status === 400
          ? 'BAD_REQUEST'
          : status === 404
            ? 'NOT_FOUND'
            : 'REQUEST_ERROR';
  const message =
    status === 500
      ? 'An unexpected server error occurred.'
      : hasSafeCode
        ? error.message
        : status === 413
          ? 'Request body is too large.'
          : 'The request could not be processed.';
  res.status(status).json({ error: { code, message } });
}
