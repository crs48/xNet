import {
  Button,
  IconButton,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipContent
} from '@xnetjs/ui'
import { Settings } from 'lucide-react'

// Overlay component — the simple <Tooltip content> wrapper has no open/defaultOpen prop,
// so we use the compound API with TooltipRoot defaultOpen to force it visible in the card.
// cfg.overrides.Tooltip: { cardMode: "single", viewport } contains the portal.
export const Default = () => (
  <TooltipProvider>
    <TooltipRoot defaultOpen>
      <TooltipTrigger render={<Button variant="outline">Hover for tooltip</Button>} />
      <TooltipContent side="top">Open the shared workspace</TooltipContent>
    </TooltipRoot>
  </TooltipProvider>
)

export const OnIcon = () => (
  <TooltipProvider>
    <TooltipRoot defaultOpen>
      <TooltipTrigger
        render={<IconButton icon={<Settings className="h-4 w-4" />} label="Settings" />}
      />
      <TooltipContent side="top">Workspace settings</TooltipContent>
    </TooltipRoot>
  </TooltipProvider>
)
