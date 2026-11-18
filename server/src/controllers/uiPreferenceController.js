import { createUiPreferenceService } from '../services/uiPreferenceService.js';

export function createUiPreferenceController(options) {
  const service = createUiPreferenceService(options);
  return {
    get: (req, res) => res.json(service.get(req.user.id)),
    save: (req, res) => res.json(service.save(req.user.id, req.body)),
  };
}
