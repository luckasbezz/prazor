"use client";

import { FormEvent, useState } from "react";

export function ProductForm() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      const data = (await response.json()) as { error?: string; next?: string };

      if (!response.ok || data.error) {
        setError(data.error ?? "Não foi possível cadastrar o produto.");
        return;
      }

      window.location.assign(data.next ?? "/app/estoque/produtos?criado=1");
    } catch {
      setError("A conexão foi interrompida. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="operation-form" onSubmit={handleSubmit}>
      <div className="form-section-heading"><span>01</span><div><h2>Identificação</h2><p>Informações usadas para localizar o produto rapidamente.</p></div></div>
      <div className="form-grid two-columns">
        <label className="field-wide">Nome do produto<input name="name" required minLength={2} placeholder="Ex.: Iogurte natural 170 g" /></label>
        <label>SKU interno<input name="sku" maxLength={80} placeholder="Ex.: IOG-170-NAT" /></label>
        <label>Código de barras<input name="barcode" minLength={4} maxLength={64} inputMode="numeric" placeholder="Ex.: 7891234567890" /></label>
        <label>Unidade de controle<select name="unit" defaultValue="un"><option value="un">Unidade (un)</option><option value="kg">Quilograma (kg)</option><option value="g">Grama (g)</option><option value="l">Litro (l)</option><option value="ml">Mililitro (ml)</option><option value="cx">Caixa (cx)</option><option value="pct">Pacote (pct)</option></select></label>
      </div>

      <div className="form-section-heading"><span>02</span><div><h2>Valores</h2><p>O custo permite calcular quanto dinheiro está em risco.</p></div></div>
      <div className="form-grid two-columns">
        <label>Custo unitário (R$)<input name="costPrice" inputMode="decimal" placeholder="0,00" /></label>
        <label>Preço de venda (R$)<input name="salePrice" inputMode="decimal" placeholder="0,00" /></label>
        <label className="field-wide">Descrição ou observação<textarea name="description" rows={3} placeholder="Informação opcional para a equipe" /></label>
      </div>

      {error && <p className="form-feedback form-error" role="alert">{error}</p>}
      <div className="operation-form-actions"><button className="primary-action" disabled={loading} type="submit">{loading ? "Salvando..." : "Salvar e receber primeiro lote →"}</button></div>
    </form>
  );
}
