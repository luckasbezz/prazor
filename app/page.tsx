const products = [
  {
    name: "Iogurte natural 170g",
    sku: "Lote 7A-231",
    quantity: "36 un.",
    deadline: "4 dias",
    risk: "R$ 324,00",
    tone: "danger",
  },
  {
    name: "Protetor solar FPS 50",
    sku: "Lote PS-824",
    quantity: "18 un.",
    deadline: "12 dias",
    risk: "R$ 702,00",
    tone: "warning",
  },
  {
    name: "Ração premium 3 kg",
    sku: "Lote RP-109",
    quantity: "10 un.",
    deadline: "21 dias",
    risk: "R$ 890,00",
    tone: "attention",
  },
];

const navItems = [
  { label: "Produto", href: "#produto" },
  { label: "Como funciona", href: "#como-funciona" },
  { label: "Soluções", href: "#solucoes" },
  { label: "Preços", href: "#precos" },
];

export default function Home() {
  return (
    <main>
      <section className="hero-shell" id="inicio">
        <div className="hero-glow" aria-hidden="true" />
        <header className="site-header page-width">
          <a className="brand" href="#inicio" aria-label="Prazor — início">
            <span className="brand-mark" aria-hidden="true">
              <span />
            </span>
            <span>Prazor</span>
          </a>

          <nav className="main-nav" aria-label="Navegação principal">
            {navItems.map((item) => (
              <a key={item.href} href={item.href}>
                {item.label}
              </a>
            ))}
          </nav>

          <div className="header-actions">
            <a className="login-link" href="/entrar">
              Entrar
            </a>
            <a className="button button-small button-light" href="/cadastro">
              Começar grátis
            </a>
          </div>
        </header>

        <div className="hero page-width">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="eyebrow-dot" aria-hidden="true" />
              Controle preventivo de estoque
            </div>
            <h1>
              Seu estoque avisa <span>antes de virar prejuízo.</span>
            </h1>
            <p className="hero-description">
              Controle produtos, lotes, quantidades e validades. O Prazor mostra
              o que precisa de atenção e ajuda sua equipe a agir no momento certo.
            </p>

            <div className="hero-actions">
              <a className="button button-primary" href="/cadastro">
                Começar gratuitamente <span aria-hidden="true">→</span>
              </a>
              <a className="text-button" href="#como-funciona">
                <span className="play-icon" aria-hidden="true">▶</span>
                Ver como funciona
              </a>
            </div>

            <div className="hero-proof" aria-label="Benefícios do teste">
              <span>✓ Sem cartão de crédito</span>
              <span>✓ Configure em poucos minutos</span>
            </div>
          </div>

          <div className="product-stage" aria-label="Prévia do painel Prazor">
            <div className="float-note note-top">
              <span className="note-icon">!</span>
              <div>
                <strong>Alerta enviado</strong>
                <small>12 produtos exigem atenção</small>
              </div>
            </div>

            <div className="dashboard-window">
              <div className="window-topbar">
                <div className="window-dots" aria-hidden="true">
                  <span /><span /><span />
                </div>
                <div className="window-address">app.prazor.com.br</div>
                <div className="avatar">LB</div>
              </div>

              <div className="dashboard-body">
                <aside className="sidebar" aria-label="Menu ilustrativo do painel">
                  <div className="sidebar-brand">
                    <span className="mini-mark" />
                    <strong>Prazor</strong>
                  </div>
                  <div className="sidebar-links">
                    <span className="active"><i>⌂</i> Visão geral</span>
                    <span><i>□</i> Produtos</span>
                    <span><i>↕</i> Movimentações</span>
                    <span><i>◴</i> Validades <b>12</b></span>
                    <span><i>▦</i> Relatórios</span>
                  </div>
                  <div className="sidebar-bottom">
                    <span><i>⚙</i> Configurações</span>
                  </div>
                </aside>

                <div className="dashboard-main">
                  <div className="dashboard-heading">
                    <div>
                      <small>Quinta-feira, 21 de agosto</small>
                      <h2>Bom dia, Lucas.</h2>
                    </div>
                    <button type="button" className="scan-button">
                      <span aria-hidden="true">⌗</span> Escanear produto
                    </button>
                  </div>

                  <div className="metric-grid">
                    <article className="metric-card risk-card">
                      <div className="metric-top">
                        <span>Valor em risco</span>
                        <i>↗</i>
                      </div>
                      <strong>R$ 2.840</strong>
                      <small>32 itens próximos do vencimento</small>
                    </article>
                    <article className="metric-card">
                      <div className="metric-top">
                        <span>Vencem em 7 dias</span>
                        <i className="orange-dot" />
                      </div>
                      <strong>14</strong>
                      <small>6 precisam de ação hoje</small>
                    </article>
                    <article className="metric-card">
                      <div className="metric-top">
                        <span>Estoque saudável</span>
                        <i className="green-dot" />
                      </div>
                      <strong>93%</strong>
                      <small>+4,2% desde o último mês</small>
                    </article>
                  </div>

                  <div className="dashboard-content-grid">
                    <article className="expiry-panel">
                      <div className="panel-heading">
                        <div>
                          <h3>Prioridades de hoje</h3>
                          <p>Ordenado pelo risco de perda</p>
                        </div>
                        <button type="button">Ver tudo</button>
                      </div>
                      <div className="product-list">
                        {products.map((product) => (
                          <div className="product-row" key={product.name}>
                            <span className={`product-indicator ${product.tone}`} />
                            <div className="product-name">
                              <strong>{product.name}</strong>
                              <small>{product.sku}</small>
                            </div>
                            <span>{product.quantity}</span>
                            <span className={`deadline ${product.tone}`}>
                              {product.deadline}
                            </span>
                            <strong className="risk-value">{product.risk}</strong>
                          </div>
                        ))}
                      </div>
                    </article>

                    <article className="action-panel">
                      <span className="action-badge">Ação recomendada</span>
                      <div className="action-icon" aria-hidden="true">%</div>
                      <h3>Crie uma promoção preventiva</h3>
                      <p>
                        Aplicar 15% de desconto em 3 produtos pode evitar uma perda
                        estimada de <strong>R$ 1.026.</strong>
                      </p>
                      <button type="button">Ver produtos <span>→</span></button>
                    </article>
                  </div>
                </div>
              </div>
            </div>

            <div className="float-note note-bottom">
              <span className="success-ring">✓</span>
              <div>
                <strong>R$ 4.218 economizados</strong>
                <small>nos últimos 30 dias</small>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="trust-strip" aria-label="Principais aplicações">
        <div className="page-width trust-inner">
          <p>Feito para quem não pode perder o prazo</p>
          <div className="segment-list">
            <span>Mercadinhos</span>
            <span>Conveniências</span>
            <span>Distribuidoras</span>
            <span>Cosméticos</span>
            <span>Pet shops</span>
          </div>
        </div>
      </section>

      <section className="problem-section section-space" id="produto">
        <div className="page-width">
          <div className="section-heading split-heading">
            <div>
              <span className="section-label">Controle que se antecipa</span>
              <h2>Produto vencido não desaparece. <em>Vira prejuízo.</em></h2>
            </div>
            <p>
              Planilhas mostram o que já foi registrado. O Prazor transforma
              estoque, validade e custo em uma lista diária de decisões.
            </p>
          </div>

          <div className="comparison-grid">
            <article className="comparison-card old-way">
              <div className="comparison-title">
                <span className="comparison-icon">×</span>
                <div>
                  <small>O jeito antigo</small>
                  <h3>Descobrir quando já venceu</h3>
                </div>
              </div>
              <div className="sheet-mock">
                <div className="sheet-bar">
                  <i /><i /><i />
                  <span>controle_validade_final_v3.xlsx</span>
                </div>
                <div className="sheet-cells">
                  {Array.from({ length: 24 }).map((_, index) => (
                    <span className={index === 10 || index === 17 ? "cell-alert" : ""} key={index} />
                  ))}
                </div>
                <div className="late-alert">
                  <strong>R$ 1.482 perdidos</strong>
                  <small>Itens encontrados após o vencimento</small>
                </div>
              </div>
            </article>

            <article className="comparison-card new-way">
              <div className="comparison-title">
                <span className="comparison-icon">✓</span>
                <div>
                  <small>Com o Prazor</small>
                  <h3>Agir antes que o prazo termine</h3>
                </div>
              </div>
              <div className="timeline-card">
                <div className="timeline-head">
                  <span>Próximos vencimentos</span>
                  <small>Agosto</small>
                </div>
                <div className="timeline">
                  <span className="done"><b>01</b><small>Entrada</small></span>
                  <span className="today"><b>21</b><small>Hoje</small></span>
                  <span className="alert"><b>25</b><small>Alerta</small></span>
                  <span><b>30</b><small>Validade</small></span>
                </div>
                <div className="saved-alert">
                  <strong>R$ 1.026 protegidos</strong>
                  <small>Ação realizada nove dias antes do vencimento</small>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="steps-section section-space" id="como-funciona">
        <div className="page-width">
          <div className="section-heading centered-heading">
            <span className="section-label">Simples desde o primeiro produto</span>
            <h2>Do cadastro à ação em três passos.</h2>
            <p>
              Sua equipe começa rápido, sem implantação longa e sem precisar
              abandonar a operação para alimentar o sistema.
            </p>
          </div>

          <div className="steps-grid">
            <article className="step-card">
              <span className="step-number">01</span>
              <div className="scan-visual" aria-hidden="true">
                <div className="barcode">
                  <i /><i /><i /><i /><i /><i /><i /><i /><i />
                </div>
                <span className="scan-line" />
              </div>
              <h3>Cadastre ou importe</h3>
              <p>
                Leia o código de barras pelo celular ou importe sua planilha de
                produtos em poucos minutos.
              </p>
            </article>

            <article className="step-card featured-step">
              <span className="step-number">02</span>
              <div className="lot-visual" aria-hidden="true">
                <div><small>LOTE</small><strong>7A-231</strong></div>
                <span>+</span>
                <div><small>VALIDADE</small><strong>30 AGO</strong></div>
              </div>
              <h3>Acompanhe cada lote</h3>
              <p>
                Registre quantidade, custo e validade. O Prazor organiza as
                prioridades automaticamente.
              </p>
            </article>

            <article className="step-card">
              <span className="step-number">03</span>
              <div className="notify-visual" aria-hidden="true">
                <div className="phone-alert">
                  <i>!</i>
                  <span><strong>Alerta Prazor</strong><small>6 itens exigem ação hoje</small></span>
                </div>
              </div>
              <h3>Receba e resolva</h3>
              <p>
                Sua equipe recebe o alerta e escolhe a melhor ação antes que o
                produto se transforme em perda.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="features-section section-space" id="solucoes">
        <div className="page-width">
          <div className="section-heading split-heading features-heading">
            <div>
              <span className="section-label">Tudo o que merece atenção</span>
              <h2>Um estoque que explica <em>o que fazer agora.</em></h2>
            </div>
            <p>
              O Prazor não entrega mais um painel para acompanhar. Ele organiza
              o trabalho da equipe e mede o resultado de cada decisão.
            </p>
          </div>

          <div className="feature-bento">
            <article className="feature-card feature-wide alert-feature">
              <div className="feature-copy">
                <span className="feature-kicker">Alertas inteligentes</span>
                <h3>As pessoas certas recebem o aviso no prazo certo.</h3>
                <p>
                  Configure alertas por produto, categoria, unidade ou faixa de
                  valor e acompanhe se a equipe já tomou uma providência.
                </p>
                <div className="channel-chips">
                  <span>WhatsApp</span><span>E-mail</span><span>No sistema</span>
                </div>
              </div>
              <div className="alerts-stack" aria-hidden="true">
                <div className="alert-message message-one">
                  <i className="message-logo">P</i>
                  <span><strong>Prazor</strong><small>12 itens vencem em 7 dias</small></span>
                  <b>agora</b>
                </div>
                <div className="alert-message message-two">
                  <i className="message-logo dark">P</i>
                  <span><strong>Ação necessária</strong><small>R$ 2.840 estão em risco</small></span>
                  <b>08:32</b>
                </div>
                <div className="alert-message message-three">
                  <i className="message-logo checked">✓</i>
                  <span><strong>Ação concluída</strong><small>R$ 438 protegidos</small></span>
                  <b>09:10</b>
                </div>
              </div>
            </article>

            <article className="feature-card money-feature">
              <span className="feature-kicker">Valor em risco</span>
              <h3>Veja a validade em reais.</h3>
              <p>Priorize pelo impacto financeiro, não apenas pela quantidade.</p>
              <div className="risk-chart" aria-hidden="true">
                <div className="chart-total"><small>Protegido este mês</small><strong>R$ 4.218</strong></div>
                <div className="bars">
                  <i style={{ height: "32%" }} /><i style={{ height: "48%" }} />
                  <i style={{ height: "42%" }} /><i style={{ height: "70%" }} />
                  <i style={{ height: "58%" }} /><i style={{ height: "87%" }} />
                  <i className="bar-active" style={{ height: "100%" }} />
                </div>
              </div>
            </article>

            <article className="feature-card trace-feature">
              <span className="feature-kicker">Rastreabilidade</span>
              <h3>Cada movimento tem história.</h3>
              <p>Saiba quem registrou, ajustou ou resolveu cada item e lote.</p>
              <div className="activity-list" aria-hidden="true">
                <div><i>LB</i><span><strong>Entrada registrada</strong><small>24 un. · Lote AC-82</small></span><b>09:42</b></div>
                <div><i>MS</i><span><strong>Validade atualizada</strong><small>30 de agosto de 2026</small></span><b>10:18</b></div>
                <div><i>JP</i><span><strong>Ação concluída</strong><small>Produto remanejado</small></span><b>11:05</b></div>
              </div>
            </article>

            <article className="feature-card feature-wide mobile-feature">
              <div className="mobile-copy">
                <span className="feature-kicker">Feito para o estoque real</span>
                <h3>Escaneie no corredor. Resolva no celular.</h3>
                <p>
                  A operação não fica presa ao computador. Consulte, conte e
                  movimente produtos direto de onde o trabalho acontece.
                </p>
                <ul>
                  <li>Leitura de código de barras</li>
                  <li>Contagem rápida de inventário</li>
                  <li>Registro de entrada e saída</li>
                </ul>
              </div>
              <div className="phone-mock" aria-label="Prévia ilustrativa do aplicativo móvel">
                <div className="phone-speaker" />
                <div className="phone-head"><span className="mini-mark" /><strong>Escanear</strong><i>×</i></div>
                <div className="camera-area">
                  <div className="scan-corners"><i /><i /><i /><i /></div>
                  <div className="camera-barcode">|||| ||| || |||||</div>
                </div>
                <div className="phone-product">
                  <small>Produto encontrado</small>
                  <strong>Iogurte natural 170g</strong>
                  <span>Lote 7A-231 · 36 unidades</span>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="audience-section section-space">
        <div className="page-width audience-grid">
          <div className="audience-copy">
            <span className="section-label light-label">Cabe na sua operação</span>
            <h2>Comece pequeno. Continue quando o negócio crescer.</h2>
            <p>
              Uma unidade ou uma rede: o Prazor mantém produtos, equipes e
              responsabilidades organizados sem transformar o controle em burocracia.
            </p>
            <a href="/cadastro" className="button button-primary">
              Encontrar meu plano <span>→</span>
            </a>
          </div>
          <div className="audience-cards">
            <article><span>01</span><div><h3>Varejo alimentar</h3><p>Mercadinhos, mercearias e conveniências.</p></div><i>→</i></article>
            <article><span>02</span><div><h3>Distribuição</h3><p>Pequenas distribuidoras e estoques centrais.</p></div><i>→</i></article>
            <article><span>03</span><div><h3>Saúde e beleza</h3><p>Cosméticos, suplementos e cuidados pessoais.</p></div><i>→</i></article>
            <article><span>04</span><div><h3>Mercado pet</h3><p>Rações, medicamentos e produtos veterinários.</p></div><i>→</i></article>
          </div>
        </div>
      </section>

      <section className="pricing-section section-space" id="precos">
        <div className="page-width">
          <div className="section-heading centered-heading">
            <span className="section-label">Planos simples e transparentes</span>
            <h2>Menos que o custo de uma perda.</h2>
            <p>
              Comece com 14 dias gratuitos. Cancele quando quiser e evolua o
              plano conforme sua operação.
            </p>
          </div>

          <div className="pricing-grid">
            <article className="price-card">
              <span className="plan-name">Essencial</span>
              <h3><small>R$</small> 49,90 <em>/mês</em></h3>
              <p>Para uma pequena operação começar a prevenir perdas.</p>
              <a href="/cadastro" className="price-button">Testar gratuitamente</a>
              <ul>
                <li>Até 500 produtos</li>
                <li>2 usuários</li>
                <li>Controle de lotes e validade</li>
                <li>Alertas no sistema e por e-mail</li>
              </ul>
            </article>

            <article className="price-card featured-price">
              <span className="popular-tag">Mais escolhido</span>
              <span className="plan-name">Gestão</span>
              <h3><small>R$</small> 99,90 <em>/mês</em></h3>
              <p>Para equipes que precisam agir e medir o que foi economizado.</p>
              <a href="/cadastro" className="price-button">Testar gratuitamente</a>
              <ul>
                <li>Até 3.000 produtos</li>
                <li>8 usuários</li>
                <li>Alertas por WhatsApp</li>
                <li>Valor em risco e ações</li>
                <li>Relatórios gerenciais</li>
              </ul>
            </article>

            <article className="price-card">
              <span className="plan-name">Multiunidade</span>
              <h3 className="custom-price">Sob consulta</h3>
              <p>Para redes que precisam centralizar produtos e responsáveis.</p>
              <a href="/cadastro" className="price-button">Conversar com a equipe</a>
              <ul>
                <li>Produtos e usuários ilimitados</li>
                <li>Múltiplas unidades</li>
                <li>Perfis e permissões</li>
                <li>Importação e integrações</li>
              </ul>
            </article>
          </div>
          <p className="price-note">Valores iniciais de lançamento, sujeitos a ajuste antes da abertura pública.</p>
        </div>
      </section>

      <section className="final-cta" id="comecar">
        <div className="page-width cta-card">
          <div className="cta-ring ring-one" aria-hidden="true" />
          <div className="cta-ring ring-two" aria-hidden="true" />
          <span className="section-label light-label">Comece antes da próxima perda</span>
          <h2>O próximo produto não precisa vencer sem você saber.</h2>
          <p>Organize seu primeiro estoque e teste todos os recursos gratuitamente por 14 dias.</p>
          <div className="cta-actions">
            <a className="button button-primary" href="/cadastro">Criar minha conta <span>→</span></a>
            <span>Sem cartão de crédito</span>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="page-width footer-main">
          <div className="footer-brand">
            <a className="brand dark-brand" href="#inicio">
              <span className="brand-mark" aria-hidden="true"><span /></span>
              <span>Prazor</span>
            </a>
            <p>Validade e estoque sob controle, antes do prejuízo.</p>
          </div>
          <div className="footer-links">
            <div><strong>Produto</strong><a href="#produto">Visão geral</a><a href="#como-funciona">Como funciona</a><a href="#precos">Planos</a></div>
            <div><strong>Soluções</strong><a href="#solucoes">Alertas</a><a href="#solucoes">Rastreabilidade</a><a href="#solucoes">Aplicativo</a></div>
            <div><strong>Empresa</strong><a href="#inicio">Sobre</a><a href="#inicio">Contato</a><a href="#inicio">Privacidade</a></div>
          </div>
        </div>
        <div className="page-width footer-bottom">
          <span>© 2026 Prazor. Todos os direitos reservados.</span>
          <span>Feito para reduzir perdas.</span>
        </div>
      </footer>
    </main>
  );
}
