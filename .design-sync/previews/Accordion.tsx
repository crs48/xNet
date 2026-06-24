import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@xnetjs/ui'

export const Single = () => (
  <Accordion type="single" collapsible defaultValue="shipping">
    <AccordionItem value="shipping">
      <AccordionTrigger>How does shipping work?</AccordionTrigger>
      <AccordionContent>
        Orders are processed within one business day and ship via tracked courier. Delivery
        typically lands in three to five days.
      </AccordionContent>
    </AccordionItem>
    <AccordionItem value="returns">
      <AccordionTrigger>What is your return policy?</AccordionTrigger>
      <AccordionContent>
        Returns are accepted within 30 days of delivery as long as the item is unused and in its
        original packaging.
      </AccordionContent>
    </AccordionItem>
    <AccordionItem value="warranty">
      <AccordionTrigger>Is there a warranty?</AccordionTrigger>
      <AccordionContent>
        Every product carries a one-year limited warranty covering manufacturing defects.
      </AccordionContent>
    </AccordionItem>
  </Accordion>
)

export const Multiple = () => (
  <Accordion type="multiple" defaultValue={['keyboard', 'sharing']}>
    <AccordionItem value="keyboard">
      <AccordionTrigger>Keyboard shortcuts</AccordionTrigger>
      <AccordionContent>
        Press <code className="rounded bg-muted px-1 py-0.5 text-xs">cmd+k</code> to jump into
        search and command execution from anywhere.
      </AccordionContent>
    </AccordionItem>
    <AccordionItem value="sharing">
      <AccordionTrigger>Share settings</AccordionTrigger>
      <AccordionContent>
        Invitations can be revoked from the sidebar or the document header menu at any time.
      </AccordionContent>
    </AccordionItem>
    <AccordionItem value="sync">
      <AccordionTrigger>Offline sync</AccordionTrigger>
      <AccordionContent>
        Changes made offline are queued locally and merged automatically once you reconnect.
      </AccordionContent>
    </AccordionItem>
  </Accordion>
)
