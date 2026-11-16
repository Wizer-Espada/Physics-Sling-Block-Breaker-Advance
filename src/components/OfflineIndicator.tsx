import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus.ts';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div
      role="status"
      className="absolute top-14 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-lg bg-[#0b1120]/95 border border-amber-500/40 text-amber-300 text-xs font-medium flex items-center gap-1.5 shadow-lg pointer-events-none whitespace-nowrap"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>Offline Mode · Local Play Active</span>
    </div>
  );
}
