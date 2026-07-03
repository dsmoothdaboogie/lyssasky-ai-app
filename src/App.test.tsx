import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

vi.mock('./firebase/api', () => ({
  apiLogEvent: vi.fn().mockResolvedValue({ ok: true }),
}));

test('renders the landing page at the root route', () => {
  render(<MemoryRouter><App /></MemoryRouter>);
  expect(screen.getByRole('heading', { name: /see your room, restyled/i })).toBeInTheDocument();
});

test('renders the Lyssasky wordmark via the funnel shell', () => {
  render(<MemoryRouter><App /></MemoryRouter>);
  expect(screen.getByText(/^lyssasky$/i)).toBeInTheDocument();
});
