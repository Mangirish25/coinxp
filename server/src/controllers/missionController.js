export function createMissionController(service) {
  return { list(req, res) { return res.json(service.current(req.user.id)); } };
}
