const API_BASE = '/api';
const AUTH_TOKEN_KEY = 'fixtrack_token';
let usuarioAtual = null;
function authHeaders(extra = {}) {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}
function logout() {
    fetch(`${API_BASE}/auth/logout`, { method: 'POST', headers: authHeaders() }).finally(() => {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        location.href = 'login.html';
    });
}
function svgIcon(name) {
    const paths = {
        tool: '<path d="M14.7 6.3a5 5 0 0 0-6.6 6.6L3 18l3 3 5.1-5.1a5 5 0 0 0 6.6-6.6L14 13l-3-3 3.7-3.7Z"/>',
        user: '<path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="8" r="4"/>',
        lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
        eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
        arrow: '<path d="M5 12h14m-7-7 7 7-7 7"/>',
        search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
        logout: '<path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ''}</svg>`;
}
function renderLogin() {
    const app = document.getElementById('app');
    if (!app)
        return;
    app.innerHTML = `
    <main class="senai-login">
      <section class="senai-login-form">
        <img class="senai-wordmark" src="/imagens/logo-senai.svg" alt="SENAI">
        <form id="login-form" class="senai-form">
          <label class="senai-field" aria-label="Usuário">
            <input id="login-user" name="usuario" autocomplete="username" placeholder="Usuario" required>
            <span class="field-icon">${svgIcon('user')}</span>
          </label>
          <label class="senai-field" aria-label="Senha">
            <input id="login-password" name="senha" type="password" autocomplete="current-password" placeholder="Senha" required>
            <button type="button" class="password-toggle" id="toggle-password" aria-label="Mostrar senha">${svgIcon('eye')}</button>
          </label>
          <p class="login-error" id="login-error" role="alert"></p>
          <button class="senai-login-button" type="submit">login</button>
        </form>
      </section>
      <aside class="senai-login-art" aria-label="Ilustração de edifício">
    <img
        src="/imagens/predio.svg"
        class="login-predio"
        alt="Ilustração do prédio"
    >
</aside>
    </main>`;
    const form = document.getElementById('login-form');
    const password = document.getElementById('login-password');
    document.getElementById('toggle-password').addEventListener('click', () => password.type = password.type === 'password' ? 'text' : 'password');
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = form.querySelector('button[type="submit"]');
        const error = document.getElementById('login-error');
        button.disabled = true;
        button.textContent = 'Entrando...';
        error.textContent = '';
        try {
            const response = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usuario: form.usuario.value.trim(), senha: form.senha.value })
            });
            const data = await response.json();
            if (!response.ok)
                throw new Error(data.error || 'Não foi possível entrar.');
            localStorage.setItem(AUTH_TOKEN_KEY, data.token);
            location.href = data.usuario?.role === 'cliente' ? 'cliente.html' : 'index.html';
        }
        catch (err) {
            error.textContent = err.message || 'Erro ao conectar ao servidor.';
            button.disabled = false;
            button.textContent = 'login';
        }
    });
}
const pageInfo = {
    dashboard: { title: 'Dashboard', subtitle: 'Visão geral das ocorrências de manutenção.' },
    ocorrencias: { title: 'Ocorrências', subtitle: 'Consulte e atualize os chamados registrados.' },
    equipamentos: { title: 'Equipamentos', subtitle: 'Acompanhe a situação dos equipamentos por ambiente.' },
    detalhes: { title: 'Detalhes da ocorrência', subtitle: 'Informações e histórico do chamado selecionado.' },
    relatorios: { title: 'Relatórios', subtitle: 'Resumo dos dados registrados no sistema.' },
    usuarios: { title: 'Gestão de usuários', subtitle: 'Crie e gerencie acessos de clientes e administradores.' },
    catalogos: { title: 'Salas e equipamentos', subtitle: 'Gerencie as opções disponíveis no portal do cliente.' }
};
function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}
function formatDate(value) {
    if (!value)
        return '-';
    const d = new Date(value.replace(' ', 'T') + (value.includes('Z') ? '' : 'Z'));
    if (Number.isNaN(d.getTime()))
        return value;
    return d.toLocaleString('pt-BR');
}
function statusLabel(status) {
    const map = { PENDENTE: 'Pendente', RESOLVIDA: 'Concluída', ABERTA: 'Aberta', EM_ANALISE: 'Em análise', EM_MANUTENCAO: 'Em processo', CANCELADA: 'Cancelada' };
    return map[status] || status || '-';
}
function statusClass(status) {
    const map = { PENDENTE: 'status-aberta', RESOLVIDA: 'status-resolvida', ABERTA: 'status-aberta', EM_ANALISE: 'status-analise', EM_MANUTENCAO: 'status-manutencao', CANCELADA: 'status-cancelada' };
    return map[status] || 'status-analise';
}
function icon(name) {
    return ({ dashboard: '▦', ocorrencias: '⚠', equipamentos: '▣', relatorios: '▤', detalhes: '⌁', add: '＋', arrow: '→', check: '✓', clock: '◷' })[name] || '•';
}
function navLink(href, label, key, current) {
    return `<a href="${href}" class="${current === key ? 'active' : ''}"><span>${icon(key)}</span><span>${label}</span></a>`;
}
async function renderLayout(page) {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);

    if (!token) {
        location.href = 'login.html';
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/auth/me`, {
            headers: authHeaders()
        });

        if (!response.ok) {
            throw new Error('Sessão expirada');
        }

        const data = await response.json();
        usuarioAtual = data.usuario;

        if (usuarioAtual.role === 'cliente') {
            location.href = 'cliente.html';
            return;
        }

        if (['usuarios', 'catalogos'].includes(page) && usuarioAtual.role !== 'chefe') {
            location.href = 'index.html';
            return;
        }
    } catch {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        location.href = 'login.html';
        return;
    }

    const app = document.getElementById('app');
    if (!app) return;

    const info = pageInfo[page] || pageInfo.dashboard;
    const navItems = [
        { href: 'index.html', label: 'Dashboard', key: 'dashboard' },
        { href: 'ocorrencias.html', label: 'Ocorrências', key: 'ocorrencias' },
        { href: 'relatorios.html', label: 'Relatórios', key: 'relatorios' }
    ];

    if (usuarioAtual.role === 'chefe') {
        navItems.push(
            {
                href: 'usuarios.html',
                label: 'Usuários',
                key: 'usuarios'
            },
            {
                href: 'cadastros.html',
                label: 'Cadastros',
                key: 'catalogos'
            }
        );
    }

    app.className = 'app senai-app';
    app.innerHTML = `
    <header class="senai-topbar">
      <a class="senai-brand" href="index.html" aria-label="SENAI">
        <img class="senai-wordmark" src="/imagens/logo-senai.svg" alt="SENAI">
      </a>
      <label class="senai-search">
        ${svgIcon('search')}
        <input id="global-search" type="search" placeholder="Buscar" aria-label="Buscar ocorrências">
      </label>
      <nav class="senai-nav">
        ${navItems.map(item => `
          <a href="${item.href}" class="${page === item.key ? 'active' : ''}">
            ${item.label}
          </a>
        `).join('')}
      </nav>
      <button class="senai-logout" onclick="logout()" title="Sair" aria-label="Sair">
        ${svgIcon('logout')}
      </button>
    </header>
    <main class="senai-content" id="page-content">
      <div class="senai-page-heading">
        <h1>${esc(info.title)}</h1>
        <p>${esc(info.subtitle)}</p>
      </div>
    </main>`;

    const globalSearch = document.getElementById('global-search');

    if (globalSearch) {
        globalSearch.addEventListener('keydown', event => {
            if (event.key === 'Enter' && globalSearch.value.trim()) {
                location.href = `ocorrencias.html?busca=${encodeURIComponent(globalSearch.value.trim())}`;
            }
        });
    }

    if (page === 'dashboard') renderDashboard();
    if (page === 'ocorrencias') renderOcorrencias();
    if (page === 'equipamentos') renderEquipamentos();
    if (page === 'relatorios') renderRelatorios();
    if (page === 'detalhes') renderDetalhes();
    if (page === 'usuarios') renderUsuarios();
    if (page === 'catalogos') renderCatalogos();
}

async function getChamados() {
    const response = await fetch(`${API_BASE}/chamados`, { headers: authHeaders() });
    if (!response.ok)
        throw new Error(`HTTP ${response.status}`);
    return response.json();
}
function statCard(title, value, symbol) {
    return `<div class="card stat"><div><p>${esc(title)}</p><h3>${value}</h3></div><div class="stat-icon">${symbol}</div></div>`;
}
function chamadoRows(chamados, withAction = true) {
    if (!chamados.length)
        return `<tr><td colspan="7"><div class="empty">Nenhuma ocorrência registrada.</div></td></tr>`;
    return chamados.map(c => `
    <tr>
      <td>#${esc(c.id)}</td><td>${esc(c.sala)}</td><td>${esc(c.equipamento)}</td>
      <td>${esc(c.solicitante || 'Registro externo')}</td>
      <td><span class="badge ${statusClass(c.status)}">${esc(statusLabel(c.status))}</span></td>
      <td>${esc(formatDate(c.data))}</td>
      <td>${withAction ? `<a class="btn btn-light" href="detalhes.html?id=${encodeURIComponent(c.id)}">Ver</a>` : ''}</td>
    </tr>`).join('');
}
async function renderDashboard() {
    const content = document.getElementById('page-content');
    try {
        const chamados = await getChamados();
        const groups = [
            { key: 'todos', label: 'Todos', color: 'all' },
            { key: 'pendentes', label: 'Pendentes', color: 'pending' },
            { key: 'processo', label: 'Em Processo', color: 'progress' },
            { key: 'concluidos', label: 'Concluído', color: 'done' }
        ];
        const groupFor = c => {
            if (c.status === 'RESOLVIDA')
                return 'concluidos';
            if (['EM_ANALISE', 'EM_MANUTENCAO'].includes(c.status))
                return 'processo';
            if (['PENDENTE', 'ABERTA'].includes(c.status))
                return 'pendentes';
            return 'pendentes';
        };
        const statusText = c => c.status === 'RESOLVIDA' ? 'Concluído' :
            ['EM_ANALISE', 'EM_MANUTENCAO'].includes(c.status) ? 'Em Processo' : 'A Fazer (Pendente):';
        const statusClassCard = c => c.status === 'RESOLVIDA' ? 'done' :
            ['EM_ANALISE', 'EM_MANUTENCAO'].includes(c.status) ? 'progress' : 'pending';
        const description = c => c.descricao || c.equipamento || 'Ocorrência registrada';
        content.innerHTML = `
      <div class="senai-page-heading"><h1>Painel de gestão de ocorrências - SENAI</h1><p>Acompanhe e gerencie as ocorrências registradas</p></div>
      <div class="senai-filters" role="tablist" aria-label="Filtrar ocorrências">
        ${groups.map((g, i) => `<button class="senai-filter ${i === 0 ? 'active' : ''}" data-filter="${g.key}" role="tab" aria-selected="${i === 0}">${g.label}</button>`).join('')}
      </div>
      <div class="senai-cards" id="senai-cards"></div>
      <div class="senai-dashboard-footer">
        <div class="senai-pagination"><button type="button" id="prev-cards" aria-label="Página anterior">‹</button><button type="button" id="next-cards" aria-label="Próxima página">›</button></div>
        <p id="senai-summary"></p>
      </div>`;
        let activeFilter = 'todos', pageIndex = 0;
        const pageSize = 6;
        const search = document.getElementById('global-search');
        function draw() {
            const q = (search?.value || new URLSearchParams(location.search).get('busca') || '').toLowerCase();
            const filtered = chamados.filter(c => (activeFilter === 'todos' || groupFor(c) === activeFilter) &&
                (!q || `${c.sala} ${c.equipamento} ${c.descricao} ${c.id}`.toLowerCase().includes(q)));
            const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
            pageIndex = Math.min(pageIndex, pages - 1);
            const visible = filtered.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
            document.getElementById('senai-cards').innerHTML = visible.length ? visible.map(c => `
        <article class="senai-occ-card ${statusClassCard(c)}">
          <div class="senai-occ-head"><span>${statusText(c)}</span><span class="occ-status-icon">${c.status === 'RESOLVIDA' ? '✓' : c.status === 'PENDENTE' ? '◷' : '⚙'}</span></div>
          <a class="senai-occ-body" href="detalhes.html?id=${encodeURIComponent(c.id)}">
            <strong>${esc(description(c))}</strong>
            <small>${esc(c.sala || 'Sala não informada')} · ${esc(c.equipamento || 'Equipamento não informado')}</small>
            <small class="occ-id">Ocorrência #${esc(c.id)}</small>
          </a>
        </article>`).join('') : '<div class="senai-empty">Nenhuma ocorrência encontrada.</div>';
            const pending = chamados.filter(c => groupFor(c) === 'pendentes').length;
            const progress = chamados.filter(c => groupFor(c) === 'processo').length;
            const done = chamados.filter(c => groupFor(c) === 'concluidos').length;
            document.getElementById('senai-summary').textContent = `Total: ${chamados.length}  |  Pendente: ${pending}  |  Em processo: ${progress}  |  Concluído: ${done}`;
            document.getElementById('prev-cards').disabled = pageIndex === 0;
            document.getElementById('next-cards').disabled = pageIndex >= pages - 1;
        }
        document.querySelectorAll('.senai-filter').forEach(button => button.addEventListener('click', () => {
            activeFilter = button.dataset.filter;
            pageIndex = 0;
            document.querySelectorAll('.senai-filter').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-selected', b === button ? 'true' : 'false'); });
            draw();
        }));
        document.getElementById('prev-cards').addEventListener('click', () => { pageIndex--; draw(); });
        document.getElementById('next-cards').addEventListener('click', () => { pageIndex++; draw(); });
        search?.addEventListener('input', draw);
        draw();
    }
    catch (error) {
        showError(content, error);
    }
}
async function renderOcorrencias() {
    const content = document.getElementById('page-content');
    try {
        const chamados = await getChamados();
        content.innerHTML = `
      <div class="title-row"><div><h1>Ocorrências</h1><p class="subtitle">Consulte e atualize os chamados registrados.</p></div></div>
      <div class="card">
        <div class="filters"><input id="search" placeholder="Buscar sala ou equipamento..."><select id="statusFilter"><option value="">Todos os status</option><option value="PENDENTE">Pendente</option><option value="EM_ANALISE">Em análise</option><option value="EM_MANUTENCAO">Em processo</option><option value="RESOLVIDA">Concluída</option><option value="CANCELADA">Cancelada</option></select><button class="btn btn-light" id="clearFilter">Limpar</button></div>
        <div class="table-wrap"><table class="table"><thead><tr><th>ID</th><th>Sala</th><th>Equipamento</th><th>Solicitante</th><th>Status</th><th>Data</th><th>Ação</th></tr></thead><tbody id="rows">${chamadoRows(chamados)}</tbody></table></div>
      </div>`;
        const update = () => {
            const q = document.getElementById('search').value.toLowerCase();
            const st = document.getElementById('statusFilter').value;
            const filtered = chamados.filter(c => (!q || `${c.sala} ${c.equipamento} ${c.descricao}`.toLowerCase().includes(q)) && (!st || c.status === st));
            document.getElementById('rows').innerHTML = chamadoRows(filtered);
        };
        document.getElementById('search').addEventListener('input', update);
        document.getElementById('statusFilter').addEventListener('change', update);
        document.getElementById('clearFilter').addEventListener('click', () => { document.getElementById('search').value = ''; document.getElementById('statusFilter').value = ''; update(); });
    }
    catch (error) {
        showError(content, error);
    }
}
async function renderEquipamentos() {
    const content = document.getElementById('page-content');
    try {
        const chamados = await getChamados();
        const groups = {};
        chamados.forEach(c => { const key = c.equipamento || 'Não informado'; groups[key] ||= { total: 0, pendentes: 0, resolvidos: 0 }; groups[key].total++; if (c.status === 'PENDENTE')
            groups[key].pendentes++; if (c.status === 'RESOLVIDA')
            groups[key].resolvidos++; });
        const cards = Object.entries(groups).map(([name, g]) => `<div class="card mini"><strong>${g.total}</strong><span>${esc(name)}</span><p>${g.pendentes} pendente(s) · ${g.resolvidos} resolvido(s)</p></div>`).join('');
        content.innerHTML = `<div class="title-row"><div><h1>Equipamentos</h1><p class="subtitle">Acompanhe a situação dos equipamentos por ambiente.</p></div></div><div class="equipment-grid">${cards || '<div class="card empty">Nenhum equipamento registrado.</div>'}</div><div class="card"><h2 class="card-title">Ocorrências por equipamento</h2><div class="table-wrap"><table class="table"><thead><tr><th>Equipamento</th><th>Total</th><th>Pendentes</th><th>Resolvidos</th></tr></thead><tbody>${Object.entries(groups).map(([name, g]) => `<tr><td>${esc(name)}</td><td>${g.total}</td><td>${g.pendentes}</td><td>${g.resolvidos}</td></tr>`).join('') || '<tr><td colspan="4"><div class="empty">Sem dados.</div></td></tr>'}</tbody></table></div></div>`;
    }
    catch (error) {
        showError(content, error);
    }
}
async function renderRelatorios() {
    const content = document.getElementById('page-content');
    try {
        const chamados = await getChamados();
        const salas = {};
        chamados.forEach(c => { salas[c.sala] ||= { total: 0, pendentes: 0 }; salas[c.sala].total++; if (c.status === 'PENDENTE')
            salas[c.sala].pendentes++; });
        const max = Math.max(1, ...Object.values(salas).map(x => x.total));
        const bars = Object.entries(salas).map(([s, g]) => `<div class="bar-row"><span>${esc(s)}</span><div class="bar"><i style="width:${(g.total / max) * 100}%"></i></div><strong>${g.total}</strong></div>`).join('');
        content.innerHTML = `<div class="title-row"><div><h1>Relatórios</h1><p class="subtitle">Resumo dos dados registrados no sistema.</p></div><button class="btn btn-primary" onclick="window.print()">Imprimir relatório</button></div><div class="chart-grid"><div class="card"><h2 class="card-title">Chamados por sala</h2><div class="bars">${bars || '<div class="empty">Sem dados.</div>'}</div></div><div class="card"><h2 class="card-title">Indicadores</h2><div class="quick"><a><span>Total de chamados</span><strong>${chamados.length}</strong></a><a><span>Pendentes</span><strong>${chamados.filter(c => c.status === 'PENDENTE').length}</strong></a><a><span>Resolvidos</span><strong>${chamados.filter(c => c.status === 'RESOLVIDA').length}</strong></a></div></div></div>`;
    }
    catch (error) {
        showError(content, error);
    }
}
async function renderDetalhes() {
    const content = document.getElementById('page-content');
    const id = new URLSearchParams(location.search).get('id');

    if (!id) {
        content.innerHTML = `
            <div class="card empty">
                Nenhuma ocorrência foi selecionada.<br><br>
                <a class="btn btn-primary" href="ocorrencias.html">Voltar para ocorrências</a>
            </div>
        `;
        return;
    }

    try {
        const chamados = await getChamados();
        const chamado = chamados.find(item => String(item.id) === String(id));

        if (!chamado) {
            throw new Error('Ocorrência não encontrada.');
        }

        content.innerHTML = `
            <div class="title-row">
                <div>
                    <h1>Ocorrência #${esc(chamado.id)}</h1>
                    <p class="subtitle">Acompanhe as informações e atualize o andamento do chamado.</p>
                </div>
                <a class="btn btn-light" href="ocorrencias.html">← Voltar</a>
            </div>

            <div class="detail-grid">
                <section class="card">
                    <h2 class="card-title">Informações</h2>
                    <div class="info-list">
                        <div class="info-item"><span>Sala</span><strong>${esc(chamado.sala)}</strong></div>
                        <div class="info-item"><span>Equipamento</span><strong>${esc(chamado.equipamento)}</strong></div>
                        <div class="info-item"><span>Solicitante</span><strong>${esc(chamado.solicitante || 'Registro externo')}</strong></div>
                        <div class="info-item"><span>Status atual</span><strong><span class="badge ${statusClass(chamado.status)}">${esc(statusLabel(chamado.status))}</span></strong></div>
                        <div class="info-item"><span>Data</span><strong>${esc(formatDate(chamado.data))}</strong></div>
                        <div class="info-item" style="grid-column:1/-1"><span>Descrição</span><strong>${esc(chamado.descricao || 'Sem descrição')}</strong></div>
                    </div>

                    <div class="actions status-update-actions">
                        <label class="status-select-label" for="newStatus">Atualizar status</label>
                        <select id="newStatus">
                            <option value="PENDENTE" ${chamado.status === 'PENDENTE' ? 'selected' : ''}>Pendente</option>
                            <option value="EM_ANALISE" ${chamado.status === 'EM_ANALISE' ? 'selected' : ''}>Em análise</option>
                            <option value="EM_MANUTENCAO" ${chamado.status === 'EM_MANUTENCAO' ? 'selected' : ''}>Em processo</option>
                            <option value="RESOLVIDA" ${chamado.status === 'RESOLVIDA' ? 'selected' : ''}>Concluída</option>
                            <option value="CANCELADA" ${chamado.status === 'CANCELADA' ? 'selected' : ''}>Cancelada</option>
                        </select>
                        <button class="btn btn-primary" id="saveStatus" type="button">Salvar status</button>
                        <p class="user-form-feedback" id="status-feedback" role="status"></p>
                    </div>
                </section>

                <section class="card">
                    <h2 class="card-title">Histórico</h2>
                    <div class="timeline">
                        <div class="timeline-item">
                            <strong>Chamado registrado</strong>
                            <p>${esc(formatDate(chamado.data))}</p>
                        </div>
                        <div class="timeline-item">
                            <strong>Status atual: ${esc(statusLabel(chamado.status))}</strong>
                            <p>Último estado registrado no sistema.</p>
                        </div>
                    </div>
                </section>
            </div>
        `;

        document.getElementById('saveStatus').addEventListener('click', async () => {
            const button = document.getElementById('saveStatus');
            const feedback = document.getElementById('status-feedback');
            const status = document.getElementById('newStatus').value;

            button.disabled = true;
            button.textContent = 'Salvando...';
            feedback.textContent = '';

            try {
                const response = await fetch(`${API_BASE}/chamados/${encodeURIComponent(chamado.id)}`, {
                    method: 'PATCH',
                    headers: authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ status })
                });
                const resultado = await response.json();

                if (!response.ok) {
                    throw new Error(resultado.error || 'Não foi possível atualizar o status.');
                }

                showToast('Status atualizado com sucesso.');
                await renderDetalhes();
            } catch (error) {
                feedback.textContent = error.message;
                feedback.classList.add('error');
            } finally {
                button.disabled = false;
                button.textContent = 'Salvar status';
            }
        });
    } catch (error) {
        showError(content, error);
    }
}

async function renderUsuarios() {
    const content = document.getElementById('page-content');

    try {
        const response = await fetch(`${API_BASE}/admin/usuarios`, {
            headers: authHeaders()
        });

        if (!response.ok) {
            throw new Error('Não foi possível carregar os usuários.');
        }

        const usuarios = await response.json();
        const nomePerfil = role => role === 'chefe'
            ? 'Administrador-chefe'
            : role === 'admin' ? 'Administrador' : 'Cliente';

        content.innerHTML = `
            <div class="senai-page-heading">
                <h1>Gestão de usuários</h1>
                <p>Crie contas de clientes e administradores e controle quem pode acessar o FixTrack.</p>
            </div>

            <section class="card user-create-card">
                <div class="user-section-heading">
                    <div>
                        <h2 class="card-title">Criar novo perfil</h2>
                        <p>O acesso é criado previamente pelo administrador-chefe.</p>
                    </div>
                    <span class="user-section-icon">＋</span>
                </div>

                <form id="create-user-form" class="user-form-grid">
                    <label>
                        <span>Nome completo</span>
                        <input name="nome" type="text" minlength="2" maxlength="80" placeholder="Ex.: João da Silva" required>
                    </label>
                    <label>
                        <span>ID de acesso</span>
                        <input name="usuario" type="text" minlength="3" maxlength="30" pattern="[A-Za-z0-9._-]{3,30}" placeholder="Ex.: joao.silva" autocomplete="off" required>
                        <small>Use letras, números, ponto, hífen ou underline.</small>
                    </label>
                    <label>
                        <span>Senha inicial</span>
                        <input name="senha" type="password" minlength="8" maxlength="128" placeholder="Mínimo de 8 caracteres" autocomplete="new-password" required>
                    </label>
                    <label>
                        <span>Tipo de perfil</span>
                        <select name="role" required>
                            <option value="cliente">Cliente</option>
                            <option value="admin">Administrador</option>
                        </select>
                    </label>
                    <div class="user-form-action">
                        <button class="btn btn-primary" type="submit">Criar perfil</button>
                    </div>
                    <p class="user-form-feedback" id="user-form-feedback" role="status"></p>
                </form>
            </section>

            <section class="card user-list-card">
                <div class="user-section-heading">
                    <div>
                        <h2 class="card-title">Perfis cadastrados</h2>
                        <p>Perfis removidos ficam inativos e não conseguem mais entrar no sistema.</p>
                    </div>
                    <span class="user-count">${usuarios.length} perfil(is)</span>
                </div>
                <div class="table-wrap">
                    <table class="table user-table">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>ID de acesso</th>
                                <th>Perfil</th>
                                <th>Criação</th>
                                <th>Situação</th>
                                <th>Ação</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${usuarios.length ? usuarios.map(usuario => {
                                const podeGerenciar = usuario.role !== 'chefe' && usuario.id !== usuarioAtual.id;
                                const acao = !podeGerenciar
                                    ? '<span class="protected-user">Protegido</span>'
                                    : usuario.ativo
                                        ? `<button class="btn btn-danger btn-small" type="button" data-user-delete="${usuario.id}">Excluir acesso</button>`
                                        : `<button class="btn btn-light btn-small" type="button" data-user-reactivate="${usuario.id}">Reativar</button>`;

                                return `
                                    <tr>
                                        <td>${esc(usuario.nome)}</td>
                                        <td><strong>${esc(usuario.usuario)}</strong></td>
                                        <td><span class="user-role ${esc(usuario.role)}">${nomePerfil(usuario.role)}</span></td>
                                        <td>${esc(formatDate(usuario.criado_em))}</td>
                                        <td><span class="user-active ${usuario.ativo ? 'active' : 'inactive'}">${usuario.ativo ? 'Ativo' : 'Inativo'}</span></td>
                                        <td>${acao}</td>
                                    </tr>
                                `;
                            }).join('') : '<tr><td colspan="6"><div class="empty">Nenhum perfil cadastrado.</div></td></tr>'}
                        </tbody>
                    </table>
                </div>
            </section>
        `;

        const form = document.getElementById('create-user-form');
        const feedback = document.getElementById('user-form-feedback');

        form.addEventListener('submit', async event => {
            event.preventDefault();

            const button = form.querySelector('button[type="submit"]');
            const formData = new FormData(form);
            const dados = {
                nome: String(formData.get('nome')).trim(),
                usuario: String(formData.get('usuario')).trim(),
                senha: String(formData.get('senha')),
                role: String(formData.get('role'))
            };

            button.disabled = true;
            button.textContent = 'Criando perfil...';
            feedback.textContent = '';
            feedback.className = 'user-form-feedback';

            try {
                const createResponse = await fetch(`${API_BASE}/admin/usuarios`, {
                    method: 'POST',
                    headers: authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify(dados)
                });
                const resultado = await createResponse.json();

                if (!createResponse.ok) {
                    throw new Error(resultado.error || 'Não foi possível criar o perfil.');
                }

                showToast(`Perfil criado: ${resultado.usuarioCriado.usuario}`);
                await renderUsuarios();
            } catch (error) {
                feedback.textContent = error.message;
                feedback.classList.add('error');
                button.disabled = false;
                button.textContent = 'Criar perfil';
            }
        });

        document.querySelectorAll('[data-user-delete]').forEach(button => {
            button.addEventListener('click', async () => {
                const idUsuario = button.dataset.userDelete;
                const confirmar = confirm(
                    'Deseja excluir este acesso? A pessoa não conseguirá mais entrar, mas os chamados antigos serão preservados.'
                );

                if (!confirmar) return;

                try {
                    const deleteResponse = await fetch(`${API_BASE}/admin/usuarios/${encodeURIComponent(idUsuario)}`, {
                        method: 'DELETE',
                        headers: authHeaders()
                    });
                    const resultado = await deleteResponse.json();

                    if (!deleteResponse.ok) {
                        throw new Error(resultado.error || 'Não foi possível excluir o acesso.');
                    }

                    showToast('Acesso excluído. Histórico preservado.');
                    await renderUsuarios();
                } catch (error) {
                    showToast(error.message);
                }
            });
        });

        document.querySelectorAll('[data-user-reactivate]').forEach(button => {
            button.addEventListener('click', async () => {
                try {
                    const response = await fetch(`${API_BASE}/admin/usuarios/${encodeURIComponent(button.dataset.userReactivate)}`, {
                        method: 'PATCH',
                        headers: authHeaders({ 'Content-Type': 'application/json' }),
                        body: JSON.stringify({ ativo: true })
                    });
                    const resultado = await response.json();

                    if (!response.ok) {
                        throw new Error(resultado.error || 'Não foi possível reativar o acesso.');
                    }

                    showToast('Acesso reativado.');
                    await renderUsuarios();
                } catch (error) {
                    showToast(error.message);
                }
            });
        });
    } catch (error) {
        showError(content, error);
    }
}

async function renderCatalogos() {
    const content = document.getElementById('page-content');

    try {
        const response = await fetch(`${API_BASE}/admin/catalogos`, {
            headers: authHeaders()
        });

        if (!response.ok) {
            throw new Error('Não foi possível carregar os cadastros.');
        }

        const catalogos = await response.json();
        const renderLista = (tipo, itens) => itens.length ? itens.map(item => `
            <div class="catalog-item">
                <div>
                    <strong>${esc(item.nome)}</strong>
                    <span class="user-active ${item.ativo ? 'active' : 'inactive'}">${item.ativo ? 'Ativo' : 'Inativo'}</span>
                </div>
                <button
                    class="btn ${item.ativo ? 'btn-danger' : 'btn-light'} btn-small"
                    type="button"
                    data-catalog-type="${tipo}"
                    data-catalog-id="${item.id}"
                    data-catalog-active="${item.ativo ? 'true' : 'false'}"
                >${item.ativo ? 'Desativar' : 'Reativar'}</button>
            </div>
        `).join('') : '<p class="empty">Nenhuma opção cadastrada.</p>';

        content.innerHTML = `
            <div class="senai-page-heading">
                <h1>Salas e equipamentos</h1>
                <p>As opções ativas aparecem automaticamente no formulário de abertura de chamados do cliente.</p>
            </div>

            <div class="catalog-grid">
                <section class="card catalog-card">
                    <div class="user-section-heading">
                        <div>
                            <h2 class="card-title">Salas e ambientes</h2>
                            <p>Cadastre laboratórios, oficinas e outros espaços.</p>
                        </div>
                    </div>
                    <form id="create-sala-form" class="catalog-form">
                        <label for="nova-sala">Nome da sala</label>
                        <input id="nova-sala" name="nome" type="text" minlength="2" maxlength="60" placeholder="Ex.: LAB-03" required>
                        <button class="btn btn-primary" type="submit">Adicionar sala</button>
                    </form>
                    <div class="catalog-list">${renderLista('salas', catalogos.salas)}</div>
                </section>

                <section class="card catalog-card">
                    <div class="user-section-heading">
                        <div>
                            <h2 class="card-title">Tipos de equipamentos</h2>
                            <p>Cadastre os equipamentos disponíveis para manutenção.</p>
                        </div>
                    </div>
                    <form id="create-equipamento-form" class="catalog-form">
                        <label for="novo-equipamento">Nome do equipamento</label>
                        <input id="novo-equipamento" name="nome" type="text" minlength="2" maxlength="60" placeholder="Ex.: Impressora" required>
                        <button class="btn btn-primary" type="submit">Adicionar equipamento</button>
                    </form>
                    <div class="catalog-list">${renderLista('equipamentos', catalogos.equipamentos)}</div>
                </section>
            </div>
        `;

        const ligarFormulario = (formId, tipo, nomeBotao) => {
            const form = document.getElementById(formId);

            form.addEventListener('submit', async event => {
                event.preventDefault();

                const button = form.querySelector('button[type="submit"]');
                const nome = new FormData(form).get('nome').trim();
                button.disabled = true;
                button.textContent = 'Salvando...';

                try {
                    const createResponse = await fetch(`${API_BASE}/admin/catalogos/${tipo}`, {
                        method: 'POST',
                        headers: authHeaders({ 'Content-Type': 'application/json' }),
                        body: JSON.stringify({ nome })
                    });
                    const resultado = await createResponse.json();

                    if (!createResponse.ok) {
                        throw new Error(resultado.error || 'Não foi possível salvar a opção.');
                    }

                    showToast(`${nomeBotao} salvo com sucesso.`);
                    await renderCatalogos();
                } catch (error) {
                    showToast(error.message);
                    button.disabled = false;
                    button.textContent = nomeBotao === 'Sala' ? 'Adicionar sala' : 'Adicionar equipamento';
                }
            });
        };

        ligarFormulario('create-sala-form', 'salas', 'Sala');
        ligarFormulario('create-equipamento-form', 'equipamentos', 'Equipamento');

        document.querySelectorAll('[data-catalog-type]').forEach(button => {
            button.addEventListener('click', async () => {
                const tipo = button.dataset.catalogType;
                const id = button.dataset.catalogId;
                const ativo = button.dataset.catalogActive !== 'true';

                try {
                    const updateResponse = await fetch(`${API_BASE}/admin/catalogos/${tipo}/${encodeURIComponent(id)}`, {
                        method: 'PATCH',
                        headers: authHeaders({ 'Content-Type': 'application/json' }),
                        body: JSON.stringify({ ativo })
                    });
                    const resultado = await updateResponse.json();

                    if (!updateResponse.ok) {
                        throw new Error(resultado.error || 'Não foi possível atualizar a opção.');
                    }

                    showToast(ativo ? 'Opção reativada.' : 'Opção desativada.');
                    await renderCatalogos();
                } catch (error) {
                    showToast(error.message);
                }
            });
        });
    } catch (error) {
        showError(content, error);
    }
}

async function renderCliente() {
    const app = document.getElementById('app');
    const token = localStorage.getItem(AUTH_TOKEN_KEY);

    if (!token) {
        location.href = 'login.html';
        return;
    }

    try {
        const authResponse = await fetch(`${API_BASE}/auth/me`, {
            headers: authHeaders()
        });

        if (!authResponse.ok) {
            throw new Error('Sessão expirada. Entre novamente.');
        }

        const authData = await authResponse.json();
        usuarioAtual = authData.usuario;

        if (usuarioAtual.role !== 'cliente') {
            location.href = 'index.html';
            return;
        }

        const catalogosResponse = await fetch(`${API_BASE}/catalogos`, {
            headers: authHeaders()
        });

        if (!catalogosResponse.ok) {
            throw new Error('Não foi possível carregar as salas e os equipamentos.');
        }

        const catalogos = await catalogosResponse.json();

        app.className = 'app senai-app';
        app.innerHTML = `
          <header class="senai-topbar client-topbar">
            <a class="senai-brand" href="cliente.html" aria-label="SENAI">
              <img class="senai-wordmark" src="/imagens/logo-senai.svg" alt="SENAI">
            </a>
            <div class="client-welcome">
              <span>Portal do cliente</span>
              <strong>${esc(usuarioAtual.nome)}</strong>
            </div>
            <button class="senai-logout" onclick="logout()" title="Sair" aria-label="Sair">
              ${svgIcon('logout')}
            </button>
          </header>

          <main class="senai-content client-content" id="client-content">
            <div class="senai-page-heading">
              <h1>Abrir ocorrência</h1>
              <p>Informe onde está o problema e qual equipamento precisa de manutenção.</p>
            </div>

            <section class="card client-form-card">
              <form id="client-ticket-form" class="client-ticket-form">
                <label>
                  <span>Local do problema</span>
                  <select name="sala" required>
                    <option value="">Selecione uma sala</option>
                    ${catalogos.salas.map(sala => `<option value="${esc(sala.nome)}">${esc(sala.nome)}</option>`).join('')}
                  </select>
                </label>

                <label>
                  <span>Equipamento com problema</span>
                  <select name="equipamento" required>
                    <option value="">Selecione um equipamento</option>
                    ${catalogos.equipamentos.map(equipamento => `<option value="${esc(equipamento.nome)}">${esc(equipamento.nome)}</option>`).join('')}
                  </select>
                </label>

                <label class="client-description-field">
                  <span>Descrição do problema <small>(opcional)</small></span>
                  <textarea name="descricao" maxlength="500" rows="4" placeholder="Conte brevemente o que aconteceu..."></textarea>
                </label>

                <div class="client-submit-row">
                  <p id="client-form-feedback" class="client-form-feedback" role="status"></p>
                  <button class="btn btn-primary" type="submit">Registrar ocorrência</button>
                </div>
              </form>
            </section>

            <section class="client-history-section">
              <div class="user-section-heading">
                <div>
                  <h2>Minhas ocorrências</h2>
                  <p>Acompanhe o andamento dos problemas que você registrou.</p>
                </div>
              </div>
              <div class="card">
                <div class="table-wrap">
                  <table class="table client-history-table">
                    <thead>
                      <tr><th>Protocolo</th><th>Local</th><th>Equipamento</th><th>Status</th><th>Data</th></tr>
                    </thead>
                    <tbody id="client-history-rows">
                      <tr><td colspan="5"><div class="empty">Carregando ocorrências...</div></td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </main>
        `;

        await atualizarHistoricoCliente();

        const form = document.getElementById('client-ticket-form');
        const feedback = document.getElementById('client-form-feedback');

        form.addEventListener('submit', async event => {
            event.preventDefault();

            const button = form.querySelector('button[type="submit"]');
            const dados = Object.fromEntries(new FormData(form).entries());

            button.disabled = true;
            button.textContent = 'Registrando...';
            feedback.textContent = '';
            feedback.className = 'client-form-feedback';

            try {
                const response = await fetch(`${API_BASE}/cliente/chamados`, {
                    method: 'POST',
                    headers: authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify(dados)
                });
                const resultado = await response.json();

                if (!response.ok) {
                    throw new Error(resultado.error || 'Não foi possível registrar a ocorrência.');
                }

                form.reset();
                feedback.textContent = `Ocorrência #${resultado.id} registrada com sucesso!`;
                feedback.classList.add('success');
                await atualizarHistoricoCliente();
            } catch (error) {
                feedback.textContent = error.message;
                feedback.classList.add('error');
            } finally {
                button.disabled = false;
                button.textContent = 'Registrar ocorrência';
            }
        });
    } catch (error) {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        location.href = 'login.html';
    }
}

async function atualizarHistoricoCliente() {
    const response = await fetch(`${API_BASE}/cliente/chamados`, {
        headers: authHeaders()
    });

    if (!response.ok) {
        throw new Error('Não foi possível carregar suas ocorrências.');
    }

    const chamados = await response.json();
    const tbody = document.getElementById('client-history-rows');

    if (!tbody) return;

    tbody.innerHTML = chamados.length ? chamados.map(chamado => `
      <tr>
        <td><strong>#${esc(chamado.id)}</strong></td>
        <td>${esc(chamado.sala)}</td>
        <td>${esc(chamado.equipamento)}</td>
        <td><span class="badge ${statusClass(chamado.status)}">${esc(statusLabel(chamado.status))}</span></td>
        <td>${esc(formatDate(chamado.data))}</td>
      </tr>
    `).join('') : `
      <tr><td colspan="5"><div class="empty">Você ainda não registrou nenhuma ocorrência.</div></td></tr>
    `;
}

function showError(target, error) {
    target.innerHTML = `<div class="card"><div class="empty">Não foi possível carregar os dados.<br><small>${esc(error.message || error)}</small><br><br><button class="btn btn-primary" onclick="location.reload()">Tentar novamente</button></div></div>`;
}
function showToast(message) {
    const old = document.querySelector('.toast');
    if (old)
        old.remove();
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
}
window.renderLayout = renderLayout;
window.renderCliente = renderCliente;
