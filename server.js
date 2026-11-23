const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DATABASE_PATH = path.join(__dirname, 'senai_manutencao.db');

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const db = new sqlite3.Database(DATABASE_PATH);
const sessoes = new Map();

const CATALOGOS = {
    salas: 'salas',
    equipamentos: 'equipamentos'
};

const SALAS_INICIAIS = ['LAB-01', 'LAB-02', 'OFICINA-01'];
const EQUIPAMENTOS_INICIAIS = ['Computador', 'Ar-Condicionado', 'Projetor'];
const STATUS_PERMITIDOS = [
    'PENDENTE',
    'ABERTA',
    'EM_ANALISE',
    'EM_MANUTENCAO',
    'RESOLVIDA',
    'CANCELADA'
];

function executar(sql, parametros = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, parametros, function (erro) {
            if (erro) return reject(erro);
            resolve({ id: this.lastID, alteracoes: this.changes });
        });
    });
}

function consultar(sql, parametros = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, parametros, (erro, linha) => {
            if (erro) return reject(erro);
            resolve(linha);
        });
    });
}

function consultarTodos(sql, parametros = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, parametros, (erro, linhas) => {
            if (erro) return reject(erro);
            resolve(linhas);
        });
    });
}

function gerarHashSenha(senha, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(senha, salt, 64).toString('hex');
    return { salt, hash };
}

function verificarSenha(senha, salt, hashArmazenado) {
    const hashInformado = crypto.scryptSync(senha, salt, 64);
    const hashOriginal = Buffer.from(hashArmazenado, 'hex');

    return hashInformado.length === hashOriginal.length &&
        crypto.timingSafeEqual(hashInformado, hashOriginal);
}

function usuarioPublico(usuario) {
    return {
        id: usuario.id,
        nome: usuario.nome,
        usuario: usuario.usuario,
        role: usuario.role,
        ativo: Boolean(usuario.ativo)
    };
}

async function inserirOpcoesIniciais(tabela, nomes) {
    for (const nome of nomes) {
        await executar(
            `INSERT OR IGNORE INTO ${tabela} (nome) VALUES (?)`,
            [nome]
        );
    }
}

async function criarContaInicial({ nome, usuario, senha, role }) {
    const existente = await consultar(
        'SELECT id FROM usuarios WHERE usuario = ?',
        [usuario]
    );

    if (existente) return;

    const { salt, hash } = gerarHashSenha(senha);

    await executar(
        `INSERT INTO usuarios (nome, usuario, senha_hash, senha_salt, role)
         VALUES (?, ?, ?, ?, ?)`,
        [nome, usuario, hash, salt, role]
    );
}

async function inicializarBanco() {
    await executar('PRAGMA foreign_keys = ON');

    await executar(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            usuario TEXT NOT NULL COLLATE NOCASE UNIQUE,
            senha_hash TEXT NOT NULL,
            senha_salt TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('chefe', 'admin', 'cliente')),
            ativo INTEGER NOT NULL DEFAULT 1,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await executar(`
        CREATE TABLE IF NOT EXISTS chamados (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sala TEXT NOT NULL,
            equipamento TEXT NOT NULL,
            descricao TEXT,
            status TEXT DEFAULT 'PENDENTE',
            data TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            usuario_id INTEGER,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    `);

    await executar(`
        CREATE TABLE IF NOT EXISTS salas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL COLLATE NOCASE UNIQUE,
            ativo INTEGER NOT NULL DEFAULT 1,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await executar(`
        CREATE TABLE IF NOT EXISTS equipamentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL COLLATE NOCASE UNIQUE,
            ativo INTEGER NOT NULL DEFAULT 1,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await inserirOpcoesIniciais('salas', SALAS_INICIAIS);
    await inserirOpcoesIniciais('equipamentos', EQUIPAMENTOS_INICIAIS);

    const colunasChamados = await consultarTodos('PRAGMA table_info(chamados)');
    const possuiUsuarioId = colunasChamados.some(coluna => coluna.name === 'usuario_id');

    if (!possuiUsuarioId) {
        await executar(
            'ALTER TABLE chamados ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id)'
        );
    }

    await executar(
        'CREATE INDEX IF NOT EXISTS idx_chamados_data ON chamados(data DESC)'
    );
    await executar(
        'CREATE INDEX IF NOT EXISTS idx_chamados_usuario ON chamados(usuario_id)'
    );

    await criarContaInicial({
        nome: 'Administrador',
        usuario: process.env.ADMIN_USER || 'admin',
        senha: process.env.ADMIN_PASSWORD || 'admin123',
        role: 'admin'
    });

    await criarContaInicial({
        nome: 'Administrador-chefe',
        usuario: process.env.CHEFE_USER || 'chefe',
        senha: process.env.CHEFE_PASSWORD || 'FixTrack@2026',
        role: 'chefe'
    });
}

function exigirLogin(req, res, next) {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const sessao = token && sessoes.get(token);

    if (!sessao) {
        return res.status(401).json({ error: 'Faça login para continuar.' });
    }

    req.usuario = sessao;
    req.token = token;
    next();
}

function exigirPerfil(...perfisPermitidos) {
    return (req, res, next) => {
        if (!req.usuario || !perfisPermitidos.includes(req.usuario.role)) {
            return res.status(403).json({
                error: 'Você não tem permissão para acessar esta área.'
            });
        }

        next();
    };
}

async function validarChamado(sala, equipamento) {
    const salaAtiva = await consultar(
        'SELECT id FROM salas WHERE nome = ? AND ativo = 1',
        [sala]
    );
    const equipamentoAtivo = await consultar(
        'SELECT id FROM equipamentos WHERE nome = ? AND ativo = 1',
        [equipamento]
    );

    return Boolean(salaAtiva && equipamentoAtivo);
}

function obterTabelaCatalogo(tipo) {
    return CATALOGOS[tipo] || null;
}

// -----------------------------------------------------------------------------
// AUTENTICAÇÃO E CONTROLE DE ACESSO
// -----------------------------------------------------------------------------

app.post('/api/auth/login', async (req, res) => {
    try {
        const { usuario, senha } = req.body || {};

        if (!usuario || !senha) {
            return res.status(400).json({ error: 'Informe usuário e senha.' });
        }

        const conta = await consultar(
            'SELECT * FROM usuarios WHERE usuario = ?',
            [String(usuario).trim()]
        );

        if (!conta || !conta.ativo ||
            !verificarSenha(String(senha), conta.senha_salt, conta.senha_hash)) {
            return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
        }

        const token = crypto.randomBytes(32).toString('hex');
        sessoes.set(token, usuarioPublico(conta));

        res.json({
            token,
            usuario: usuarioPublico(conta)
        });
    } catch (erro) {
        console.error('Erro no login:', erro);
        res.status(500).json({ error: 'Não foi possível realizar o login.' });
    }
});

app.get('/api/auth/me', exigirLogin, (req, res) => {
    res.json({ autenticado: true, usuario: req.usuario });
});

app.post('/api/auth/logout', exigirLogin, (req, res) => {
    sessoes.delete(req.token);
    res.json({ sucesso: true });
});

// -----------------------------------------------------------------------------
// ÁREA DO ADMINISTRADOR-CHEFE: CRIAÇÃO E CONSULTA DE CONTAS DE CLIENTES
// -----------------------------------------------------------------------------

app.get(
    '/api/admin/usuarios',
    exigirLogin,
    exigirPerfil('chefe'),
    async (req, res) => {
        try {
            const usuarios = await consultarTodos(`
                SELECT id, nome, usuario, role, ativo, criado_em
                FROM usuarios
                ORDER BY criado_em DESC, id DESC
            `);

            res.json(usuarios.map(usuario => ({
                ...usuario,
                ativo: Boolean(usuario.ativo)
            })));
        } catch (erro) {
            console.error('Erro ao listar usuários:', erro);
            res.status(500).json({ error: 'Não foi possível listar os usuários.' });
        }
    }
);

app.post(
    '/api/admin/usuarios',
    exigirLogin,
    exigirPerfil('chefe'),
    async (req, res) => {
        try {
            const nome = String(req.body?.nome || '').trim();
            const usuario = String(req.body?.usuario || '').trim();
            const senha = String(req.body?.senha || '');
            const role = String(req.body?.role || 'cliente');

            if (!['cliente', 'admin'].includes(role)) {
                return res.status(400).json({
                    error: 'Selecione um perfil válido. O administrador-chefe não pode ser criado por esta tela.'
                });
            }

            if (nome.length < 2 || nome.length > 80) {
                return res.status(400).json({
                    error: 'O nome deve ter entre 2 e 80 caracteres.'
                });
            }

            if (!/^[a-zA-Z0-9._-]{3,30}$/.test(usuario)) {
                return res.status(400).json({
                    error: 'O ID deve ter de 3 a 30 caracteres e usar apenas letras, números, ponto, hífen ou underline.'
                });
            }

            if (senha.length < 8 || senha.length > 128) {
                return res.status(400).json({
                    error: 'A senha deve ter pelo menos 8 caracteres.'
                });
            }

            const existente = await consultar(
                'SELECT id FROM usuarios WHERE usuario = ?',
                [usuario]
            );

            if (existente) {
                return res.status(409).json({
                    error: 'Esse ID já está sendo utilizado. Escolha outro.'
                });
            }

            const { salt, hash } = gerarHashSenha(senha);
            const resultado = await executar(
                `INSERT INTO usuarios (nome, usuario, senha_hash, senha_salt, role)
                 VALUES (?, ?, ?, ?, ?)`,
                [nome, usuario, hash, salt, role]
            );

            res.status(201).json({
                mensagem: role === 'admin'
                    ? 'Conta de administrador criada com sucesso.'
                    : 'Conta de cliente criada com sucesso.',
                usuarioCriado: {
                    id: resultado.id,
                    nome,
                    usuario,
                    role
                }
            });
        } catch (erro) {
            console.error('Erro ao criar conta:', erro);
            res.status(500).json({ error: 'Não foi possível criar a conta.' });
        }
    }
);

// O chefe pode remover acessos sem apagar o histórico de chamados.
app.delete(
    '/api/admin/usuarios/:id',
    exigirLogin,
    exigirPerfil('chefe'),
    async (req, res) => {
        try {
            const id = Number(req.params.id);

            if (!Number.isInteger(id) || id <= 0) {
                return res.status(400).json({ error: 'ID de usuário inválido.' });
            }

            if (id === req.usuario.id) {
                return res.status(400).json({ error: 'Você não pode excluir o próprio acesso.' });
            }

            const alvo = await consultar(
                'SELECT id, role FROM usuarios WHERE id = ?',
                [id]
            );

            if (!alvo) {
                return res.status(404).json({ error: 'Usuário não encontrado.' });
            }

            if (alvo.role === 'chefe') {
                return res.status(403).json({ error: 'O perfil de administrador-chefe é protegido.' });
            }

            await executar('UPDATE usuarios SET ativo = 0 WHERE id = ?', [id]);

            for (const [token, sessao] of sessoes.entries()) {
                if (sessao.id === id) sessoes.delete(token);
            }

            res.json({ sucesso: true, mensagem: 'Acesso removido. O histórico de chamados foi preservado.' });
        } catch (erro) {
            console.error('Erro ao excluir usuário:', erro);
            res.status(500).json({ error: 'Não foi possível excluir o acesso.' });
        }
    }
);

app.patch(
    '/api/admin/usuarios/:id',
    exigirLogin,
    exigirPerfil('chefe'),
    async (req, res) => {
        try {
            const id = Number(req.params.id);
            const ativo = req.body?.ativo;

            if (!Number.isInteger(id) || id <= 0 || typeof ativo !== 'boolean') {
                return res.status(400).json({ error: 'Informe um usuário e uma situação válidos.' });
            }

            if (id === req.usuario.id) {
                return res.status(400).json({ error: 'Você não pode alterar o próprio acesso por aqui.' });
            }

            const alvo = await consultar('SELECT id, role FROM usuarios WHERE id = ?', [id]);
            if (!alvo) return res.status(404).json({ error: 'Usuário não encontrado.' });
            if (alvo.role === 'chefe') {
                return res.status(403).json({ error: 'O perfil de administrador-chefe é protegido.' });
            }

            await executar('UPDATE usuarios SET ativo = ? WHERE id = ?', [ativo ? 1 : 0, id]);

            if (!ativo) {
                for (const [token, sessao] of sessoes.entries()) {
                    if (sessao.id === id) sessoes.delete(token);
                }
            }

            res.json({ sucesso: true, ativo });
        } catch (erro) {
            console.error('Erro ao atualizar acesso:', erro);
            res.status(500).json({ error: 'Não foi possível atualizar o acesso.' });
        }
    }
);

// Catálogos são visíveis a todos os perfis autenticados; somente o chefe os altera.
app.get('/api/catalogos', exigirLogin, async (req, res) => {
    try {
        const [salas, equipamentos] = await Promise.all([
            consultarTodos('SELECT id, nome FROM salas WHERE ativo = 1 ORDER BY nome'),
            consultarTodos('SELECT id, nome FROM equipamentos WHERE ativo = 1 ORDER BY nome')
        ]);

        res.json({ salas, equipamentos });
    } catch (erro) {
        console.error('Erro ao consultar catálogos:', erro);
        res.status(500).json({ error: 'Não foi possível carregar salas e equipamentos.' });
    }
});

app.get(
    '/api/admin/catalogos',
    exigirLogin,
    exigirPerfil('chefe'),
    async (req, res) => {
        try {
            const [salas, equipamentos] = await Promise.all([
                consultarTodos('SELECT id, nome, ativo FROM salas ORDER BY nome'),
                consultarTodos('SELECT id, nome, ativo FROM equipamentos ORDER BY nome')
            ]);

            res.json({
                salas: salas.map(item => ({ ...item, ativo: Boolean(item.ativo) })),
                equipamentos: equipamentos.map(item => ({ ...item, ativo: Boolean(item.ativo) }))
            });
        } catch (erro) {
            console.error('Erro ao listar catálogos administrativos:', erro);
            res.status(500).json({ error: 'Não foi possível listar os cadastros.' });
        }
    }
);

app.post(
    '/api/admin/catalogos/:tipo',
    exigirLogin,
    exigirPerfil('chefe'),
    async (req, res) => {
        try {
            const tabela = obterTabelaCatalogo(req.params.tipo);
            const nome = String(req.body?.nome || '').trim().replace(/\s+/g, ' ');

            if (!tabela) return res.status(404).json({ error: 'Tipo de cadastro inválido.' });
            if (nome.length < 2 || nome.length > 60) {
                return res.status(400).json({ error: 'O nome deve ter entre 2 e 60 caracteres.' });
            }

            const existente = await consultar(`SELECT id, ativo FROM ${tabela} WHERE nome = ?`, [nome]);

            if (existente?.ativo) {
                return res.status(409).json({ error: 'Essa opção já está cadastrada e ativa.' });
            }

            if (existente) {
                await executar(`UPDATE ${tabela} SET ativo = 1 WHERE id = ?`, [existente.id]);
                return res.json({ sucesso: true, mensagem: 'Opção reativada.' });
            }

            const resultado = await executar(`INSERT INTO ${tabela} (nome) VALUES (?)`, [nome]);
            res.status(201).json({ sucesso: true, item: { id: resultado.id, nome } });
        } catch (erro) {
            console.error('Erro ao criar item do catálogo:', erro);
            res.status(500).json({ error: 'Não foi possível salvar essa opção.' });
        }
    }
);

app.patch(
    '/api/admin/catalogos/:tipo/:id',
    exigirLogin,
    exigirPerfil('chefe'),
    async (req, res) => {
        try {
            const tabela = obterTabelaCatalogo(req.params.tipo);
            const id = Number(req.params.id);
            const ativo = req.body?.ativo;

            if (!tabela) return res.status(404).json({ error: 'Tipo de cadastro inválido.' });
            if (!Number.isInteger(id) || id <= 0 || typeof ativo !== 'boolean') {
                return res.status(400).json({ error: 'Informe um item e uma situação válidos.' });
            }

            const resultado = await executar(
                `UPDATE ${tabela} SET ativo = ? WHERE id = ?`,
                [ativo ? 1 : 0, id]
            );

            if (!resultado.alteracoes) return res.status(404).json({ error: 'Opção não encontrada.' });
            res.json({ sucesso: true, ativo });
        } catch (erro) {
            console.error('Erro ao atualizar catálogo:', erro);
            res.status(500).json({ error: 'Não foi possível atualizar essa opção.' });
        }
    }
);

// -----------------------------------------------------------------------------
// ÁREA DO CLIENTE: ABERTURA E CONSULTA DOS PRÓPRIOS CHAMADOS
// -----------------------------------------------------------------------------

app.post(
    '/api/cliente/chamados',
    exigirLogin,
    exigirPerfil('cliente'),
    async (req, res) => {
        try {
            const sala = String(req.body?.sala || '');
            const equipamento = String(req.body?.equipamento || '');
            const descricao = String(req.body?.descricao || '').trim();

            if (!(await validarChamado(sala, equipamento))) {
                return res.status(400).json({
                    error: 'Selecione uma sala e um equipamento válidos.'
                });
            }

            if (descricao.length > 500) {
                return res.status(400).json({
                    error: 'A descrição deve ter no máximo 500 caracteres.'
                });
            }

            const resultado = await executar(
                `INSERT INTO chamados (sala, equipamento, descricao, usuario_id)
                 VALUES (?, ?, ?, ?)`,
                [
                    sala,
                    equipamento,
                    descricao || 'Ocorrência registrada pelo portal do cliente.',
                    req.usuario.id
                ]
            );

            res.status(201).json({
                id: resultado.id,
                status: 'PENDENTE',
                mensagem: 'Ocorrência registrada com sucesso.'
            });
        } catch (erro) {
            console.error('Erro ao registrar chamado do cliente:', erro);
            res.status(500).json({ error: 'Não foi possível registrar a ocorrência.' });
        }
    }
);

app.get(
    '/api/cliente/chamados',
    exigirLogin,
    exigirPerfil('cliente'),
    async (req, res) => {
        try {
            const chamados = await consultarTodos(
                `SELECT * FROM chamados WHERE usuario_id = ? ORDER BY data DESC, id DESC`,
                [req.usuario.id]
            );

            res.json(chamados);
        } catch (erro) {
            console.error('Erro ao consultar chamados do cliente:', erro);
            res.status(500).json({ error: 'Não foi possível consultar suas ocorrências.' });
        }
    }
);

// -----------------------------------------------------------------------------
// PAINEL ADMINISTRATIVO: DASHBOARD, OCORRÊNCIAS E ATUALIZAÇÃO DE STATUS
// -----------------------------------------------------------------------------

app.get(
    '/api/chamados',
    exigirLogin,
    exigirPerfil('admin', 'chefe'),
    async (req, res) => {
        try {
            const chamados = await consultarTodos(`
                SELECT chamados.*, usuarios.nome AS solicitante
                FROM chamados
                LEFT JOIN usuarios ON usuarios.id = chamados.usuario_id
                ORDER BY chamados.data DESC, chamados.id DESC
            `);

            res.json(chamados);
        } catch (erro) {
            console.error('Erro ao listar chamados:', erro);
            res.status(500).json({ error: 'Não foi possível listar as ocorrências.' });
        }
    }
);

app.patch(
    '/api/chamados/:id',
    exigirLogin,
    exigirPerfil('admin', 'chefe'),
    async (req, res) => {
        try {
            const status = String(req.body?.status || '');

            if (!STATUS_PERMITIDOS.includes(status)) {
                return res.status(400).json({ error: 'Status inválido.' });
            }

            const resultado = await executar(
                'UPDATE chamados SET status = ? WHERE id = ?',
                [status, req.params.id]
            );

            if (!resultado.alteracoes) {
                return res.status(404).json({ error: 'Ocorrência não encontrada.' });
            }

            res.json({ updated: resultado.alteracoes });
        } catch (erro) {
            console.error('Erro ao atualizar chamado:', erro);
            res.status(500).json({ error: 'Não foi possível atualizar a ocorrência.' });
        }
    }
);

// -----------------------------------------------------------------------------
// INTEGRAÇÃO OPCIONAL COM TELEGRAM
// O endpoint só funciona quando FIXTRACK_TELEGRAM_API_KEY estiver configurada.
// -----------------------------------------------------------------------------

app.post('/api/telegram/chamados', async (req, res) => {
    const chaveConfigurada = process.env.FIXTRACK_TELEGRAM_API_KEY;
    const chaveEnviada = req.headers['x-telegram-api-key'];

    if (!chaveConfigurada || chaveEnviada !== chaveConfigurada) {
        return res.status(401).json({ error: 'Integração do Telegram não autorizada.' });
    }

    try {
        const sala = String(req.body?.sala || '');
        const equipamento = String(req.body?.equipamento || '');
        const descricao = String(req.body?.descricao || 'Aviso registrado via Bot do Telegram');

        if (!(await validarChamado(sala, equipamento))) {
            return res.status(400).json({ error: 'Sala ou equipamento inválido.' });
        }

        const resultado = await executar(
            'INSERT INTO chamados (sala, equipamento, descricao) VALUES (?, ?, ?)',
            [sala, equipamento, descricao.slice(0, 500)]
        );

        res.status(201).json({ id: resultado.id, status: 'Criado' });
    } catch (erro) {
        console.error('Erro ao registrar chamado via Telegram:', erro);
        res.status(500).json({ error: 'Não foi possível registrar o chamado.' });
    }
});

// -----------------------------------------------------------------------------
// ROTA UTILIZADA PELO ESP32 PARA VERIFICAR OCORRÊNCIAS PENDENTES
// -----------------------------------------------------------------------------

app.get('/api/status-sala/:sala', async (req, res) => {
    try {
        const sala = req.params.sala;
        const resultado = await consultar(
            `SELECT COUNT(*) AS pendentes
             FROM chamados
             WHERE sala = ? AND status IN ('PENDENTE', 'ABERTA', 'EM_ANALISE', 'EM_MANUTENCAO')`,
            [sala]
        );

        res.json({
            sala,
            tem_defeito: resultado.pendentes > 0,
            quantidade: resultado.pendentes
        });
    } catch (erro) {
        console.error('Erro ao consultar status da sala:', erro);
        res.status(500).json({ error: 'Não foi possível consultar a sala.' });
    }
});

// O servidor só começa a aceitar conexões depois que o banco estiver preparado.
inicializarBanco()
    .then(() => {
        // Publica somente os arquivos necessários à interface.
        // O banco SQLite e os arquivos internos do projeto não ficam expostos.
        app.use('/css', express.static(path.join(__dirname, 'css')));
        app.use('/js', express.static(path.join(__dirname, 'js')));
        app.use('/imagens', express.static(path.join(__dirname, 'imagens')));

        const paginas = [
            '/',
            '/login.html',
            '/index.html',
            '/ocorrencias.html',
            '/equipamentos.html',
            '/detalhes.html',
            '/relatorios.html',
            '/usuarios.html',
            '/cadastros.html',
            '/cliente.html'
        ];

        paginas.forEach(pagina => {
            const arquivo = pagina === '/' ? 'login.html' : pagina.slice(1);
            app.get(pagina, (req, res) => {
                res.sendFile(path.join(__dirname, arquivo));
            });
        });

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Servidor FixTrack rodando em http://localhost:${PORT}`);
            console.log('Conta inicial de administrador: admin');
            console.log('Conta inicial de administrador-chefe: chefe');
            console.log('As senhas padrão podem ser alteradas pelas variáveis ADMIN_PASSWORD e CHEFE_PASSWORD.');
        });
    })
    .catch(erro => {
        console.error('Não foi possível inicializar o banco de dados:', erro);
        process.exit(1);
    });
