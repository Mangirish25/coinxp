export function createShopController(service) {
  return {
    catalog(req, res) { return res.json(service.list(req.user.id)); },
    purchase(req, res, next) {
      try {
        const result = service.purchase(req.user.id, req.body.itemSlug, req.get('Idempotency-Key'));
        return res.status(result.status).json(result.purchase);
      } catch (error) { return next(error); }
    },
    history(req, res) { return res.json({ data: service.history(req.user.id) }); },
  };
}
