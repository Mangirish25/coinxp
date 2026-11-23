# Contributing

- Keep route/controller/service/repository layering; SQL belongs only in repositories.
- Store money as integer paise; never introduce floating-point money arithmetic.
- Keep transaction dates (local calendar dates) separate from UTC record timestamps.
- Keep XP, streak, and reward numbers in the server rules config. Visual presentation values belong in `client/src/visuals/visuals.config.ts`.
- Visual specs should be pure and deterministic. Pass data, quality tier, theme and motion mode as inputs; do not hide state in renderers.
- Add visual controls as stories in `client/src/stories/MotionLab/`; run `npm run storybook --workspace client` and `npm run build-storybook --workspace client` to inspect and build the Motion Lab.
- Keep visual stories on deterministic fixture data and run the Storybook Accessibility addon; do not connect stories to the live API.
- Run browser smoke flows with `npm run test:e2e --workspace client`; they stub API responses and cover desktop/mobile navigation. Local runs use installed Edge; CI provisions Chromium, Firefox and WebKit across desktop/mobile profiles.
- The browser suite runs axe checks on auth forms and Motion Lab stories, plus deterministic reduced-animation screenshots for the flame, medallion and calendar at desktop and mobile sizes. Screenshot baselines are platform-specific and are captured locally; CI runs the axe checks without comparing Windows snapshots. Refresh baselines only for intentional visual changes with `npm run test:e2e --workspace client -- --grep="motion lab" --update-snapshots`. The calendar uses row/cell grid semantics and arrow-key movement follows its week-column layout.
- Every animated state needs a text/ARIA equivalent. Respect OS reduced motion and user motion settings. Motion must not delay a financial action.
- Use Lucide icons and procedural SVG; do not add emoji UI.
- Include the relevant rule ID in new visual, security, or engine tests and commits where practical.
- Run `npm run lint`, client and server Vitest suites, and the client production build before opening a release PR.
