import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prazor — Controle de Validade e Estoque",
  description:
    "Controle produtos, lotes, estoque e datas de validade. Antecipe perdas e aja antes que seu estoque vire prejuízo.",
  metadataBase: new URL("https://prazor.lucasrsbezerra.chatgpt.site"),
  openGraph: {
    title: "Prazor — Controle de Validade e Estoque",
    description: "Seu estoque avisa antes de virar prejuízo.",
    url: "/",
    siteName: "Prazor",
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Prazor — Seu estoque avisa antes de virar prejuízo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Prazor — Controle de Validade e Estoque",
    description: "Seu estoque avisa antes de virar prejuízo.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
