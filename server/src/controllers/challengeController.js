export function createChallengeController(gameEngine) {
  return {
    catalog(req, res) { return res.json(gameEngine.challengeCatalog(req.user.id)); },
    start(req, res, next) {
      try {
        const result = gameEngine.startChallenge(req.user.id, req.validatedParams.slug, req.get('Idempotency-Key'));
        return res.status(result.status).json(result.run);
      } catch (error) { return next(error); }
    },
    cancel(req, res, next) {
      try { return res.json(gameEngine.cancelChallenge(req.user.id, req.validatedParams.id)); }
      catch (error) { return next(error); }
    },
    abandon(req, res, next) {
      try { return res.json(gameEngine.abandonChallenge(req.user.id, req.validatedParams.id)); }
      catch (error) { return next(error); }
    },
    run(req, res, next) {
      try { return res.json(gameEngine.challengeRun(req.user.id, req.validatedParams.id)); }
      catch (error) { return next(error); }
    },
  };
}
