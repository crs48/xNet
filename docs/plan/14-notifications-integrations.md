# 14: Notifications, Calendar & External Integrations

> Connecting a P2P system to the outside world

[← Back to Plan Overview](./README.md)

---

## The Challenge

xNet is P2P and local-first. But users need:
- **Notifications** when they're not in the app (due dates, assignments)
- **Calendar sync** with Google Calendar, Outlook, etc.
- **Webhooks** from external services (GitHub, Slack, etc.)

All of these traditionally require a server. How do we handle this?

### Platform Capabilities

| Feature | PWA | Native (iOS/Android) | Desktop (Electron/Tauri) |
|---------|-----|---------------------|--------------------------|
| Local notifications | Limited | Full | Full |
| Push notifications | Requires server | Requires server | N/A |
| Background sync | Service worker (limited) | Full | Full |
| OAuth flows | Needs redirect server | Can handle locally | Can handle locally |
| Scheduled tasks | No | Yes | Yes |
| Calendar API access | CORS issues | Native SDK | Direct API |

**Reality:** Some features will be native-only. PWA gets a degraded experience.

---

## Notifications

### Types of Notifications

| Type | Example | Timing |
|------|---------|--------|
| **Immediate** | "Alice assigned you a task" | When event happens |
| **Scheduled** | "Task X is due in 1 hour" | Specific time |
| **Digest** | "You have 3 overdue tasks" | Daily/weekly |

### Architecture

```mermaid
graph TB
    subgraph "Event Sources"
        TASK[Task Changes]
        CAL[Calendar Events]
        COLLAB[Collaboration]
    end

    subgraph "Notification Engine"
        QUEUE[Notification Queue]
        SCHEDULER[Scheduler]
        RULES[User Preferences]
    end

    subgraph "Delivery"
        LOCAL[Local Notifications]
        PUSH[Push Service]
        INAPP[In-App Banner]
    end

    TASK --> QUEUE
    CAL --> QUEUE
    COLLAB --> QUEUE

    QUEUE --> RULES
    RULES --> SCHEDULER

    SCHEDULER --> LOCAL
    SCHEDULER --> PUSH
    SCHEDULER --> INAPP

    style PUSH fill:#ffcdd2
```

### Local Notifications (No Server)

Works on native apps and desktop. App schedules notification locally.

```typescript
// Schedule a due date reminder
async function scheduleDueReminder(task: Task) {
  if (!task.dueDate) return

  const reminderTime = task.dueDate - 60 * 60 * 1000 // 1 hour before

  if (Platform.isNative) {
    await Notifications.schedule({
      id: `task-${task.id}-due`,
      title: 'Task due soon',
      body: task.title,
      scheduledAt: new Date(reminderTime),
      data: { taskId: task.id },
    })
  }
}

// React Native (expo-notifications)
import * as Notifications from 'expo-notifications'

await Notifications.scheduleNotificationAsync({
  content: {
    title: 'Task due soon',
    body: task.title,
  },
  trigger: { date: new Date(reminderTime) },
})
```

### Push Notifications (Requires Server)

For notifications when app is closed and no scheduled reminder exists (e.g., "Alice just assigned you a task").

**The problem:** P2P means Alice's device needs to notify Bob's device, but Bob might be offline.

**Solution: Lightweight relay server**

```mermaid
sequenceDiagram
    participant A as Alice's Device
    participant R as Push Relay
    participant P as Apple/Google Push
    participant B as Bob's Device

    A->>R: Send notification for Bob
    Note over R: Store until delivered
    R->>P: Push to Bob's token
    P->>B: Wake device
    B->>B: Show notification
    B->>R: Acknowledge
```

**What the relay stores:**
- Recipient's push token (encrypted)
- Notification payload (encrypted, relay can't read)
- Nothing else - no messages, no data

```typescript
// Relay is minimal
interface PushRelay {
  // Register device
  register(did: string, pushToken: EncryptedToken): Promise<void>

  // Send notification (encrypted payload)
  send(recipientDID: string, encryptedPayload: Uint8Array): Promise<void>
}

// Sender encrypts notification for recipient
const payload = await encrypt({
  title: 'New task assigned',
  body: task.title,
  data: { taskId: task.id },
}, recipientPublicKey)

await pushRelay.send(recipientDID, payload)
```

### PWA Limitations

| Feature | PWA Support |
|---------|-------------|
| In-app notifications | Yes |
| Local scheduled notifications | No (requires app open) |
| Push notifications | Yes, but needs service worker + server |
| Background sync | Limited (service worker) |

**PWA strategy:**
- Show in-app notifications when app is open
- Prompt users to install native app for full notifications
- Use email digest as fallback (requires email integration)

### Notification Preferences

```typescript
interface NotificationPreferences {
  // Channels
  inApp: boolean
  push: boolean
  email: boolean

  // Types
  taskAssigned: boolean
  taskDue: boolean
  mentions: boolean
  comments: boolean

  // Timing
  dueDateReminder: '15min' | '1hour' | '1day' | 'none'
  digestFrequency: 'realtime' | 'daily' | 'weekly' | 'none'

  // Quiet hours
  quietHours?: {
    start: string  // "22:00"
    end: string    // "08:00"
    timezone: string
  }
}
```

---

## Calendar

### Calendar View

Native calendar view in xNet for tasks with due dates:

```
┌─────────────────────────────────────────────────────────────────┐
│  ◀  January 2026  ▶                              Week │ Month  │
├─────────────────────────────────────────────────────────────────┤
│  Mon    Tue    Wed    Thu    Fri    Sat    Sun                  │
│                 1      2      3      4      5                   │
│                               ┌──┐                              │
│                               │2 │                              │
│                               └──┘                              │
│   6      7      8      9     10     11     12                   │
│  ┌──┐                 ┌──┐                                      │
│  │1 │                 │3 │                                      │
│  └──┘                 └──┘                                      │
│  13     14     15     16     17     18     19                   │
│         ┌──┐                        ┌──┐                        │
│         │1 │                        │2 │                        │
│         └──┘                        └──┘                        │
└─────────────────────────────────────────────────────────────────┘

Tasks on Jan 10:
┌─────────────────────────────────────────────────────────────────┐
│ ● Ship v1.0 release                              Due: 5:00 PM   │
│ ● Review PR #234                                 Due: EOD       │
│ ● Weekly team sync                               2:00 - 3:00 PM │
└─────────────────────────────────────────────────────────────────┘
```

**Data model:**

```typescript
interface CalendarEvent {
  id: string
  title: string
  type: 'task' | 'event' | 'external'

  // Timing
  startDate?: Date       // For events with duration
  endDate?: Date
  dueDate?: Date         // For tasks
  allDay: boolean

  // Links
  taskId?: string        // If linked to task
  externalId?: string    // If synced from Google/Outlook
  externalSource?: 'google' | 'outlook' | 'ical'

  // Recurrence
  recurrence?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
    interval: number
    until?: Date
    exceptions?: Date[]
  }
}
```

### Google Calendar Sync

**The OAuth challenge:** Google OAuth requires a redirect URL, typically a server endpoint.

**Solutions by platform:**

#### Native Apps (iOS/Android)

Can use native OAuth libraries that handle redirect locally:

```typescript
// React Native with expo-auth-session
import * as Google from 'expo-auth-session/providers/google'

const [request, response, promptAsync] = Google.useAuthRequest({
  clientId: 'YOUR_CLIENT_ID',
  scopes: ['https://www.googleapis.com/auth/calendar'],
})

// OAuth flow happens in-app, no server needed
const { accessToken } = response.authentication

// Sync directly to Google Calendar API
await syncToGoogleCalendar(accessToken, events)
```

#### Desktop (Electron/Tauri)

Can spawn local HTTP server for OAuth redirect:

```typescript
// Electron: local redirect server
const server = http.createServer((req, res) => {
  const code = new URL(req.url, 'http://localhost').searchParams.get('code')
  exchangeCodeForToken(code)
  res.end('You can close this window')
  server.close()
})

server.listen(8234)  // Random port

// Open OAuth URL
shell.openExternal(
  `https://accounts.google.com/oauth?redirect_uri=http://localhost:8234&...`
)
```

#### PWA (Limited)

Options:
1. **OAuth proxy server** - Small server that handles OAuth redirect, returns token to PWA
2. **No sync** - PWA just doesn't get Google Calendar sync
3. **Manual import/export** - User downloads .ics file, uploads to xNet

**Recommended:** PWA gets manual .ics import/export. Native gets full sync.

### Sync Architecture

```mermaid
graph LR
    subgraph "xNet"
        TASKS[Tasks with Dates]
        CAL[Calendar View]
        SYNC[Sync Engine]
    end

    subgraph "External"
        GCAL[Google Calendar]
        OUTLOOK[Outlook]
        ICAL[.ics Files]
    end

    TASKS --> CAL
    CAL <--> SYNC
    SYNC <-->|Native only| GCAL
    SYNC <-->|Native only| OUTLOOK
    SYNC <-->|All platforms| ICAL

    style GCAL fill:#e8f5e9
    style OUTLOOK fill:#e3f2fd
```

### Sync Logic

```typescript
interface CalendarSync {
  // Setup
  connect(provider: 'google' | 'outlook'): Promise<void>
  disconnect(provider: string): Promise<void>

  // Sync
  pull(): Promise<CalendarEvent[]>       // Get external events
  push(events: CalendarEvent[]): Promise<void>  // Send xNet events

  // Conflict resolution
  onConflict: (local: CalendarEvent, remote: CalendarEvent) => CalendarEvent
}

// Two-way sync
async function syncCalendar() {
  // Pull external events
  const remoteEvents = await googleCalendar.pull()

  // Merge with local
  for (const remote of remoteEvents) {
    const local = await db.calendar.get(remote.externalId)
    if (!local) {
      await db.calendar.insert({ ...remote, externalSource: 'google' })
    } else if (remote.updatedAt > local.syncedAt) {
      await db.calendar.update(local.id, remote)
    }
  }

  // Push local changes
  const localChanges = await db.calendar.getUnsyncedChanges()
  await googleCalendar.push(localChanges)
}
```

### Conflict Resolution

| Scenario | Resolution |
|----------|------------|
| Same event edited both places | Last-write-wins based on timestamp |
| Event deleted externally | Mark deleted in xNet, show in "Recently Deleted" |
| Event deleted in xNet | Delete from external calendar |
| New event in external | Import to xNet |
| New event in xNet | Create in external (if "sync to calendar" enabled) |

---

## External Integrations Pattern

### The General Problem

P2P apps can't receive webhooks or make authenticated API calls easily. Here's a pattern for external integrations:

```mermaid
graph TB
    subgraph "User Devices"
        D1[Device 1]
        D2[Device 2]
    end

    subgraph "Integration Bridge (Optional Server)"
        OAUTH[OAuth Handler]
        WEBHOOK[Webhook Receiver]
        QUEUE[Message Queue]
    end

    subgraph "External Services"
        GCAL[Google Calendar]
        GITHUB[GitHub]
        SLACK[Slack]
    end

    D1 <--> OAUTH
    OAUTH <--> GCAL
    OAUTH <--> GITHUB

    GITHUB -->|Webhook| WEBHOOK
    SLACK -->|Webhook| WEBHOOK
    WEBHOOK --> QUEUE

    D1 <--> QUEUE
    D2 <--> QUEUE

    style OAUTH fill:#fff3e0
    style WEBHOOK fill:#fff3e0
    style QUEUE fill:#fff3e0
```

### Integration Bridge

A minimal server that only handles:
1. **OAuth redirects** - Get tokens, pass to client
2. **Webhook ingestion** - Receive webhooks, queue for clients
3. **Nothing else** - No data storage, no business logic

```typescript
// Integration bridge is stateless and minimal
interface IntegrationBridge {
  // OAuth
  getOAuthURL(provider: string, state: string): string
  handleOAuthCallback(code: string): Promise<{ accessToken: string, refreshToken: string }>

  // Webhooks
  registerWebhook(provider: string, userDID: string): Promise<string>  // Returns webhook URL
  pollWebhooks(userDID: string): Promise<WebhookEvent[]>  // Client polls for events
}
```

### What Requires the Bridge vs What Doesn't

| Integration | Native App | PWA | Requires Bridge |
|-------------|-----------|-----|-----------------|
| Google Calendar sync | Direct | No | No (native) / Yes (PWA) |
| GitHub webhooks | Via bridge | Via bridge | Yes |
| Slack notifications | Via bridge | Via bridge | Yes |
| .ics import/export | Direct | Direct | No |
| Email sending | Via bridge | Via bridge | Yes |
| Push notifications | Via relay | Via relay | Yes |

### Self-Hosted Bridge Option

For privacy-conscious users, the bridge can be self-hosted:

```yaml
# docker-compose.yml
services:
  xnet-bridge:
    image: xnet/integration-bridge
    environment:
      - GOOGLE_CLIENT_ID=...
      - GOOGLE_CLIENT_SECRET=...
      - GITHUB_WEBHOOK_SECRET=...
    ports:
      - "8080:8080"
```

---

## ERP Integration Points

For Canvas and ERP modules, notifications are critical:

### Task Notifications

| Event | Notification | Priority |
|-------|--------------|----------|
| Task assigned to me | Immediate push | High |
| Task I'm watching updated | In-app + digest | Medium |
| Task due in 1 hour | Scheduled local | High |
| Task overdue | Push + badge | High |
| Comment on my task | Push | Medium |
| Mentioned in comment | Push | Medium |

### Workflow Notifications

| Event | Notification |
|-------|--------------|
| Approval requested | Push |
| Approval granted/denied | Push |
| Workflow step completed | In-app |
| Workflow blocked | Push to assignee |

### Calendar Integration for ERP

```typescript
// Sync ERP events to calendar
interface ERPCalendarIntegration {
  // Project milestones
  syncMilestones(projectId: string): Promise<void>

  // Sprint dates
  syncSprints(projectId: string): Promise<void>

  // Resource allocation
  syncResourceCalendar(userId: string): Promise<void>

  // Leave/PTO
  syncTimeOff(teamId: string): Promise<void>
}
```

---

## Implementation Phases

### Phase 1: Local Notifications (MVP)

- In-app notification banner
- Local scheduled reminders (native only)
- Notification preferences UI

```typescript
// MVP API
const notifications = useNotifications()

notifications.show({
  title: 'Task assigned',
  body: 'Alice assigned you "Review PR"',
  action: () => navigate(`/tasks/${taskId}`),
})

// For native
notifications.schedule({
  title: 'Due soon',
  body: task.title,
  at: task.dueDate - 3600000,
})
```

### Phase 2: Push Notifications

- Push notification relay server
- Background sync for native apps
- Push token registration

### Phase 3: Calendar View

- Month/week/day views
- Drag to reschedule
- Filter by project/tag

### Phase 4: External Calendar Sync

- Google Calendar (native)
- Outlook Calendar (native)
- .ics import/export (all platforms)

### Phase 5: Integration Bridge

- OAuth proxy for PWA
- Webhook receiver
- GitHub, Slack, etc.

---

## Platform Feature Matrix

| Feature | PWA | iOS | Android | Desktop |
|---------|-----|-----|---------|---------|
| In-app notifications | ✓ | ✓ | ✓ | ✓ |
| Local scheduled notifications | ✗ | ✓ | ✓ | ✓ |
| Push notifications | ✓* | ✓ | ✓ | ✗ |
| Calendar view | ✓ | ✓ | ✓ | ✓ |
| Google Calendar sync | ✗** | ✓ | ✓ | ✓ |
| .ics import/export | ✓ | ✓ | ✓ | ✓ |
| Background sync | Limited | ✓ | ✓ | ✓ |

\* Requires server + service worker
\** Could work with OAuth proxy, but complex

---

## Summary

| Component | Server Required? | PWA Support |
|-----------|------------------|-------------|
| In-app notifications | No | Yes |
| Local scheduled notifications | No | No |
| Push notifications | Yes (relay) | Yes |
| Calendar view | No | Yes |
| Google Calendar sync | No (native) / Yes (PWA) | Limited |
| Webhook integrations | Yes (bridge) | Yes |

**Key takeaway:** Native apps get the full experience. PWA users should be encouraged to install the native app for notifications and calendar sync.

---

[← Back to Plan Overview](./README.md) | [Previous: Identity & Authentication](./13-identity-authentication.md)
