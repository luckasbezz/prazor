"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";

type InviteTokens = { accessToken: string; refreshToken: string; expiresIn: number };

export function InviteAcceptanceForm() {
  const [tokens, setTokens] = useState<InviteTokens | null>(null);
  const [status, setStatus] = useState<"reading" | "ready" | "invalid">("reading");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = hash.get("access_token") ?? "";
    const refreshToken = hash.get("refresh_token") ?? "";
    const description = hash.get("error_description");
    queueMicrotask(() => {
      if (description) setError(decodeURIComponent(description.replaceAll("+", " ")));
      if (!accessToken || !refreshToken) {
        setStatus("invalid");
        return;
      }
      setTokens({ accessToken, refreshToken, expiresIn: Number(hash.get("expires_in") ?? 3600) });
      window.history.replaceState({}, "", window.location.pathname);
      setStatus("ready");
    });
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tokens) return;
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirmPassword") ?? "")) {
      setError("As senhas precisam ser iguais.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...tokens,
          name: String(form.get("name") ?? ""),
          password,
        }),
      });
      const data = (await response.json()) as { error?: string; next?: string };
      if (!response.ok || data.error) {
        setError(data.error ?? "Não foi possível concluir o convite.");
        return;
      }
      window.location.assign(data.next ?? "/app");
    } catch {
      setError("Não foi possível acessar o Prazor agora. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  if (status === "reading") {
    return <div className="invite-loading"><span /><strong>Validando seu convite...</strong></div>;
  }
  if (status === "invalid") {
    return <div className="invite-invalid"><span>!</span><h2>Este convite não está disponível.</h2><p>{error || "O link pode ter expirado ou já ter sido utilizado. Peça um novo convite ao responsável pela empresa."}</p><Link className="button button-primary" href="/entrar">Ir para o acesso</Link></div>;
  }

  return (
    <form className="auth-form invite-form" onSubmit={submit}>
      <label>Seu nome<input autoComplete="name" minLength={2} name="name" placeholder="Como sua equipe verá você" required /></label>
      <label>Crie uma senha<input autoComplete="new-password" minLength={8} name="password" placeholder="Mínimo de 8 caracteres" required type="password" /></label>
      <label>Confirme a senha<input autoComplete="new-password" minLength={8} name="confirmPassword" placeholder="Repita a senha" required type="password" /></label>
      {error ? <p className="form-feedback form-error" role="alert">{error}</p> : null}
      <button className="button button-primary auth-submit" disabled={loading} type="submit">{loading ? "Ativando acesso..." : "Entrar para a equipe"}</button>
    </form>
  );
}
