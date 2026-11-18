export function createMissionController(service) {
  return {
    list(req, res) { return res.json(service.current(req.user.id)); },
    reroll(req, res, next) {
      try { return res.json(service.reroll(req.user.id, req.params.slot)); }
      catch (error) { return next(error); }
    },
  };
}
