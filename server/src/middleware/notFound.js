export function notFoundHandler(_req, res) {
  res
    .status(404)
    .json({ error: { code: 'NOT_FOUND', message: 'The requested endpoint was not found.' } });
}
