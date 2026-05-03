export const MENU_DEFINITIONS = Object.freeze([
  { key: 'process', label: 'Comparar Projeto', assignable: true },
  { key: 'xml-excel', label: 'XML para Excel', assignable: true },
  { key: 'excel-csv-sqlite', label: 'Excel/CSV para SQL', assignable: true },
  { key: 'resume-ranking', label: 'Ranking de Curriculos', assignable: true },
  { key: 'estimativas', label: 'Estimativas', assignable: true },
  { key: 'daily-activities', label: 'Apontamentos', assignable: true },
  { key: 'digte-demands', label: 'Demandas DIGTE', assignable: true },
  { key: 'customer-hub', label: 'Central de Clientes', assignable: true },
  { key: 'ticket-hub', label: 'Central de Chamados', assignable: true },
  { key: 'propostas', label: 'Propostas Comerciais', assignable: false },
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