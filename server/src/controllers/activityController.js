export function createActivityController(service) {
  return { list(req,res,next) { try { res.json(service.list(req.user.id,req.validatedQuery)); } catch(error) { next(error); } } };
}
