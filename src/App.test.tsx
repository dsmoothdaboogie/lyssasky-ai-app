import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

test('renders the landing placeholder at the root route', () => {
  render(<MemoryRouter><App /></MemoryRouter>);
  expect(screen.getByText(/landing — coming soon/i)).toBeInTheDocument();
});

test('renders the Lyssasky wordmark via the funnel shell', () => {
  render(<MemoryRouter><App /></MemoryRouter>);
  expect(screen.getByText(/^lyssasky$/i)).toBeInTheDocument();
});
