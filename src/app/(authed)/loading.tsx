// Fallback loading for any authed segment without its own loading.tsx.
// Kept whisper-light — NavigationProgress already proved motion on click.
import { InstantLoading } from '@/components/InstantLoading';

export default function Loading() {
  return <InstantLoading />;
}
