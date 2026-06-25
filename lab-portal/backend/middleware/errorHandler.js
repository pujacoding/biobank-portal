/**
 * Centralized Error Handler Middleware
 */
export default function errorHandler(err, req, res, next) {
  console.error('[SERVER ERROR]', err);

  const statusCode = err.status || err.statusCode || 500;
  const errorMessage = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    error: errorMessage
  });
}
