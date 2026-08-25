import Link from "next/link";
import { AppFrame } from "@/components/app-frame";
import { requireAppContext } from "@/lib/app-context";
import { loadInventoryReport, normalizeReportPeriod } from "@/lib/reporting";
import { supabaseRest } from "@/lib/supabase/rest";

export const dynamic = "force-dynamic";

type NotificationRow = { id: string };

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const quantity = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { auth, context } = await requireAppContext("/app/relatorios");
  const params = await searchParams;
  const period = normalizeReportPeriod(singleParam(params.periodo));
  const requestedBranchId = singleParam(params.filial) ?? "all";
  const [report, unread] = await Promise.all([
    loadInventoryReport({
      companyId: context.company.id,
      accessToken: auth.accessToken,
      period,
      branchId: requestedBranchId,
    }),
    supabaseRest<NotificationRow[]>(
      `notifications?select=id&company_id=eq.${encodeURIComponent(context.company.id)}&user_id=eq.${encodeURIComponent(auth.user.id)}&read_at=is.null&limit=1000`,
      auth.accessToken,
    ),
  ]);

  const exportParams = new URLSearchParams({ periodo: report.period, filial: report.branchId });
  const riskPercent = report.metrics.inventoryValue > 0 ? Math.round((report.metrics.riskValue / report.metrics.inventoryValue) * 100) : 0;
  const selectedBranch = report.branchId === "all" ? "Todas as filiais" : report.branches.find((item) => item.id === report.branchId)?.name ?? "Todas as filiais";
  const insight = reportInsight(report.metrics.riskValue, report.metrics.lossValue, report.metrics.recoveredValue, riskPercent);

  return (
    <AppFrame
      active="reports"
      companyName={context.company.name}
      userLabel={auth.user.user_metadata?.full_name ?? auth.user.email}
      notificationCount={unread.length}
      expiryCount={report.metrics.criticalBatchCount}
    >
      <div className="app-page reports-page">
        <div className="app-heading-row reports-heading">
          <div><span>Gestão / Inteligência</span><h1>Relatórios</h1><p>Transforme estoque, validade, perdas e trocas em decisões mensuráveis.</p></div>
          <div className="app-primary-actions"><Link className="secondary-action link-action" href="/app/validades">◷ Ver validades</Link><Link className="primary-action link-action" href={`/api/reports/inventory.csv?${exportParams.toString()}`}>↓ Exportar CSV</Link></div>
        </div>

        <form className="report-filter-bar" method="get">
          <div><span>Recorte atual</span><strong>{report.periodLabel} · {selectedBranch}</strong></div>
          <label><span>Período</span><select defaultValue={report.period} name="periodo"><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="180">Últimos 6 meses</option><option value="365">Últimos 12 meses</option><option value="all">Todo o histórico</option></select></label>
          <label><span>Filial</span><select defaultValue={report.branchId} name="filial"><option value="all">Todas as filiais</option>{report.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
          <button type="submit">Aplicar filtros</button>
        </form>

        <section className="report-metric-grid" aria-label="Indicadores gerenciais">
          <article className="report-metric report-metric-stock"><div><span>Valor em estoque</span><i>R$</i></div><strong>{money.format(report.metrics.inventoryValue)}</strong><small>{report.inventoryRows.length} saldos ativos no recorte atual</small></article>
          <article className="report-metric report-metric-risk"><div><span>Exposição por validade</span><i>!</i></div><strong>{money.format(report.metrics.riskValue)}</strong><small>{riskPercent}% do valor atual · {report.metrics.criticalBatchCount} lotes críticos</small></article>
          <article className="report-metric report-metric-loss"><div><span>Perdas no período</span><i>↘</i></div><strong>{money.format(report.metrics.lossValue)}</strong><small>{report.metrics.lossCount} ocorrências em {report.periodLabel.toLocaleLowerCase("pt-BR")}</small></article>
          <article className="report-metric report-metric-recovery"><div><span>Recuperado em trocas</span><i>↗</i></div><strong>{money.format(report.metrics.recoveredValue)}</strong><small>{report.metrics.completedExchangeCount} concluídas · taxa de {report.metrics.recoveryRate}%</small></article>
        </section>

        <div className="report-main-grid">
          <section className="report-card report-trend-card">
            <div className="report-card-heading"><div><span>Resultado financeiro</span><h2>Perdas x valores recuperados</h2><p>Evolução dentro do período selecionado</p></div><div className="report-legend"><span><i className="loss" />Perdas</span><span><i className="recovery" />Recuperado</span></div></div>
            <div className="report-trend-chart" role="img" aria-label="Comparação entre perdas e valores recuperados por período">
              {report.trend.map((item) => (
                <div className="report-trend-column" key={item.label}>
                  <div className="report-trend-bars">
                    <span className="loss" style={{ height: barHeight(item.lossPercent, item.loss) }} title={`Perdas: ${money.format(item.loss)}`} />
                    <span className="recovery" style={{ height: barHeight(item.recoveredPercent, item.recovered) }} title={`Recuperado: ${money.format(item.recovered)}`} />
                  </div>
                  <strong>{item.label}</strong>
                  <small>{money.format(item.loss + item.recovered)}</small>
                </div>
              ))}
            </div>
          </section>

          <aside className="report-insight-card">
            <span className="setup-label">Leitura executiva</span><div className={`report-insight-icon ${insight.tone}`}>{insight.icon}</div><h2>{insight.title}</h2><p>{insight.copy}</p>
            <div className="report-insight-progress"><span><i style={{ width: `${Math.min(100, riskPercent)}%` }} /></span><div><strong>{riskPercent}% exposto</strong><small>{money.format(Math.max(0, report.metrics.inventoryValue - report.metrics.riskValue))} saudável</small></div></div>
            <Link href={insight.href}>{insight.action} →</Link>
          </aside>
        </div>

        <div className="report-secondary-grid">
          <section className="report-card report-expiry-card">
            <div className="report-card-heading"><div><span>Composição atual</span><h2>Exposição por validade</h2><p>Distribuição financeira do estoque</p></div><strong>{money.format(report.metrics.inventoryValue)}</strong></div>
            <div className="report-stacked-bar" aria-label="Composição do valor do estoque por faixa de validade">{report.expiryBands.map((item) => item.percent > 0 ? <span className={item.tone} key={item.id} style={{ width: `${item.percent}%` }} title={`${item.label}: ${money.format(item.value)}`} /> : null)}</div>
            <div className="report-expiry-list">{report.expiryBands.map((item) => <div key={item.id}><i className={item.tone} /><span><strong>{item.label}</strong><small>{item.batches} {item.batches === 1 ? "lote" : "lotes"}</small></span><b>{money.format(item.value)}</b><em>{Math.round(item.percent)}%</em></div>)}</div>
          </section>

          <section className="report-card report-loss-reasons">
            <div className="report-card-heading"><div><span>Diagnóstico</span><h2>Principais causas de perda</h2><p>Ordenadas pelo impacto financeiro</p></div><Link href="/app/estoque/perdas">Ver histórico →</Link></div>
            {report.lossReasons.length ? <div className="report-ranked-bars">{report.lossReasons.map((item) => <div key={item.label}><div><span><strong>{item.label}</strong><small>{item.count} {item.count === 1 ? "ocorrência" : "ocorrências"}</small></span><b>{money.format(item.value)}</b></div><span><i style={{ width: `${item.percent}%` }} /></span></div>)}</div> : <ReportEmpty icon="✓" title="Nenhuma perda no período" copy="O impacto por causa aparecerá quando houver ocorrências neste recorte." />}
          </section>
        </div>

        <section className="report-card report-risk-card">
          <div className="report-card-heading"><div><span>Prioridade financeira</span><h2>Produtos com maior valor em risco</h2><p>Consolidados por produto em todos os locais do filtro</p></div><Link href="/app/validades">Abrir central →</Link></div>
          {report.topRisk.length ? (
            <div className="report-risk-table">
              <div className="report-risk-header"><span>Produto</span><span>Lotes</span><span>Quantidade</span><span>Participação</span><span>Valor em risco</span></div>
              {report.topRisk.map((item, index) => <div className="report-risk-row" key={`${item.productName}:${item.sku ?? ""}`}><span className="report-risk-product"><i>{String(index + 1).padStart(2, "0")}</i><span><strong>{item.productName}</strong><small>{item.sku ? `SKU ${item.sku}` : "Sem SKU"}</small></span></span><strong>{item.batches}</strong><span>{quantity.format(item.quantity)}</span><span className="report-risk-share"><i><b style={{ width: `${report.metrics.riskValue > 0 ? (item.value / report.metrics.riskValue) * 100 : 0}%` }} /></i><small>{report.metrics.riskValue > 0 ? Math.round((item.value / report.metrics.riskValue) * 100) : 0}%</small></span><b>{money.format(item.value)}</b></div>)}
            </div>
          ) : <ReportEmpty icon="✓" title="Nenhum produto em risco" copy="Os produtos críticos, vencidos ou em atenção aparecerão aqui." />}
        </section>

        <div className="report-bottom-grid">
          <section className="report-card report-movement-card">
            <div className="report-card-heading"><div><span>Atividade</span><h2>Fluxo operacional</h2><p>Registros realizados no período</p></div></div>
            <div className="report-movement-list">{report.movements.map((item) => <div key={item.id}><i className={item.id}>{movementIcon(item.id)}</i><span><strong>{item.label}</strong><small>{quantity.format(item.quantity)} unidades movimentadas</small></span><b>{item.count}</b><em><i style={{ width: `${item.percent}%` }} /></em></div>)}</div>
          </section>
          <section className="report-card report-recovery-card">
            <div className="report-card-heading"><div><span>Trocas</span><h2>Valor em recuperação</h2><p>Solicitações ainda em andamento</p></div></div>
            <strong>{money.format(report.metrics.openExchangeValue)}</strong><p>Este valor está reservado em protocolos ativos e ainda não compõe o total recuperado.</p><div><span><i style={{ width: `${Math.max(8, report.metrics.recoveryRate)}%` }} /></span><small>Taxa histórica no recorte</small><b>{report.metrics.recoveryRate}%</b></div><Link className="secondary-action link-action" href="/app/fornecedores/trocas">Acompanhar solicitações</Link>
          </section>
        </div>
      </div>
    </AppFrame>
  );
}

function ReportEmpty({ icon, title, copy }: { icon: string; title: string; copy: string }) {
  return <div className="report-empty"><span>{icon}</span><div><strong>{title}</strong><small>{copy}</small></div></div>;
}

function barHeight(percent: number, value: number) {
  return `${value > 0 ? Math.max(4, percent) : 2}%`;
}

function reportInsight(riskValue: number, lossValue: number, recoveredValue: number, riskPercent: number) {
  if (riskPercent >= 25) return { tone: "danger", icon: "!", title: "A validade pede ação imediata.", copy: `${money.format(riskValue)} do estoque está nas faixas de maior exposição. Priorize os itens de maior valor antes de novas compras.`, href: "/app/validades?status=urgentes", action: "Revisar lotes críticos" };
  if (lossValue > recoveredValue && lossValue > 0) return { tone: "warning", icon: "↘", title: "As perdas superaram as recuperações.", copy: `O período encerra com uma diferença de ${money.format(lossValue - recoveredValue)}. Use as causas mais frequentes para orientar a próxima ação.`, href: "/app/estoque/perdas", action: "Analisar ocorrências" };
  if (recoveredValue > 0) return { tone: "safe", icon: "↗", title: "As trocas estão protegendo sua margem.", copy: `${money.format(recoveredValue)} já retornaram à operação no período selecionado. Continue antecipando os lotes elegíveis.`, href: "/app/fornecedores/trocas", action: "Ver oportunidades" };
  return { tone: "neutral", icon: "◎", title: "Seu panorama gerencial está pronto.", copy: "Conforme a operação registrar perdas e concluir trocas, o Prazor destacará tendências e oportunidades financeiras aqui.", href: "/app/validades", action: "Acompanhar validades" };
}

function movementIcon(id: string) {
  return ({ entry: "+", outbound: "−", transfer: "↔", loss: "!", exchange: "⇄" } as Record<string, string>)[id] ?? "·";
}

function singleParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}
