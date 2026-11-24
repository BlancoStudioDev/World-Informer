import { Button } from '@/components/ui/button'

/** Stato vuoto: titolo, una frase e (opzionale) un'azione con verbo. Nessuna illustrazione. */
export function EmptyState({ title, text, action }: { title: string; text: string; action?: { label: string; run: () => void } }) {
  return (
    <div role="status" className="flex flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-[28ch] text-xs text-muted-foreground">{text}</p>
      {action && <Button variant="outline" size="sm" className="mt-3" onClick={action.run}>{action.label}</Button>}
    </div>
  )
}
