export function createProfileController(service) {
  return {
    get(req,res,next) { try { return res.json(service.get(req.user.id)); } catch (error) { return next(error); } },
    showcase(req,res,next) { try { return res.json(service.saveShowcase(req.user.id,req.body.slugs)); } catch (error) { return next(error); } },
    equip(req,res,next) { try { return res.json(service.equip(req.user.id,req.body.slot,req.body.itemSlug)); } catch (error) { return next(error); } },
  };
}
