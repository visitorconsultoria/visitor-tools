import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'

type Props = {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  rows?: number
  disabled?: boolean
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function RichTextEditor({ value, onChange, placeholder = '', rows = 3, disabled = false }: Props) {
  const minHeight = `${rows * 1.5 + 1}rem`

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: false, allowBase64: true }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    editable: !disabled,
    onUpdate({ editor: ed }) {
      onChange(ed.getHTML())
    },
  })

  // Sync disabled state
  useEffect(() => {
    if (!editor) return
    editor.setEditable(!disabled)
  }, [editor, disabled])

  const handlePaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (!editor || disabled) return
    const items = Array.from(event.clipboardData.items)
    const imageItem = items.find((item) => item.type.startsWith('image/'))
    if (!imageItem) return

    event.preventDefault()
    const file = imageItem.getAsFile()
    if (!file) return

    try {
      const src = await fileToBase64(file)
      editor.chain().focus().setImage({ src }).run()
    } catch {
      // Paste as plain text fallback if conversion fails
    }
  }

  const handleToolbarAction = (action: string) => {
    if (!editor) return
    switch (action) {
      case 'bold': editor.chain().focus().toggleBold().run(); break
      case 'italic': editor.chain().focus().toggleItalic().run(); break
      case 'strike': editor.chain().focus().toggleStrike().run(); break
      case 'bulletList': editor.chain().focus().toggleBulletList().run(); break
      case 'orderedList': editor.chain().focus().toggleOrderedList().run(); break
      case 'codeBlock': editor.chain().focus().toggleCodeBlock().run(); break
    }
  }

  if (!editor) return null

  return (
    <div className={`rich-editor${disabled ? ' rich-editor--disabled' : ''}`}>
      {!disabled && (
        <div className="rich-editor__toolbar">
          <button
            type="button"
            className={`rich-editor__btn${editor.isActive('bold') ? ' rich-editor__btn--active' : ''}`}
            onMouseDown={(e) => { e.preventDefault(); handleToolbarAction('bold') }}
            title="Negrito"
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            className={`rich-editor__btn${editor.isActive('italic') ? ' rich-editor__btn--active' : ''}`}
            onMouseDown={(e) => { e.preventDefault(); handleToolbarAction('italic') }}
            title="Itálico"
          >
            <em>I</em>
          </button>
          <button
            type="button"
            className={`rich-editor__btn${editor.isActive('strike') ? ' rich-editor__btn--active' : ''}`}
            onMouseDown={(e) => { e.preventDefault(); handleToolbarAction('strike') }}
            title="Tachado"
          >
            <s>S</s>
          </button>
          <span className="rich-editor__separator" />
          <button
            type="button"
            className={`rich-editor__btn${editor.isActive('bulletList') ? ' rich-editor__btn--active' : ''}`}
            onMouseDown={(e) => { e.preventDefault(); handleToolbarAction('bulletList') }}
            title="Lista com marcadores"
          >
            ≡
          </button>
          <button
            type="button"
            className={`rich-editor__btn${editor.isActive('orderedList') ? ' rich-editor__btn--active' : ''}`}
            onMouseDown={(e) => { e.preventDefault(); handleToolbarAction('orderedList') }}
            title="Lista numerada"
          >
            1.
          </button>
          <button
            type="button"
            className={`rich-editor__btn${editor.isActive('codeBlock') ? ' rich-editor__btn--active' : ''}`}
            onMouseDown={(e) => { e.preventDefault(); handleToolbarAction('codeBlock') }}
            title="Bloco de código"
          >
            {'</>'}
          </button>
        </div>
      )}
      <div onPaste={handlePaste} style={{ minHeight, cursor: 'text' }} onClick={() => { if (!disabled) editor.commands.focus() }}>
        <EditorContent editor={editor} className="rich-editor__content" />
      </div>
    </div>
  )
}
