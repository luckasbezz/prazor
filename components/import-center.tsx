"use client";

import { type ChangeEvent, type DragEvent, useMemo, useRef, useState } from "react";
import type { ImportNormalizedRow, ImportPreviewRow } from "@/lib/import-catalog";

type Preview = {
  filename: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  sourceHash: string;
  mapping: Record<string, string>;
  mappedColumns: Array<{ field: string; label: string; header: string }>;
  rows: ImportPreviewRow[];
};

type ImportResult = {
  importId: string;
  totalRows: number;
  createdProducts: number;
  updatedProducts: number;
  receivedLots: number;
  duplicate: boolean;
};

type HistoryItem = {
  id: string;
  filename: string;
  status: string;
  totalRows: number;
  createdProducts: number;
  updatedProducts: number;
  receivedLots: number;
  createdAt: string;
};

export function ImportCenter({ canManage, history }: { canManage: boolean; history: HistoryItem[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [filter, setFilter] = useState<"all" | "valid" | "errors">("all");
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  const visibleRows = useMemo(() => {
    const rows = preview?.rows ?? [];
    const filtered = filter === "valid" ? rows.filter((row) => !row.errors.length) : filter === "errors" ? rows.filter((row) => row.errors.length) : rows;
    return filtered.slice(0, 100);
  }, [filter, preview]);

  async function analyze(file: File | null) {
    if (!file) return;
    setError("");
    setPreview(null);
    setResult(null);
    setLoading(true);
    const form = new FormData();
    form.set("file", file);
    try {
      const response = await fetch("/api/imports/preview", { method: "POST", body: form });
      const data = (await response.json()) as Preview & { error?: string };
      if (!response.ok || data.error) {
        setError(data.error ?? "Não foi possível analisar a planilha.");
        return;
      }
      setPreview(data);
      setFilter(data.invalidRows ? "errors" : "all");
    } catch {
      setError("A conexão foi interrompida durante a análise. Tente novamente.");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function confirmImport() {
    if (!preview || preview.invalidRows || !preview.validRows) return;
    setError("");
    setConfirming(true);
    try {
      const response = await fetch("/api/imports/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: preview.filename,
          mapping: preview.mapping,
          rows: preview.rows.map((row) => row.normalized satisfies ImportNormalizedRow),
        }),
      });
      const data = (await response.json()) as ImportResult & { error?: string };
      if (!response.ok || data.error) {
        setError(data.error ?? "Não foi possível concluir a importação.");
        return;
      }
      setResult(data);
      setPreview(null);
    } catch {
      setError("A conexão foi interrompida. Nenhuma confirmação parcial será mantida.");
    } finally {
      setConfirming(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (canManage && !loading) void analyze(event.dataTransfer.files[0] ?? null);
  }

  function downloadErrors() {
    if (!preview) return;
    const records = [["linha", "campo", "erro"]];
    for (const row of preview.rows) for (const item of row.errors) records.push([String(row.rowNumber), item.field, item.message]);
    const csv = `\uFEFF${records.map((record) => record.map(csvCell).join(";")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `erros-${preview.filename.replace(/\.[^.]+$/, "")}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <section className="import-workspace">
        <article className="import-main-card">
          <div className="import-step-heading"><span>01</span><div><h2>Selecione a planilha</h2><p>Use o modelo do Prazor ou um arquivo com colunas equivalentes.</p></div></div>
          {canManage ? (
            <div
              className={`import-dropzone${dragging ? " is-dragging" : ""}`}
              onDragEnter={() => setDragging(true)}
              onDragLeave={() => setDragging(false)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              <span aria-hidden="true">⇧</span>
              <h3>{loading ? "Analisando a planilha..." : "Arraste o arquivo para cá"}</h3>
              <p>CSV ou XLSX · até 500 linhas · máximo de 5 MB</p>
              <button disabled={loading} onClick={() => inputRef.current?.click()} type="button">{loading ? "Aguarde..." : "Escolher arquivo"}</button>
              <input accept=".csv,.xlsx" aria-label="Selecionar planilha para importação" hidden onChange={(event: ChangeEvent<HTMLInputElement>) => void analyze(event.target.files?.[0] ?? null)} ref={inputRef} type="file" />
            </div>
          ) : (
            <div className="permission-card"><span>Somente leitura</span><h2>Seu acesso permite consultar importações.</h2><p>Solicite a um gerente o envio e a confirmação de novas planilhas.</p></div>
          )}

          {error ? <p className="form-feedback form-error import-feedback" role="alert">{error}</p> : null}

          {preview ? (
            <div className="import-preview">
              <div className="import-step-heading"><span>02</span><div><h2>Revise antes de confirmar</h2><p>{preview.filename} · {preview.totalRows} linhas reconhecidas</p></div></div>
              <div className="import-metrics">
                <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")} type="button"><small>Total</small><strong>{preview.totalRows}</strong></button>
                <button className={filter === "valid" ? "active valid" : "valid"} onClick={() => setFilter("valid")} type="button"><small>Prontas</small><strong>{preview.validRows}</strong></button>
                <button className={filter === "errors" ? "active invalid" : "invalid"} onClick={() => setFilter("errors")} type="button"><small>Com erros</small><strong>{preview.invalidRows}</strong></button>
              </div>

              <details className="import-mapping"><summary>Ver {preview.mappedColumns.length} colunas reconhecidas automaticamente</summary><div>{preview.mappedColumns.map((column) => <span key={column.field}><b>{column.header}</b> → {column.label}</span>)}</div></details>

              <div className="import-table-wrap">
                <div className="import-table import-table-header"><span>Linha</span><span>Produto</span><span>Lote e destino</span><span>Ação</span><span>Validação</span></div>
                {visibleRows.map((row) => (
                  <div className={`import-table import-table-row${row.errors.length ? " has-error" : ""}`} key={row.rowNumber}>
                    <span>#{row.rowNumber}</span>
                    <div><strong>{row.normalized.name || "Produto sem nome"}</strong><small>{row.normalized.sku || "SKU ausente"}</small></div>
                    <div><strong>{row.normalized.hasInventory ? row.normalized.batchCode || "Lote ausente" : "Somente catálogo"}</strong><small>{row.normalized.hasInventory ? [row.normalized.branchName, row.normalized.locationName].filter(Boolean).join(" · ") || "Destino ausente" : "Sem entrada de saldo"}</small></div>
                    <span className={`import-action ${row.action}`}>{row.action === "create" ? "Novo" : "Atualizar"}</span>
                    <div className="import-validation">{row.errors.length ? row.errors.map((item) => <small key={`${item.field}-${item.message}`}><b>{item.field}</b> {item.message}</small>) : <strong>✓ Linha pronta</strong>}</div>
                  </div>
                ))}
              </div>
              {(filter === "all" ? preview.totalRows : filter === "valid" ? preview.validRows : preview.invalidRows) > 100 ? <p className="import-limit-note">Mostrando as primeiras 100 linhas deste filtro.</p> : null}

              <div className="import-confirm-bar">
                <div>{preview.invalidRows ? <><strong>Corrija os erros antes de confirmar.</strong><small>Nenhum dado será gravado enquanto houver uma linha inválida.</small></> : <><strong>Todas as linhas estão prontas.</strong><small>A confirmação criará produtos, lotes, movimentos e saldos juntos.</small></>}</div>
                {preview.invalidRows ? <button className="secondary-action" onClick={downloadErrors} type="button">Baixar erros em CSV</button> : null}
                <button className="primary-action" disabled={confirming || preview.invalidRows > 0} onClick={confirmImport} type="button">{confirming ? "Confirmando..." : `Confirmar ${preview.validRows} linhas`}</button>
              </div>
            </div>
          ) : null}

          {result ? (
            <div className="import-success" role="status"><span>✓</span><div><small>{result.duplicate ? "Arquivo já processado" : "Importação concluída"}</small><h2>{result.totalRows} linhas confirmadas com segurança</h2><p>{result.createdProducts} produtos criados · {result.updatedProducts} atualizados · {result.receivedLots} entradas de lote</p></div><button onClick={() => setResult(null)} type="button">Importar outro arquivo</button></div>
          ) : null}
        </article>

        <aside className="import-guide-card">
          <span>Modelo oficial</span>
          <h2>Comece com as colunas certas.</h2>
          <p>O arquivo traz uma linha de exemplo e uma segunda aba com formatos, campos obrigatórios e unidades aceitas.</p>
          <a className="primary-action link-action" href="/api/imports/template">Baixar modelo XLSX</a>
          <ol><li><b>1</b><div><strong>Produto</strong><small>Nome, SKU e unidade são obrigatórios.</small></div></li><li><b>2</b><div><strong>Lote opcional</strong><small>Preencha lote, validade, quantidade, filial e local para receber saldo.</small></div></li><li><b>3</b><div><strong>Conferência</strong><small>O Prazor mostra cada erro antes da confirmação.</small></div></li></ol>
          <p className="import-guide-note">Nomes de filial, local e fornecedor devem ser iguais aos cadastros ativos da empresa.</p>
        </aside>
      </section>

      <section className="import-history-card">
        <div><span>Histórico</span><h2>Importações recentes</h2><p>Resultados confirmados e protegidos contra duplicidade.</p></div>
        {history.length ? <div className="import-history-list">{history.map((item) => <article key={item.id}><span className={`import-history-status ${item.status}`}>{item.status === "completed" ? "Concluída" : item.status}</span><div><strong>{item.filename}</strong><small>{formatDateTime(item.createdAt)} · {item.totalRows} linhas</small></div><p><b>{item.createdProducts}</b> novos <b>{item.updatedProducts}</b> atualizados <b>{item.receivedLots}</b> lotes</p></article>)}</div> : <div className="catalog-empty compact"><span>⇧</span><h3>Nenhuma importação concluída</h3><p>O primeiro arquivo confirmado aparecerá aqui.</p></div>}
      </section>
    </>
  );
}

function csvCell(value: string) { return `"${value.replace(/"/g, '""')}"`; }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)); }
