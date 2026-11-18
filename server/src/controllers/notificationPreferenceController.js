export function createNotificationPreferenceController(service) {
  return {
    get(req,res,next) { try { res.json({ preferences: service.preferences(req.user.id) }); } catch(error) { next(error); } },
    put(req,res,next) { try { res.json(service.update(req.user.id,req.body.preferences)); } catch(error) { next(error); } },
  };
}
