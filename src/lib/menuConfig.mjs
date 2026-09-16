export const MENU_DEFINITIONS = Object.freeze([
  { key: 'process', label: 'Comparar Projeto', assignable: true },
  { key: 'data-compare', label: 'Comparar Arquivos', assignable: true },
  { key: 'xml-excel', label: 'XML para Excel', assignable: true },
  { key: 'excel-csv-sqlite', label: 'Excel/CSV para SQL', assignable: true },
  { key: 'resume-ranking', label: 'Ranking de Curriculos', assignable: true },
  { key: 'estimativas', label: 'Estimativas', assignable: true },
  { key: 'projeto-dev', label: 'Projeto Dev', assignable: true },
  { key: 'daily-activities', label: 'Apontamentos', assignable: true },
  { key: 'digte-demands', label: 'Demandas DIGTE', assignable: true },
  { key: 'customer-hub', label: 'Central de Clientes', assignable: true },
  { key: 'customer-hub-dashboard', label: 'Clientes - Dashboard', assignable: true },
  { key: 'customer-hub-clientes', label: 'Clientes - Clientes', assignable: true },
  { key: 'customer-hub-status-report', label: 'Clientes - Status Report', assignable: true },
  { key: 'customer-hub-contatos', label: 'Clientes - Contatos', assignable: true },
  { key: 'customer-hub-acessos', label: 'Clientes - Acessos', assignable: true },
  { key: 'customer-hub-sistemas', label: 'Clientes - Sistemas', assignable: true },
  { key: 'customer-hub-processos', label: 'Clientes - Processos', assignable: true },
  { key: 'customer-hub-historico', label: 'Clientes - Histórico', assignable: true },
  { key: 'central-servicos', label: 'Central de Serviços', assignable: true },
  { key: 'central-servicos-dashboard', label: 'Serviços - Dashboards', assignable: true },
  { key: 'central-servicos-agenda', label: 'Serviços - Agenda e Produtividade', assignable: true },
  { key: 'central-servicos-atendimentos', label: 'Serviços - Atendimentos', assignable: true },
  { key: 'central-servicos-recursos', label: 'Serviços - Recursos', assignable: true },
  { key: 'central-servicos-contratos-servicos', label: 'Serviços - Contratos e Serviços', assignable: true },
  { key: 'central-servicos-despesas', label: 'Serviços - Despesas', assignable: true },
  { key: 'central-servicos-faturamento', label: 'Serviços - Faturamento', assignable: true },
  { key: 'central-servicos-pagamentos', label: 'Serviços - Pagamentos', assignable: true },
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
  { key: 'rubrica-regra-comparacao', label: 'Comparação Tabela de Regra', assignable: true },
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

export const MENU_PARENT_KEYS = Object.freeze({
  'customer-hub-dashboard': 'customer-hub',
  'customer-hub-clientes': 'customer-hub',
  'customer-hub-status-report': 'customer-hub',
  'customer-hub-contatos': 'customer-hub',
  'customer-hub-acessos': 'customer-hub',
  'customer-hub-sistemas': 'customer-hub',
  'customer-hub-processos': 'customer-hub',
  'customer-hub-historico': 'customer-hub',
  'central-servicos-dashboard': 'central-servicos',
  'central-servicos-agenda': 'central-servicos',
  'central-servicos-atendimentos': 'central-servicos',
  'central-servicos-recursos': 'central-servicos',
  'central-servicos-contratos-servicos': 'central-servicos',
  'central-servicos-despesas': 'central-servicos',
  'central-servicos-faturamento': 'central-servicos',
  'central-servicos-pagamentos': 'central-servicos',
  'rubrica-natureza': 'rubricas-validacao',
  'rubrica-inc-cp': 'rubricas-validacao',
  'rubrica-inc-fgts': 'rubricas-validacao',
  'rubrica-inc-pis': 'rubricas-validacao',
  'rubrica-inc-rpps': 'rubricas-validacao',
  'rubrica-inc-irrf': 'rubricas-validacao',
  'rubrica-dirf': 'rubricas-validacao',
  'rubrica-id-calculo': 'rubricas-validacao',
  'rubrica-regra': 'rubricas-validacao',
  'rubrica-regra-comparacao': 'rubricas-validacao',
})

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

  const menus = normalizeMenuPermissions(allowedMenus, fullAccessMenus)
  const effectiveMenus = new Set(menus)

  Object.entries(MENU_PARENT_KEYS).forEach(([child, parent]) => {
    if (effectiveMenus.has(parent) && fullAccessMenus.includes(child)) {
      effectiveMenus.add(child)
    }
  })

  menus.forEach((menu) => {
    const parent = MENU_PARENT_KEYS[menu]
    if (parent && fullAccessMenus.includes(parent)) {
      effectiveMenus.add(parent)
    }
  })

  return fullAccessMenus.filter((menu) => effectiveMenus.has(menu))
}