export function createBadgeController(gameEngine) {
  return {
    catalog(req, res) {
      return res.json(gameEngine.badgeCatalog(req.user.id));
    },
  };
}
