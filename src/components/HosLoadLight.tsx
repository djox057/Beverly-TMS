import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { HosAssessment } from '../../supabase/functions/_shared/hos-planner';
import { cn } from '@/lib/utils';

export function HosLoadLight({ assessment, loading, error }: { assessment?: HosAssessment; loading?: boolean; error?: unknown }) {
  const color = loading || error || !assessment ? 'yellow' : assessment.color;
  const summary = loading ? 'Checking HOS…' : error ? 'HOS check unavailable. The order can still be created.' : assessment?.summary || 'Select a driver and enter the load to check HOS.';
  return <TooltipProvider><Tooltip><TooltipTrigger asChild>
    <button type="button" aria-label={`HOS ${color}: ${summary}`} className="inline-flex items-center gap-2 rounded-md px-2 py-2 text-sm" title={summary}>
      <span aria-hidden="true" className={cn('h-4 w-4 shrink-0 rounded-full ring-2 ring-offset-2 ring-offset-background',
        color==='green' ? 'bg-green-500 ring-green-500/30' : color==='red' ? 'bg-red-500 ring-red-500/30' : 'bg-yellow-400 ring-yellow-400/30', loading && 'animate-pulse')} />
      <span>HOS</span>
    </button>
  </TooltipTrigger><TooltipContent className="max-w-sm space-y-1 p-3">
    <p className="font-medium">{summary}</p>
    {!loading && !error && assessment?.reasons.map((reason, i) => <p key={i} className="text-xs">{reason}</p>)}
    {color==='red' && <p className="text-xs">Creating or assigning this load notifies the dispatcher’s office manager.</p>}
  </TooltipContent></Tooltip></TooltipProvider>;
}
