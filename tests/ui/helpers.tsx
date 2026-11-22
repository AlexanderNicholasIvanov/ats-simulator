import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect } from 'vitest';
import App from '../../src/App.tsx';

/** Render the App (with src/ats and src/extract mocked by the caller), load the sample and simulate. */
export async function renderSimulated() {
  const user = userEvent.setup();
  const view = render(<App />);
  await user.click(screen.getByRole('button', { name: 'Load sample' }));
  await user.click(screen.getByRole('button', { name: 'Simulate' }));
  expect(await screen.findAllByRole('article')).toHaveLength(8);
  return { user, ...view };
}
