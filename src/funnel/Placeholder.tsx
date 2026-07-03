import { FunnelLayout } from './FunnelLayout';

/**
 * Temporary stand-in for a funnel screen that hasn't been built yet.
 * Later tasks (18-25) replace each usage with the real screen component.
 */
export function Placeholder({ name }: { name: string }) {
  return (
    <FunnelLayout>
      <p>{name} — coming soon</p>
    </FunnelLayout>
  );
}
