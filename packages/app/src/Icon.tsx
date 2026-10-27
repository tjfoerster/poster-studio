// Lucide icons (https://lucide.dev) as inline SVG.
import type { IconNode } from 'lucide'
import { createElement } from 'preact'

export function Icon({ icon, size = 16 }: { icon: IconNode; size?: number }) {
  return (
    <svg class="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {icon.map(([tag, attributes], i) => createElement(tag, { key: i, ...attributes }))}
    </svg>
  )
}
