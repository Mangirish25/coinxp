import { Readable } from 'node:stream';
import { createAccountService } from '../services/accountService.js';

export function createAccountController({ db, clock }) {
  const service = createAccountService({ db, clock });
  return {
    export(req, res, next) {
      try {
        const data = service.createExport(req.user.id);
        const sections = data.sections;
        res.status(200);
        res.type('application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="coinxp-export.json"');
        res.setHeader('Cache-Control', 'private, no-store, max-age=0');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        const output = function* () {
          yield `{"schemaVersion":${JSON.stringify(data.schemaVersion)},"exportedAt":${JSON.stringify(data.exportedAt)},"profile":${JSON.stringify(data.profile)},"data":{`;
          let firstSection = true;
          for (const [name, rows] of sections) {
            if (!firstSection) yield ',';
            firstSection = false;
            yield `${JSON.stringify(name)}:[`;
            let firstRow = true;
            for (const row of rows) {
              if (!firstRow) yield ',';
              firstRow = false;
              yield JSON.stringify(row);
            }
            yield ']';
          }
          yield '}}';
        };
        Readable.from(output()).on('error', next).pipe(res);
      } catch (error) { next(error); }
    },
  };
}
