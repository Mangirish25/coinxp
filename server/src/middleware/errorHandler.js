export function errorHandler(error, _req, res, _next) {
  const status =
    Number.isInteger(error.status) && error.status >= 400 && error.status < 600
      ? error.status
      : 500;
  const code = status === 400 ? 'BAD_REQUEST' : status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR';
  const message = status === 500 ? 'An unexpected server error occurred.' : error.message;
  res.status(status).json({ error: { code, message } });
}
