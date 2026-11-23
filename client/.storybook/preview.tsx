import type { Preview } from '@storybook/react-vite'
import '../src/styles.css';

const preview: Preview = {
  parameters: {
    layout: 'centered',
    backgrounds: { options: { coinxp: { name: 'CoinXP canvas', value: '#f5f7fa' }, midnight: { name: 'Midnight', value: '#0f172a' } } },
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },
  },
};

export default preview;
