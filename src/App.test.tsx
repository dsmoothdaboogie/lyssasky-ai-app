import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

test('renders the Lyssasky landing headline', () => {
  render(<MemoryRouter><App /></MemoryRouter>);
  expect(screen.getByText(/see your room, restyled/i)).toBeInTheDocument();
});
