export type RubricaRuleFieldKey =
  | 'rv_desc'
  | 'rv_descdet'
  | 'rv_codfol'
  | 'rv_tipo'
  | 'rv_codcorr'
  | 'rv_inss'
  | 'rv_inssfer'
  | 'rv_ir'
  | 'rv_fgts'
  | 'rv_rra'
  | 'rv_pis'
  | 'rv_dirf'
  | 'rv_ref13'
  | 'rv_reffer'
  | 'rv_refabon'
  | 'rv_adianta'
  | 'rv_empcons'
  | 'rv_refplr'
  | 'rv_he'
  | 'rv_coddsr'
  | 'rv_compl_'
  | 'rv_codcom_'
  | 'rv_codmseg'
  | 'rv_ferseg'
  | 'rv_naturez'
  | 'rv_incirf'
  | 'rv_incfgts'
  | 'rv_inccp'
  | 'rv_incop'
  | 'rv_tetop'
  | 'rv_contrap'
  | 'rv_incpis'
  | 'rv_ferdesc'
  | 'rv_subst'
  | 'rv_ferxml'
  | 'rv_feraxml'

export type RubricaRuleFieldDefinition = {
  key: RubricaRuleFieldKey
  label: string
  required: boolean
  multiline?: boolean
}

export declare const RUBRICA_RULE_FIELD_DEFINITIONS: readonly RubricaRuleFieldDefinition[]
export declare const RUBRICA_RULE_FIELD_KEYS: readonly RubricaRuleFieldKey[]
export declare const RUBRICA_RULE_REQUIRED_FIELD_KEYS: readonly RubricaRuleFieldKey[]
