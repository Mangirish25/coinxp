export function createStreakController(streakService) {
  return {
    summary: (req, res) => res.json(streakService.summary(req.user.id)),
    calendar: (req, res) => res.json(streakService.calendar(req.user.id, req.validatedQuery.from, req.validatedQuery.to)),
    freezes: (req, res) => res.json(streakService.freezeHistory(req.user.id, req.validatedQuery.page, req.validatedQuery.pageSize)),
    rules: (_req, res) => res.json(streakService.rules()),
  };
}
