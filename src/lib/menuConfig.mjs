export const MENU_DEFINITIONS = Object.freeze([
  { key: 'process', label: 'Comparar Projeto', assignable: true },
  { key: 'data-compare', label: 'Comparar Arquivos', assignable: true },
  { key: 'xml-excel', label: 'XML para Excel', assignable: true },
  { key: 'excel-csv-sqlite', label: 'Excel/CSV para SQL', assignable: true },
  { key: 'resume-ranking', label: 'Ranking de Curriculos', assignable: true },
  { key: 'estimativas', label: 'Estimativas', assignable: true },
  { key: 'daily-activities', label: 'Apontamentos', assignable: true },
  { key: 'digte-demands', label: 'Demandas DIGTE', assignable: true },
  { key: 'customer-hub', label: 'Central de Clientes', assignable: true },
  { key: 'ticket-hub', label: 'Central de Chamados', assignable: true },
  { key: 'propostas', label: 'Propostas Comerciais', assignable: true },
  { key: 'rubricas-validacao', label: 'Validação de Rubricas', assignable: true },
  { key: 'rubrica-natureza', label: 'Natureza de Rubricas', assignable: true },
  { key: 'rubrica-inc-cp', label: 'Inc. CP', assignable: true },
  { key: 'rubrica-inc-fgts', label: 'Inc. FGTS', assignable: true },
  { key: 'rubrica-inc-pis', label: 'Inc. PIS', assignable: true },
  { key: 'rubrica-inc-rpps', label: 'Inc. RPPS', assignable: true },
  { key: 'rubrica-inc-irrf', label: 'Inc. IRRF', assignable: true },
  { key: 'rubrica-dirf', label: 'DIRF - Protheus', assignable: true },
  { key: 'rubrica-id-calculo', label: 'ID CÁLCULO - Protheus', assignable: true },
  { key: 'rubrica-regra', label: 'Tabela de Regra', assignable: true },
  { key: 'user-admin', label: 'Usuarios e Acessos', assignable: false },
  { key: 'change-password', label: 'Alterar Senha', assignable: false },
])

export const MENU_LABELS = Object.freeze(
  Object.fromEntries(MENU_DEFINITIONS.map(({ key, label }) => [key, label])),
)

export const ALL_MENU_KEYS = Object.freeze(MENU_DEFINITIONS.map(({ key }) => key))

export const ASSIGNABLE_MENU_KEYS = Object.freeze(
  MENU_DEFINITIONS.filter(({ assignable }) => assignable).map(({ key }) => key),
)

export const ASSIGNABLE_MENU_OPTIONS = Object.freeze(
  MENU_DEFINITIONS.filter(({ assignable }) => assignable).map(({ key, label }) => ({ key, label })),
)

export function isVisitorUsername(username) {
  return String(username || '').trim().toLowerCase() === 'visitor'
}

export function normalizeMenuPermissions(value, allowedKeys = ASSIGNABLE_MENU_KEYS) {
  const allowedKeySet = new Set(allowedKeys)
  const items = Array.isArray(value) ? value : []
  return Array.from(
    new Set(
      items
        .map((item) => String(item || '').trim())
        .filter((item) => allowedKeySet.has(item)),
    ),
  )
}

export function getEffectiveMenus(username, allowedMenus, fullAccessMenus = ALL_MENU_KEYS) {
  if (isVisitorUsername(username)) {
    return [...fullAccessMenus]
  }

  return normalizeMenuPermissions(allowedMenus, fullAccessMenus)
}