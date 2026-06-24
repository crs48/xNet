import { Tabs, TabsContent, TabsList, TabsTrigger, Badge } from '@xnetjs/ui'

export const Default = () => (
  <Tabs defaultValue="activity">
    <TabsList>
      <TabsTrigger value="activity">Activity</TabsTrigger>
      <TabsTrigger value="notes">Notes</TabsTrigger>
      <TabsTrigger value="history">History</TabsTrigger>
    </TabsList>
    <TabsContent value="activity">
      <p className="text-sm text-foreground-muted">
        Recent mutations, sync pings, and command events for the selected node.
      </p>
    </TabsContent>
    <TabsContent value="notes">
      <p className="text-sm text-foreground-muted">
        Narrative context written by the document owner.
      </p>
    </TabsContent>
    <TabsContent value="history">
      <p className="text-sm text-foreground-muted">
        Timeline snapshots with author and timestamp metadata.
      </p>
    </TabsContent>
  </Tabs>
)

export const WithCounts = () => (
  <Tabs defaultValue="inbox">
    <TabsList>
      <TabsTrigger value="inbox">
        <span className="flex items-center gap-2">
          Inbox
          <Badge variant="secondary">12</Badge>
        </span>
      </TabsTrigger>
      <TabsTrigger value="mentions">
        <span className="flex items-center gap-2">
          Mentions
          <Badge variant="secondary">3</Badge>
        </span>
      </TabsTrigger>
      <TabsTrigger value="archived">Archived</TabsTrigger>
    </TabsList>
    <TabsContent value="inbox">
      <p className="text-sm text-foreground-muted">
        12 unread updates across your subscribed workspaces.
      </p>
    </TabsContent>
    <TabsContent value="mentions">
      <p className="text-sm text-foreground-muted">3 threads mention you directly.</p>
    </TabsContent>
    <TabsContent value="archived">
      <p className="text-sm text-foreground-muted">Everything you have cleared lives here.</p>
    </TabsContent>
  </Tabs>
)
