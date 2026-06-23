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

export type AssignableMenu = Exclude<AllowedMenu, 'user-admin' | 'change-password'>

export type MenuDefinition = {
  key: AllowedMenu
  label: string
  assignable: boolean
}

export type AssignableMenuOption = {
  key: AssignableMenu
  label: string
}

export declare const MENU_DEFINITIONS: readonly MenuDefinition[]
export declare const MENU_LABELS: Readonly<Record<AllowedMenu, string>>
export declare const ALL_MENU_KEYS: readonly AllowedMenu[]
export declare const ASSIGNABLE_MENU_KEYS: readonly AssignableMenu[]
export declare const ASSIGNABLE_MENU_OPTIONS: readonly AssignableMenuOption[]
export declare function isVisitorUsername(username: string): boolean
export declare function normalizeMenuPermissions<TAllowedKey extends string = AssignableMenu>(
  value: unknown,
  allowedKeys?: readonly TAllowedKey[],
): TAllowedKey[]
export declare function getEffectiveMenus<TAllowedKey extends string = AllowedMenu>(
  username: string,
  allowedMenus: unknown,
  fullAccessMenus?: readonly TAllowedKey[],
): TAllowedKey[]