'use client'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
}

export function SearchBar({ value, onChange, placeholder = 'Search skills by name, description, or trigger...', disabled }: Props) {
  return (
    <div className="relative flex-1">
      <input
        type="text"
        value={value}
        onChange={e => !disabled && onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape' && !disabled) onChange('') }}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          color: disabled ? 'var(--text-dim)' : 'var(--text)',
          padding: '8px 12px',
          fontSize: '14px',
          width: '100%',
          outline: 'none',
          transition: 'border-color 0.15s',
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? 'default' : 'text',
        }}
        onFocus={e => { if (!disabled) e.target.style.borderColor = 'var(--primary)' }}
        onBlur={e => (e.target.style.borderColor = 'var(--border)')}
      />
      {value && !disabled && (
        <button
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', padding: 0 }}
        >
          ✕
        </button>
      )}
    </div>
  )
}
