"use client";

import { FormEvent, useMemo, useState } from "react";

type ProductOption = { id: string; name: string; sku: string | null; unit: string; cost_price: number | string | null };
type SimpleOption = { id: string; name: string };
type LocationOption = SimpleOption & { branchName: string };

type ReceiveFormProps = {
  products: ProductOption[];
  suppliers: SimpleOption[];
  locations: LocationOption[];
  selectedProductId?: string;
};

export function ReceiveForm({ products, suppliers, locations, selectedProductId }: ReceiveFormProps) {
  const initialProduct = products.find((item) => item.id === selectedProductId) ?? products[0];
  const [productId, setProductId] = useState(initialProduct?.id ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const selectedProduct = useMemo(() => products.find((item) => item.id === productId), [productId, products]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/inventory/receive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      const data = (await response.json()) as { error?: string; next?: string };

      if (!response.ok || data.error) {
        setError(data.error ?? "Não foi possível registrar a entrada.");
        return;
      }

      window.location.assign(data.next ?? "/app");
    } catch {
      setError("A conexão foi interrompida. Nenhuma entrada incompleta foi registrada.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="operation-form" onSubmit={handleSubmit}>
      <div className="form-section-heading"><span>01</span><div><h2>Produto e lote</h2><p>Identifique exatamente o que está entrando no estoque.</p></div></div>
      <div className="form-grid two-columns">
        <label className="field-wide">Produto<select name="productId" value={productId} onChange={(event) => setProductId(event.target.value)} required>{products.map((product) => <option value={product.id} key={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ""}</option>)}</select></label>
        <label>Código do lote<input name="batchCode" required maxLength={100} placeholder="Ex.: L240821-A" /></label>
        <label>Fornecedor<select name="supplierId" defaultValue=""><option value="">Sem fornecedor informado</option>{suppliers.map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.name}</option>)}</select></label>
        <label>Data de fabricação<input name="manufactureDate" type="date" /></label>
        <label>Data de validade<input name="expirationDate" type="date" min={todayIso()} required /></label>
      </div>

      <div className="form-section-heading"><span>02</span><div><h2>Quantidade e destino</h2><p>A entrada cria o saldo e o movimento na mesma transação.</p></div></div>
      <div className="form-grid two-columns">
        <label>Quantidade ({selectedProduct?.unit ?? "un"})<input name="quantity" required inputMode="decimal" placeholder="Ex.: 24" /></label>
        <label>Custo unitário (R$)<input key={selectedProduct?.id} name="costPrice" required inputMode="decimal" defaultValue={formatDefaultCost(selectedProduct?.cost_price)} placeholder="0,00" /></label>
        <label className="field-wide">Local de estoque<select name="locationId" required>{locations.map((location) => <option value={location.id} key={location.id}>{location.name} · {location.branchName}</option>)}</select></label>
      </div>

      <div className="transaction-assurance"><span>✓</span><div><strong>Entrada segura e atômica</strong><small>O lote, o movimento e o saldo só serão gravados se todos os dados forem válidos.</small></div></div>
      {error && <p className="form-feedback form-error" role="alert">{error}</p>}
      <div className="operation-form-actions"><button className="primary-action" disabled={loading} type="submit">{loading ? "Registrando entrada..." : "Confirmar entrada no estoque →"}</button></div>
    </form>
  );
}

function todayIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function formatDefaultCost(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "";
  return Number(value).toFixed(2).replace(".", ",");
}
