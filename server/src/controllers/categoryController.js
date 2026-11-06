import { createCategoryService } from '../services/categoryService.js';

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function createCategoryController({ db }) {
  const service = createCategoryService({ db });
  return {
    list: (req, res) => res.json(service.list(req.user.id, req.validatedQuery.type)),
    create: asyncHandler(async (req, res) =>
      res.status(201).json(await service.create(req.user.id, req.body)),
    ),
    update: asyncHandler(async (req, res) =>
      res.json(await service.update(req.user.id, req.validatedParams.id, req.body)),
    ),
    delete: asyncHandler(async (req, res) => {
      await service.delete(req.user.id, req.validatedParams.id);
      res.status(204).end();
    }),
  };
}
