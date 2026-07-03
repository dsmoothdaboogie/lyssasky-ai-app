import { render, screen, fireEvent } from '@testing-library/react';
import { FunnelProvider, useFunnelState } from './useFunnelState';

function Thrower() {
  useFunnelState();
  return null;
}

function Consumer() {
  const { leadId, answers, setLeadId, mergeAnswers, reset } = useFunnelState();
  return (
    <div>
      <p data-testid="leadId">{leadId ?? 'none'}</p>
      <p data-testid="roomType">{answers.roomType ?? 'none'}</p>
      <button onClick={() => setLeadId('lead-123')}>set lead</button>
      <button onClick={() => mergeAnswers({ roomType: 'living_room' })}>merge answers</button>
      <button onClick={() => reset()}>reset</button>
    </div>
  );
}

describe('useFunnelState', () => {
  it('throws when used outside a FunnelProvider', () => {
    // Suppress the expected React error log for this negative test.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Thrower />)).toThrow(/useFunnelState must be used within a FunnelProvider/);
    spy.mockRestore();
  });

  it('lets a provider-wrapped consumer read and update state', () => {
    render(
      <FunnelProvider>
        <Consumer />
      </FunnelProvider>
    );

    expect(screen.getByTestId('leadId')).toHaveTextContent('none');

    fireEvent.click(screen.getByText('set lead'));
    expect(screen.getByTestId('leadId')).toHaveTextContent('lead-123');

    fireEvent.click(screen.getByText('merge answers'));
    expect(screen.getByTestId('roomType')).toHaveTextContent('living_room');

    fireEvent.click(screen.getByText('reset'));
    expect(screen.getByTestId('leadId')).toHaveTextContent('none');
    expect(screen.getByTestId('roomType')).toHaveTextContent('none');
  });
});
