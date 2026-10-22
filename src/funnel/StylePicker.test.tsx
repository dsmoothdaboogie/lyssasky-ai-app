import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StylePicker } from './StylePicker';

const styles = [{ slug: 'scandi', name: 'Scandinavian' }, { slug: 'japandi', name: 'Japandi' }];
const moods = [{ value: 'warm_cozy', label: 'Warm & cozy' }, { value: 'light_airy', label: 'Light & airy' }];

it('requires a style and a mood, marks tried styles, and submits', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  render(<StylePicker styles={styles} moods={moods} triedStyles={new Set(['scandi'])} busy={false} onSubmit={onSubmit} />);

  expect(screen.getByRole('button', { name: /Scandinavian.*tried/ })).toBeInTheDocument();
  const restyle = screen.getByRole('button', { name: 'Restyle' });
  expect(restyle).toBeDisabled();

  await user.click(screen.getByRole('button', { name: /Japandi/ }));
  expect(restyle).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Light & airy' }));
  expect(restyle).toBeEnabled();
  await user.click(restyle);
  expect(onSubmit).toHaveBeenCalledWith('japandi', 'light_airy');
});

it('disables everything while busy', () => {
  render(<StylePicker styles={styles} moods={moods} triedStyles={new Set()} busy onSubmit={vi.fn()} />);
  expect(screen.getByRole('button', { name: /Styling/ })).toBeDisabled();
});
