import type { ReactNode } from 'react'

interface Props {
  isOpen: boolean
  changelog: string
  onClose: () => void
}

type Block = { type: 'h1' | 'h2' | 'h3' | 'p'; text: string } | { type: 'bulletList'; items: string[] }

/** Splits `**bold**` runs out of an otherwise-plain line into JSX -- the only inline markdown syntax
 *  this changelog actually uses. */
function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>
  )
}

/** A deliberately minimal changelog-flavored markdown parser -- headings (#/##/###), bullet lists,
 *  and plain paragraphs, with indented continuation lines folded into the previous bullet/paragraph.
 *  Not a general-purpose markdown renderer; just enough for how CHANGELOG.md in this repo is
 *  actually written, so this feature doesn't need a new markdown-parsing dependency. */
function parseChangelog(markdown: string): Block[] {
  const blocks: Block[] = []
  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue

    if (line.startsWith('### ')) {
      blocks.push({ type: 'h3', text: line.slice(4) })
    } else if (line.startsWith('## ')) {
      blocks.push({ type: 'h2', text: line.slice(3) })
    } else if (line.startsWith('# ')) {
      blocks.push({ type: 'h1', text: line.slice(2) })
    } else if (line.startsWith('- ')) {
      const last = blocks[blocks.length - 1]
      const item = line.slice(2)
      if (last && last.type === 'bulletList') last.items.push(item)
      else blocks.push({ type: 'bulletList', items: [item] })
    } else {
      // A continuation line (wrapped description text) belongs to whatever came just before it.
      const last = blocks[blocks.length - 1]
      if (last && last.type === 'bulletList') last.items[last.items.length - 1] += ' ' + line
      else if (last && last.type === 'p') last.text += ' ' + line
      else blocks.push({ type: 'p', text: line })
    }
  }
  return blocks
}

function ChangelogView({ markdown }: { markdown: string }): React.JSX.Element {
  const blocks = parseChangelog(markdown)
  return (
    <div className="whats-new__body">
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'h1':
            return <h1 key={i}>{block.text}</h1>
          case 'h2':
            return <h2 key={i}>{block.text}</h2>
          case 'h3':
            return <h3 key={i}>{block.text}</h3>
          case 'bulletList':
            return (
              <ul key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item)}</li>
                ))}
              </ul>
            )
          case 'p':
            return <p key={i}>{renderInline(block.text)}</p>
        }
      })}
    </div>
  )
}

function WhatsNewModal({ isOpen, changelog, onClose }: Props): React.JSX.Element | null {
  if (!isOpen) return null
  return (
    <div className="whats-new__overlay" onMouseDown={onClose}>
      <div className="whats-new__panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="whats-new__header">
          <span>What's New</span>
          <button className="whats-new__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="whats-new__scroll">
          {changelog ? <ChangelogView markdown={changelog} /> : <p className="whats-new__empty">Changelog not available.</p>}
        </div>
      </div>
    </div>
  )
}

export default WhatsNewModal
