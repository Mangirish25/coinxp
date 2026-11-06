export function requestLogger(logger = console) {
  return (req, res, next) => {
    const started = Date.now();
    res.on('finish', () =>
      logger.info(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - started}ms`),
    );
    next();
  };
}
