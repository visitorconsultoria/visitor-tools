declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<globalThis.FileSystemDirectoryHandle>
  }
}

export type AllowedMenu =
  | 'process'
  | 'data-compare'
  | 'xml-excel'
  | 'excel-csv-sqlite'
  | 'resume-ranking'
  | 'estimativas'
  | 'daily-activities'
  | 'digte-demands'
  | 'customer-hub'
  | 'ticket-hub'
  | 'propostas'
  | 'rubricas-validacao'
  | 'rubrica-natureza'
  | 'rubrica-inc-cp'
  | 'rubrica-inc-fgts'
  | 'rubrica-inc-pis'
  | 'rubrica-inc-rpps'
  | 'rubrica-inc-irrf'
  | 'rubrica-dirf'
  | 'rubrica-id-calculo'
  | 'rubrica-regra'
  | 'user-admin'
  | 'change-password'

export {}
