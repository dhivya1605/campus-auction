import { ApiError } from '../utils/ApiError.js';

export const notFoundMiddleware = (req, res, next) => {
  next(ApiError.notFound(`Cannot find ${req.method} ${req.originalUrl} on this server`));
};

