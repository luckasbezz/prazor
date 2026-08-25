"use client";

import { FormEvent, useState } from "react";

type AuthFormProps = {
  mode: "sign-in" | "sign-up";
};

export function AuthForm({ mode }: AuthFormProps) {
  const isSignUp = mode === "sign-up";
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    };

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        error?: string;
        next?: string;
        message?: string;
        confirmationRequired?: boolean;
      };

      if (!response.ok || data.error) {
        setError(data.error ?? "Não foi possível continuar.");
        return;
      }

      if (data.confirmationRequired) {
        setMessage(data.message ?? "Confirme seu e-mail para continuar.");
        event.currentTarget.reset();
        return;
      }

      window.location.assign(data.next ?? "/app");
    } catch {
      setError("Não foi possível acessar o Prazor agora. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      {isSignUp && (
        <label>
          Seu nome
          <input name="name" autoComplete="name" required minLength={2} placeholder="Como podemos chamar você?" />
        </label>
      )}
      <label>
        E-mail
        <input name="email" type="email" autoComplete="email" required placeholder="voce@empresa.com.br" />
      </label>
      <label>
        Senha
        <input
          name="password"
          type="password"
          autoComplete={isSignUp ? "new-password" : "current-password"}
          required
          minLength={8}
          placeholder={isSignUp ? "Mínimo de 8 caracteres" : "Sua senha"}
        />
      </label>

      {error && <p className="form-feedback form-error" role="alert">{error}</p>}
      {message && <p className="form-feedback form-success" role="status">{message}</p>}

      <button className="button button-primary auth-submit" type="submit" disabled={loading}>
        {loading ? "Aguarde..." : isSignUp ? "Criar conta grátis" : "Entrar no Prazor"}
      </button>
    </form>
  );
}
