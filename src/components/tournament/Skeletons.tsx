import { Card } from "@/components/site/Primitives";
import { Skeleton } from "@/components/ui/skeleton";

// =====================================================================
// Loading skeletons that mirror the real page layout, so nothing jumps
// when the state RPC lands.
// =====================================================================
export function TournamentPageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-6 md:p-8">
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-8 w-72 max-w-full" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      </Card>

      {/* Join bar */}
      <Card className="p-6">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-10 w-44 rounded-xl" />
          <Skeleton className="h-12 w-36 rounded-xl" />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Bracket */}
          <Card className="p-6">
            <Skeleton className="mb-5 h-6 w-32" />
            <div className="flex gap-6 overflow-hidden">
              {[4, 2, 1].map((n, col) => (
                <div key={col} className="flex w-[220px] shrink-0 flex-col justify-around gap-3">
                  {Array.from({ length: n }).map((_, i) => (
                    <Skeleton key={i} className="h-20 rounded-xl" />
                  ))}
                </div>
              ))}
            </div>
          </Card>
          {/* Table */}
          <Card className="p-6">
            <Skeleton className="mb-5 h-6 w-40" />
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-lg" />
              ))}
            </div>
          </Card>
        </div>
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-6">
              <Skeleton className="mb-4 h-6 w-28" />
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, j) => (
                  <Skeleton key={j} className="h-9 rounded-lg" />
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
