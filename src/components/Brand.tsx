export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand--compact' : ''}`}>
      <div className="brand__seal" aria-hidden="true"><span>読</span></div>
      <div>
        <div className="brand__name">KomaYomi</div>
        {!compact && <div className="brand__tagline">read between the lines</div>}
      </div>
    </div>
  )
}
