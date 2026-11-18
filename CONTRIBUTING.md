# Contributing

- Keep route/controller/service/repository layering; SQL belongs only in repositories.
- Store money as integer paise; never introduce floating-point money arithmetic.
- Keep transaction dates (local calendar dates) separate from UTC record timestamps.
- Keep XP, streak, and reward numbers in the server rules config. Visual presentation values belong in `client/src/visuals/visuals.config.ts`.
- Visual specs should be pure and deterministic. Pass data, quality tier, theme and motion mode as inputs; do not hide state in renderers.
- Every animated state needs a text/ARIA equivalent. Respect OS reduced motion and user motion settings. Motion must not delay a financial action.
- Use Lucide icons and procedural SVG; do not add emoji UI.
- Include the relevant rule ID in new visual, security, or engine tests and commits where practical.
- Run `npm run lint`, client and server Vitest suites, and the client production build before opening a release PR.
