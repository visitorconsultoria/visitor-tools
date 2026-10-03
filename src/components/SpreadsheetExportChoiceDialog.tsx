type SpreadsheetExportChoiceDialogProps = {
  routineName: string
  onExportFilteredRows: () => void
  onConfigureFilters: () => void
  onCancel: () => void
}

export default function SpreadsheetExportChoiceDialog({
  routineName,
  onExportFilteredRows,
  onConfigureFilters,
  onCancel,
}: SpreadsheetExportChoiceDialogProps) {
  return (
    <div className="estimativas-modal-overlay" role="presentation">
      <section className="estimativas-modal" role="dialog" aria-modal="true" aria-labelledby="spreadsheet-export-choice-title" style={{ width: 'min(560px, 100%)' }}>
        <div className="estimativas-modal__header">
          <div>
            <h3 id="spreadsheet-export-choice-title">Gerar planilha de {routineName}</h3>
            <p className="muted">Escolha quais dados deseja incluir na planilha.</p>
          </div>
          <button type="button" className="button-secondary" onClick={onCancel}>Fechar</button>
        </div>
        <div className="estimativas-form">
          <div className="spreadsheet-export-choice__actions">
            <button type="button" className="button-primary" onClick={onExportFilteredRows}>
              <strong>Usar dados em tela</strong>
            </button>
            <button type="button" className="button-secondary" onClick={onConfigureFilters}>
              <strong>Usar filtros Avançados</strong>
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
