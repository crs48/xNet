import { ScrollArea, Badge } from '@xnetjs/ui'

const commits = [
  { sha: 'e06c504', msg: 'fix(sync): deterministic LWW author tiebreak', author: 'crs' },
  { sha: 'b69494a', msg: 'fix(sync): LWW author tiebreak by code unit', author: 'crs' },
  { sha: '6e45988', msg: 'xnet-core: a portable Rust protocol kernel', author: 'mira' },
  { sha: '1e7ffbd', msg: 'feat(rust): xnet-core portable kernel', author: 'mira' },
  { sha: '2c40990', msg: 'docs(changelog): link PR #236 to fragment', author: 'crs' },
  { sha: '5add4a2', msg: 'feat: integration plugin catalog', author: 'jules' },
  { sha: '02d0583', msg: 'feat: Linear pull connector', author: 'jules' },
  { sha: '8797dfd', msg: 'feat(brain): hybrid GraphRAG retrieve', author: 'mira' },
  { sha: '4f059cc', msg: 'feat(brain): retrieveContext seam', author: 'mira' },
  { sha: 'c7bf3e7', msg: 'feat(web): graph-aware retrieval live', author: 'crs' },
  { sha: '9ece498', msg: 'feat(vectors): semantic vector tier', author: 'mira' },
  { sha: '2994722', msg: 'feat(swift): L2/L3 golden vectors', author: 'dana' },
  { sha: '719d66a', msg: 'feat(swift): native SDK reactive loop', author: 'dana' },
  { sha: '077e515', msg: 'fix(proto): lamport integer protocol fix', author: 'dana' }
]

export const CommitLog = () => (
  <ScrollArea className="h-64 rounded-lg border border-border bg-background-subtle">
    <div className="space-y-1 p-3">
      {commits.map((c) => (
        <div
          key={c.sha}
          className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{c.msg}</p>
            <p className="text-xs text-foreground-muted">
              <code>{c.sha}</code> · {c.author}
            </p>
          </div>
          <Badge variant="outline">{c.author}</Badge>
        </div>
      ))}
    </div>
  </ScrollArea>
)

export const SimpleList = () => (
  <ScrollArea className="h-64 rounded-lg border border-border">
    <div className="space-y-2 p-3">
      {Array.from({ length: 24 }, (_, i) => (
        <div
          key={i}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          Story module {String(i + 1).padStart(2, '0')}
        </div>
      ))}
    </div>
  </ScrollArea>
)
