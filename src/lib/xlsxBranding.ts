import visitorLogo from '../assets/vistor_logo_verde2.png'

type ExcelJSRuntime = {
  Workbook: new () => unknown
}

let excelJsLoader: Promise<ExcelJSRuntime> | null = null

async function loadExcelJSRuntime(): Promise<ExcelJSRuntime> {
  const browserWindow = window as Window & { ExcelJS?: ExcelJSRuntime }
  if (browserWindow.ExcelJS?.Workbook) {
    return browserWindow.ExcelJS
  }

  if (!excelJsLoader) {
    excelJsLoader = new Promise<ExcelJSRuntime>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js'
      script.async = true
      script.onload = () => {
        const loadedRuntime = (window as Window & { ExcelJS?: ExcelJSRuntime }).ExcelJS
        if (!loadedRuntime?.Workbook) {
          reject(new Error('ExcelJS foi carregado, mas não expôs Workbook.'))
          return
        }
        resolve(loadedRuntime)
      }
      script.onerror = () => {
        reject(new Error('Falha ao carregar biblioteca de exportação (ExcelJS CDN).'))
      }
      document.head.appendChild(script)
    }).catch((error) => {
      excelJsLoader = null
      throw error
    })
  }

  return excelJsLoader
}

let logoBase64Loader: Promise<string> | null = null

async function loadLogoBase64(): Promise<string> {
  if (!logoBase64Loader) {
    logoBase64Loader = fetch(visitorLogo)
      .then((response) => response.blob())
      .then((blob) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => {
          const result = String(reader.result || '')
          const base64 = result.includes(',') ? result.split(',')[1] : result
          resolve(base64)
        }
        reader.onerror = () => reject(new Error('Falha ao carregar o logo para a planilha.'))
        reader.readAsDataURL(blob)
      }))
      .catch((error) => {
        logoBase64Loader = null
        throw error
      })
  }

  return logoBase64Loader
}

function columnLetter(index: number): string {
  let value = index + 1
  let letters = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    letters = String.fromCharCode(65 + remainder) + letters
    value = Math.floor((value - 1) / 26)
  }
  return letters
}

export type BrandedColumn = {
  header: string
  key: string
  width?: number
}

export type BrandedSheet = {
  sheetName: string
  columns: BrandedColumn[]
  rows: Record<string, unknown>[]
  subtitle?: string
}

export type BrandedWorkbookOptions = {
  fileName: string
  title: string
  subtitle?: string
  sheets: BrandedSheet[]
}

const BRAND_TITLE_FILL = 'FF1F6F5D'
const BRAND_HEADER_FILL = 'FF2F8F74'
const BRAND_STRIPE_FILL = 'FFE4F2ED'
const BRAND_BORDER_COLOR = 'FFBFD5CF'
const WHITE = 'FFFFFFFF'

const THIN_BORDER = {
  top: { style: 'thin', color: { argb: BRAND_BORDER_COLOR } },
  bottom: { style: 'thin', color: { argb: BRAND_BORDER_COLOR } },
  left: { style: 'thin', color: { argb: BRAND_BORDER_COLOR } },
  right: { style: 'thin', color: { argb: BRAND_BORDER_COLOR } },
}

export async function exportBrandedWorkbook(options: BrandedWorkbookOptions): Promise<void> {
  const { fileName, title, subtitle, sheets } = options
  const [ExcelJSRuntime, logoBase64] = await Promise.all([loadExcelJSRuntime(), loadLogoBase64()])
  const WorkbookCtor = ExcelJSRuntime.Workbook
  if (!WorkbookCtor) {
    throw new Error('Falha ao carregar biblioteca de exportação (ExcelJS).')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workbook = new WorkbookCtor() as any
  const generatedAtLabel = new Date().toLocaleString('pt-BR')

  sheets.forEach((sheet) => {
    const { sheetName, columns, rows } = sheet
    const worksheet = workbook.addWorksheet(sheetName)
    const lastColLetter = columnLetter(Math.max(columns.length - 1, 0))

    worksheet.columns = columns.map((column) => ({ key: column.key, width: column.width ?? 18 }))

    const titleRow = worksheet.getRow(1)
    titleRow.height = 34
    worksheet.mergeCells(`A1:${lastColLetter}1`)
    titleRow.getCell(1).value = title
    titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: WHITE } }
    titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 6 }

    const sheetSubtitle = sheet.subtitle ?? subtitle
    const subtitleRow = worksheet.getRow(2)
    subtitleRow.height = 20
    worksheet.mergeCells(`A2:${lastColLetter}2`)
    subtitleRow.getCell(1).value = `${sheetSubtitle ? `${sheetSubtitle} — ` : ''}Gerado em ${generatedAtLabel}`
    subtitleRow.getCell(1).font = { size: 10, color: { argb: WHITE } }
    subtitleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 6 }

    for (let col = 1; col <= columns.length; col += 1) {
      titleRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_TITLE_FILL } }
      subtitleRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_TITLE_FILL } }
    }

    const imageId = workbook.addImage({ base64: logoBase64, extension: 'png' })
    worksheet.addImage(imageId, { tl: { col: 0.08, row: 0.08 }, ext: { width: 96, height: 34 } })

    const headerRow = worksheet.getRow(3)
    headerRow.height = 20
    columns.forEach((column, index) => {
      const cell = headerRow.getCell(index + 1)
      cell.value = column.header
      cell.font = { bold: true, color: { argb: WHITE } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_HEADER_FILL } }
      cell.alignment = { vertical: 'middle', horizontal: 'left' }
      cell.border = THIN_BORDER
    })

    rows.forEach((rowData, rowIndex) => {
      const row = worksheet.addRow(rowData)
      columns.forEach((_column, colIndex) => {
        const cell = row.getCell(colIndex + 1)
        if (rowIndex % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_STRIPE_FILL } }
        }
        cell.border = THIN_BORDER
      })
    })

    worksheet.views = [{ state: 'frozen', ySplit: 3 }]
    worksheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: columns.length } }
  })

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
