import { Router } from 'express';
import { createCategoryController } from '../controllers/categoryController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireJson } from '../middleware/requireJson.js';
import { validateBody } from '../middleware/validateBody.js';
import { validateParams } from '../middleware/validateParams.js';
import { validateQuery } from '../middleware/validateQuery.js';
import {
  categoryIdParamsSchema,
  categoryListQuerySchema,
  createCategorySchema,
  updateCategorySchema,
} from '../validators/categorySchemas.js';

export function createCategoryRoutes({ db, env }) {
  const router = Router();
  const controller = createCategoryController({ db });
  router.use(requireAuth({ db, secret: env.jwtSecret }));
  router.get('/', validateQuery(categoryListQuerySchema), controller.list);
  router.post('/', requireJson, validateBody(createCategorySchema), controller.create);
  router.patch(
    '/:id',
    requireJson,
    validateParams(categoryIdParamsSchema),
    validateBody(updateCategorySchema),
    controller.update,
  );
  router.delete('/:id', requireJson, validateParams(categoryIdParamsSchema), controller.delete);
  return router;
}
