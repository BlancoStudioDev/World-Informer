import type { ComponentProps, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface Props extends Omit<ComponentProps<typeof Button>, 'children' | 'size'> {
  /** nome accessibile e testo del tooltip (verbo all'inizio) */
  label: string
  kbd?: string
  size?: 'default' | 'sm'
  children: ReactNode
}

/** Pulsante quadrato con icona: tooltip reale (hover e focus) + aria-label. Il target sale a 44px sui dispositivi touch. */
export function IconBtn({ label, kbd, size = 'default', className, children, ...props }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          className={cn(size === 'sm' ? 'size-8 touch:size-11' : 'size-9 touch:size-11', 'text-muted-foreground hover:text-foreground aria-expanded:text-foreground', className)}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label}
        {kbd && <kbd className="ml-1 rounded border border-background/30 px-1 font-sans text-[11px] leading-4 opacity-80">{kbd}</kbd>}
      </TooltipContent>
    </Tooltip>
  )
}
