"use client";

import { FormEvent, useState } from "react";

type OnboardingFormProps = {
  initialCompanyName?: string;
  initialBranchName?: string;
};

export function OnboardingForm({ initialCompanyName = "", initialBranchName = "" }: OnboardingFormProps) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: form.get("companyName"),
          branchName: form.get("branchName"),
          locationName: form.get("locationName"),
        }),
      });
      const data = (await response.json()) as { error?: string; next?: string };
      if (!response.ok || data.error) {
        setError(data.error ?? "Não foi possível concluir a configuração.");
        return;
      }
      window.location.assign(data.next ?? "/app");
    } catch {
      setError("A conexão foi interrompida. Seus dados já salvos serão preservados.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="onboarding-form" onSubmit={handleSubmit}>
      <div className="onboarding-field">
        <span>1</span>
        <label>
          Nome da empresa
          <input name="companyName" required minLength={2} defaultValue={initialCompanyName} placeholder="Ex.: Mercado Boa Compra" />
        </label>
      </div>
      <div className="onboarding-field">
        <span>2</span>
        <label>
          Primeira unidade
          <input name="branchName" required minLength={2} defaultValue={initialBranchName} placeholder="Ex.: Loja Centro" />
        </label>
      </div>
      <div className="onboarding-field">
        <span>3</span>
        <label>
          Local de estoque
          <input name="locationName" required minLength={2} defaultValue="Estoque principal" placeholder="Ex.: Estoque principal" />
        </label>
      </div>

      {error && <p className="form-feedback form-error" role="alert">{error}</p>}
      <button className="button button-primary onboarding-submit" disabled={loading} type="submit">
        {loading ? "Preparando seu painel..." : "Criar meu espaço no Prazor"}
      </button>
      <small>Você poderá adicionar outras unidades e locais depois.</small>
    </form>
  );
}
