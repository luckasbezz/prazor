import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export type ImportNormalizedRow = {
  name: string;
  sku: string;
  barcode: string | null;
  unit: string;
  costPrice: number | null;
  salePrice: number | null;
  batchCode: string | null;
  expirationDate: string | null;
  quantity: number | null;
  branchName: string | null;
  locationName: string | null;
  supplierName: string | null;
  manufactureDate: string | null;
  hasInventory: boolean;
};

export type ImportRowIssue = { field: string; message: string };

export type ImportPreviewRow = {
  rowNumber: number;
  action: "create" | "update";
  normalized: ImportNormalizedRow;
  errors: ImportRowIssue[];
  warnings: string[];
};

type ProductRow = { id: string; name: string; sku: string | null; active: boolean };
type BarcodeRow = { product_id: string; barcode: string };
type BranchRow = { id: string; name: string };
type LocationRow = { id: string; branch_id: string; name: string };
type SupplierRow = { id: string; name: string };

type PreviewContext = {
  products: ProductRow[];
  barcodes: BarcodeRow[];
  branches: BranchRow[];
  locations: LocationRow[];
  suppliers: SupplierRow[];
};

const columns = [
  "nome_produto",
  "sku",
  "codigo_barras",
  "unidade",
  "custo_unitario",
  "preco_venda",
  "lote",
  "data_validade",
  "quantidade",
  "filial",
  "local",
  "fornecedor",
  "data_fabricacao",
] as const;

const aliases: Record<string, string[]> = {
  name: ["nome_produto", "produto", "nome", "product_name", "product"],
  sku: ["sku", "codigo_interno", "codigo_produto", "product_sku"],
  barcode: ["codigo_barras", "cod_barras", "ean", "gtin", "barcode"],
  unit: ["unidade", "unidade_medida", "unit"],
  costPrice: ["custo_unitario", "custo", "preco_custo", "cost_price"],
  salePrice: ["preco_venda", "venda", "sale_price"],
  batchCode: ["lote", "codigo_lote", "batch", "batch_code"],
  expirationDate: ["data_validade", "validade", "vencimento", "expiration_date"],
  quantity: ["quantidade", "qtd", "saldo", "quantity"],
  branchName: ["filial", "unidade_negocio", "branch"],
  locationName: ["local", "local_estoque", "estoque", "stock_location"],
  supplierName: ["fornecedor", "supplier"],
  manufactureDate: ["data_fabricacao", "fabricacao", "manufacture_date"],
};

const canonicalLabels: Record<string, string> = {
  name: "Nome do produto",
  sku: "SKU",
  barcode: "Código de barras",
  unit: "Unidade",
  costPrice: "Custo unitário",
  salePrice: "Preço de venda",
  batchCode: "Lote",
  expirationDate: "Data de validade",
  quantity: "Quantidade",
  branchName: "Filial",
  locationName: "Local",
  supplierName: "Fornecedor",
  manufactureDate: "Data de fabricação",
};

export async function parseImportFile(file: File) {
  if (file.size > 5 * 1024 * 1024) throw new Error("A planilha deve ter no máximo 5 MB.");
  const filename = file.name.trim();
  const extension = filename.split(".").pop()?.toLowerCase();
  if (!extension || !["csv", "xlsx"].includes(extension)) {
    throw new Error("Envie um arquivo CSV ou XLSX.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const table = extension === "xlsx" ? parseXlsx(bytes) : parseCsv(strFromU8(bytes));
  if (!table.rows.length) throw new Error("A planilha não possui linhas para importar.");
  if (table.rows.length > 500) throw new Error("Cada importação pode conter no máximo 500 linhas.");
  return table;
}

export function buildImportPreview(
  headers: string[],
  rawRows: unknown[][],
  context: PreviewContext,
) {
  const headerIndex = new Map(headers.map((header, index) => [headerKey(header), index]));
  const mapping: Record<string, string> = {};

  for (const [field, choices] of Object.entries(aliases)) {
    const matched = choices.find((choice) => headerIndex.has(headerKey(choice)));
    if (matched) {
      const index = headerIndex.get(headerKey(matched));
      if (index !== undefined) mapping[field] = String(headers[index] ?? matched);
    }
  }

  const missing = ["name", "sku", "unit"].filter((field) => !mapping[field]);
  if (missing.length) {
    throw new Error(`Colunas obrigatórias não encontradas: ${missing.map((field) => canonicalLabels[field]).join(", ")}.`);
  }

  const productsBySku = groupBy(context.products.filter((item) => item.sku), (item) => key(item.sku));
  const barcodeByValue = new Map(context.barcodes.map((item) => [item.barcode, item.product_id]));
  const branchesByName = groupBy(context.branches, (item) => key(item.name));
  const locationsByBranchAndName = groupBy(context.locations, (item) => `${item.branch_id}:${key(item.name)}`);
  const suppliersByName = groupBy(context.suppliers, (item) => key(item.name));
  const seenProducts = new Map<string, string>();
  const seenLots = new Map<string, number>();

  const rows = rawRows.map((raw, index): ImportPreviewRow => {
    const value = (field: string) => {
      const originalHeader = mapping[field];
      if (!originalHeader) return null;
      const columnIndex = headers.indexOf(originalHeader);
      return columnIndex < 0 ? null : raw[columnIndex];
    };

    const name = text(value("name"));
    const sku = text(value("sku"));
    const barcode = compactText(value("barcode"));
    const unit = normalizeUnit(value("unit"));
    const costPrice = numberValue(value("costPrice"));
    const salePrice = numberValue(value("salePrice"));
    const batchCode = textOrNull(value("batchCode"));
    const expirationDate = dateValue(value("expirationDate"));
    const quantity = numberValue(value("quantity"));
    const branchName = textOrNull(value("branchName"));
    const locationName = textOrNull(value("locationName"));
    const supplierName = textOrNull(value("supplierName"));
    const manufactureDate = dateValue(value("manufactureDate"));
    const hasInventory = [batchCode, value("expirationDate"), value("quantity"), branchName, locationName, supplierName, value("manufactureDate")]
      .some((item) => item !== null && String(item).trim() !== "");

    const normalized: ImportNormalizedRow = {
      name,
      sku,
      barcode,
      unit,
      costPrice,
      salePrice,
      batchCode,
      expirationDate,
      quantity,
      branchName,
      locationName,
      supplierName,
      manufactureDate,
      hasInventory,
    };

    const errors: ImportRowIssue[] = [];
    const warnings: string[] = [];
    const rowNumber = index + 2;
    const productMatches = productsBySku.get(key(sku)) ?? [];
    const product = productMatches[0] ?? null;

    if (name.length < 2 || name.length > 180) issue(errors, "nome_produto", "Informe um nome entre 2 e 180 caracteres.");
    if (!sku || sku.length > 80) issue(errors, "sku", "O SKU é obrigatório e deve ter até 80 caracteres.");
    if (!unit) issue(errors, "unidade", "Use un, kg, g, l, ml, cx ou pct.");
    if (barcode && (!/^[0-9A-Za-z._-]{4,64}$/.test(barcode))) issue(errors, "codigo_barras", "Código inválido; use de 4 a 64 letras, números, ponto, hífen ou sublinhado.");
    if (value("costPrice") !== null && text(value("costPrice")) && costPrice === null) issue(errors, "custo_unitario", "Informe um número maior ou igual a zero.");
    if (value("salePrice") !== null && text(value("salePrice")) && salePrice === null) issue(errors, "preco_venda", "Informe um número maior ou igual a zero.");
    if (productMatches.length > 1) issue(errors, "sku", "Há mais de um produto com este SKU; corrija o cadastro antes de importar.");
    if (product && !product.active) issue(errors, "sku", "Este produto está inativo.");

    if (barcode) {
      const barcodeOwner = barcodeByValue.get(barcode);
      if (barcodeOwner && barcodeOwner !== product?.id) issue(errors, "codigo_barras", "Este código já pertence a outro produto.");
    }

    if (sku) {
      const signature = JSON.stringify({ name: key(name), barcode, unit, costPrice, salePrice });
      const previous = seenProducts.get(key(sku));
      if (previous && previous !== signature) issue(errors, "sku", "O mesmo SKU aparece com dados de produto diferentes.");
      else seenProducts.set(key(sku), signature);
    }

    if (hasInventory) {
      if (!batchCode || batchCode.length > 100) issue(errors, "lote", "Informe o lote com até 100 caracteres.");
      if (!expirationDate) issue(errors, "data_validade", "Informe uma data válida no formato DD/MM/AAAA ou AAAA-MM-DD.");
      else if (expirationDate < todayIso()) issue(errors, "data_validade", "Não é possível importar um lote já vencido.");
      if (manufactureDate && expirationDate && manufactureDate > expirationDate) issue(errors, "data_fabricacao", "A fabricação não pode ser posterior à validade.");
      if (quantity === null || quantity <= 0) issue(errors, "quantidade", "Informe uma quantidade maior que zero.");
      if (costPrice === null) issue(errors, "custo_unitario", "O custo é obrigatório quando a linha contém estoque.");
      if (!branchName) issue(errors, "filial", "Informe a filial do estoque.");
      if (!locationName) issue(errors, "local", "Informe o local de estoque.");

      const branchMatches = branchName ? branchesByName.get(key(branchName)) ?? [] : [];
      const branch = branchMatches[0] ?? null;
      if (branchName && !branchMatches.length) issue(errors, "filial", "Filial ativa não encontrada ou sem acesso.");
      if (branchMatches.length > 1) issue(errors, "filial", "Há filiais com o mesmo nome; use o cadastro manual para esta linha.");

      if (branch && locationName) {
        const locationMatches = locationsByBranchAndName.get(`${branch.id}:${key(locationName)}`) ?? [];
        if (!locationMatches.length) issue(errors, "local", "Local ativo não encontrado nesta filial ou sem acesso.");
        if (locationMatches.length > 1) issue(errors, "local", "Há locais com o mesmo nome nesta filial.");
      }

      if (supplierName) {
        const supplierMatches = suppliersByName.get(key(supplierName)) ?? [];
        if (!supplierMatches.length) issue(errors, "fornecedor", "Fornecedor ativo não encontrado.");
        if (supplierMatches.length > 1) issue(errors, "fornecedor", "Há fornecedores com o mesmo nome.");
      }

      if (sku && batchCode && expirationDate && branchName && locationName) {
        const lotKey = [key(sku), key(batchCode), expirationDate, key(branchName), key(locationName), key(supplierName)].join("|");
        const previousRow = seenLots.get(lotKey);
        if (previousRow) issue(errors, "lote", `Este lote e local já aparecem na linha ${previousRow}.`);
        else seenLots.set(lotKey, rowNumber);
      }
    } else {
      warnings.push("Somente o produto será criado ou atualizado.");
    }

    if (product) warnings.push("Produto existente: os dados informados serão atualizados.");
    return { rowNumber, action: product ? "update" : "create", normalized, errors, warnings };
  });

  return {
    rows,
    mapping,
    mappedColumns: Object.entries(mapping).map(([field, header]) => ({ field, label: canonicalLabels[field], header })),
    validRows: rows.filter((row) => row.errors.length === 0).length,
    invalidRows: rows.filter((row) => row.errors.length > 0).length,
  };
}

export async function hashImportRows(rows: ImportNormalizedRow[]) {
  const bytes = new TextEncoder().encode(JSON.stringify(rows));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function buildImportTemplate() {
  const example = [
    "Iogurte natural 170 g",
    "IOG-170-NAT",
    "7891234567890",
    "un",
    "2,35",
    "4,99",
    "LT-2026-001",
    "31/12/2026",
    "48",
    "Matriz",
    "Estoque principal",
    "Fornecedor Exemplo",
    "15/08/2026",
  ];
  const instructions = [
    ["Campo", "Obrigatório", "Orientação"],
    ["nome_produto", "Sim", "De 2 a 180 caracteres"],
    ["sku", "Sim", "Identificador único do produto na empresa"],
    ["codigo_barras", "Não", "De 4 a 64 letras, números, ponto, hífen ou sublinhado"],
    ["unidade", "Sim", "Use: un, kg, g, l, ml, cx ou pct"],
    ["custo_unitario", "Para lotes", "Número maior ou igual a zero"],
    ["preco_venda", "Não", "Número maior ou igual a zero"],
    ["lote", "Para estoque", "Código do lote; máximo de 100 caracteres"],
    ["data_validade", "Para estoque", "DD/MM/AAAA ou AAAA-MM-DD"],
    ["quantidade", "Para estoque", "Número maior que zero"],
    ["filial", "Para estoque", "Nome exato de uma filial ativa"],
    ["local", "Para estoque", "Nome exato do local dentro da filial"],
    ["fornecedor", "Não", "Nome exato de um fornecedor ativo já cadastrado"],
    ["data_fabricacao", "Não", "DD/MM/AAAA ou AAAA-MM-DD"],
  ];
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    "_rels/.rels": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Importacao" sheetId="1" r:id="rId1"/><sheet name="Instrucoes" sheetId="2" r:id="rId2"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF627A19"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/></cellXfs></styleSheet>`),
    "xl/worksheets/sheet1.xml": xml(sheetXml([Array.from(columns), example], [22, 18, 20, 12, 16, 16, 18, 18, 14, 18, 22, 24, 20])),
    "xl/worksheets/sheet2.xml": xml(sheetXml(instructions, [22, 16, 70])),
  };
  return zipSync(files, { level: 6 });
}

function parseCsv(input: string) {
  const source = input.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(source);
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim())) records.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  row.push(field);
  if (row.some((cell) => cell.trim())) records.push(row);
  if (!records.length) return { headers: [], rows: [] };
  return { headers: records[0].map((cell) => cell.trim()), rows: records.slice(1) };
}

function parseXlsx(bytes: Uint8Array) {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("Não foi possível abrir o XLSX. Salve novamente o arquivo e tente de novo.");
  }

  const workbook = fileText(files, "xl/workbook.xml");
  const relationships = fileText(files, "xl/_rels/workbook.xml.rels");
  const firstSheet = workbook.match(/<sheet\b[^>]*r:id="([^"]+)"[^>]*\/?\s*>/i)?.[1];
  if (!firstSheet) throw new Error("O XLSX não possui uma aba de importação.");
  const relationshipPattern = new RegExp(`<Relationship\\b[^>]*Id="${escapeRegex(firstSheet)}"[^>]*Target="([^"]+)"[^>]*/?>`, "i");
  const target = relationships.match(relationshipPattern)?.[1]?.replace(/^\//, "");
  if (!target || target.includes("..")) throw new Error("A primeira aba do XLSX não pôde ser localizada.");
  const sheetPath = target.startsWith("xl/") ? target : `xl/${target}`;
  const sheet = fileText(files, sheetPath);
  const shared = files["xl/sharedStrings.xml"] ? parseSharedStrings(fileText(files, "xl/sharedStrings.xml")) : [];
  const records: unknown[][] = [];
  const rowPattern = /<row\b[^>]*>([\s\S]*?)<\/row>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowPattern.exec(sheet))) {
    const record: unknown[] = [];
    const cells = rowMatch[1];
    const cellPattern = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellPattern.exec(cells))) {
      const attributes = cellMatch[1] ?? cellMatch[3] ?? "";
      const body = cellMatch[2] ?? "";
      const reference = attribute(attributes, "r");
      const type = attribute(attributes, "t");
      const columnIndex = reference ? columnNumber(reference.replace(/\d+/g, "")) : record.length;
      const rawValue = body.match(/<v[^>]*>([\s\S]*?)<\/v>/i)?.[1] ?? "";
      let cell: unknown = decodeXml(rawValue);
      if (type === "s") cell = shared[Number(rawValue)] ?? "";
      else if (type === "inlineStr") cell = textNodes(body);
      else if (type === "b") cell = rawValue === "1";
      else if (!type && rawValue !== "" && Number.isFinite(Number(rawValue))) cell = Number(rawValue);
      record[columnIndex] = cell;
    }
    if (record.some((cell) => String(cell ?? "").trim())) records.push(record);
    if (records.length > 501) break;
  }

  if (!records.length) return { headers: [], rows: [] };
  return { headers: records[0].map((cell) => text(cell)), rows: records.slice(1) };
}

function parseSharedStrings(source: string) {
  return Array.from(source.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi), (match) => textNodes(match[1]));
}

function textNodes(source: string) {
  return Array.from(source.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi), (match) => decodeXml(match[1])).join("");
}

function fileText(files: Record<string, Uint8Array>, path: string) {
  const value = files[path];
  if (!value) throw new Error("O XLSX está incompleto ou corrompido.");
  return strFromU8(value);
}

function detectDelimiter(source: string) {
  const line = source.split(/\r?\n/, 1)[0] ?? "";
  const counts = [[";", 0], [",", 0], ["\t", 0]] as Array<[string, number]>;
  let quoted = false;
  for (const character of line) {
    if (character === '"') quoted = !quoted;
    if (!quoted) {
      const target = counts.find(([delimiter]) => delimiter === character);
      if (target) target[1] += 1;
    }
  }
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

function sheetXml(rows: string[][], widths: number[]) {
  const cols = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  const body = rows.map((row, rowIndex) => {
    const cells = row.map((cell, columnIndex) => `<c r="${columnLetters(columnIndex)}${rowIndex + 1}" t="inlineStr"${rowIndex === 0 ? ' s="1"' : ""}><is><t xml:space="preserve">${escapeXml(cell)}</t></is></c>`).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${body}</sheetData><autoFilter ref="A1:${columnLetters(rows[0].length - 1)}${rows.length}"/></worksheet>`;
}

function xml(value: string) { return strToU8(value); }
function escapeXml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
function decodeXml(value: string) { return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16))); }
function attribute(source: string, name: string) { return source.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`, "i"))?.[1] ?? ""; }
function columnNumber(value: string) { return value.toUpperCase().split("").reduce((total, character) => total * 26 + character.charCodeAt(0) - 64, 0) - 1; }
function columnLetters(index: number) { let value = index + 1; let result = ""; while (value > 0) { const remainder = (value - 1) % 26; result = String.fromCharCode(65 + remainder) + result; value = Math.floor((value - 1) / 26); } return result; }
function escapeRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function text(value: unknown) { return String(value ?? "").trim(); }
function textOrNull(value: unknown) { const normalized = text(value); return normalized || null; }
function compactText(value: unknown) { const normalized = text(value).replace(/\s+/g, ""); return normalized || null; }
function headerKey(value: unknown) { return key(value).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }
function key(value: unknown) { return String(value ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR"); }
function groupBy<T>(items: T[], selector: (item: T) => string) { const map = new Map<string, T[]>(); for (const item of items) { const group = map.get(selector(item)) ?? []; group.push(item); map.set(selector(item), group); } return map; }
function issue(errors: ImportRowIssue[], field: string, message: string) { if (!errors.some((item) => item.field === field && item.message === message)) errors.push({ field, message }); }
function normalizeUnit(value: unknown) { const normalized = key(value); const units: Record<string, string> = { un: "un", unidade: "un", unidades: "un", kg: "kg", quilograma: "kg", quilogramas: "kg", g: "g", grama: "g", gramas: "g", l: "l", litro: "l", litros: "l", ml: "ml", mililitro: "ml", mililitros: "ml", cx: "cx", caixa: "cx", caixas: "cx", pct: "pct", pacote: "pct", pacotes: "pct" }; return units[normalized] ?? ""; }
function numberValue(value: unknown) { if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null; const raw = text(value); if (!raw) return null; const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw; const parsed = Number(normalized); return Number.isFinite(parsed) && parsed >= 0 ? parsed : null; }
function dateValue(value: unknown) { if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10); if (typeof value === "number" && Number.isFinite(value)) { const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000); return date.toISOString().slice(0, 10); } const raw = text(value); if (!raw) return null; const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/); if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3])); const local = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/); if (!local) return null; const year = local[3].length === 2 ? 2000 + Number(local[3]) : Number(local[3]); return validDate(year, Number(local[2]), Number(local[1])); }
function validDate(year: number, month: number, day: number) { const date = new Date(Date.UTC(year, month - 1, day)); return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : null; }
function todayIso() { return new Date().toISOString().slice(0, 10); }
