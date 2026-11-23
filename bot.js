const TelegramBotModule = require('node-telegram-bot-api');
const TelegramBot = TelegramBotModule.default || TelegramBotModule;
const axios = require('axios');

// Configure as duas variáveis de ambiente antes de iniciar o bot.
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_KEY = process.env.FIXTRACK_TELEGRAM_API_KEY;
const API_URL = process.env.FIXTRACK_API_URL || 'http://localhost:3000';

if (!TOKEN || !API_KEY) {
    console.error(
        'Configure TELEGRAM_BOT_TOKEN e FIXTRACK_TELEGRAM_API_KEY antes de iniciar o bot.'
    );
    process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: false });
const usuarioEstado = {};

bot.on('polling_error', erro => {
    console.error('ERRO DO TELEGRAM:', erro.message);
});

bot.getMe()
    .then(me => {
        console.log('BOT CONECTADO:', me.username);
        return bot.deleteWebHook();
    })
    .then(() => {
        bot.startPolling();
        console.log('POLLING INICIADO - aguardando mensagens...');
    })
    .catch(erro => {
        console.error('ERRO AO CONECTAR BOT:', erro.message);
    });

bot.onText(/\/start/, msg => {
    const chatId = msg.chat.id;

    bot.sendMessage(
        chatId,
        '🛠️ *Sistema de Manutenção SENAI*\nSelecione o local onde ocorreu o problema:',
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '💻 Lab de Informática 01', callback_data: 'sala_LAB-01' }],
                    [{ text: '💻 Lab de Informática 02', callback_data: 'sala_LAB-02' }],
                    [{ text: '⚙️ Oficina Mecânica', callback_data: 'sala_OFICINA-01' }]
                ]
            }
        }
    );
});

bot.on('callback_query', async query => {
    const chatId = query.message.chat.id;
    const data = query.data;

    await bot.answerCallbackQuery(query.id);

    if (data.startsWith('sala_')) {
        const sala = data.replace('sala_', '');
        usuarioEstado[chatId] = { sala };

        return bot.sendMessage(
            chatId,
            `Você selecionou a sala *${sala}*. Qual equipamento está inoperante?`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🖥️ Computador / PC', callback_data: 'eq_Computador' }],
                        [{ text: '❄️ Ar Condicionado', callback_data: 'eq_Ar-Condicionado' }],
                        [{ text: '📹 Projetor', callback_data: 'eq_Projetor' }]
                    ]
                }
            }
        );
    }

    if (data.startsWith('eq_')) {
        const equipamento = data.replace('eq_', '');
        const chamado = usuarioEstado[chatId];

        if (!chamado) {
            return bot.sendMessage(chatId, 'Sessão expirada. Envie /start para reiniciar.');
        }

        try {
            await axios.post(
                `${API_URL}/api/telegram/chamados`,
                {
                    sala: chamado.sala,
                    equipamento,
                    descricao: 'Aviso registrado via Bot do Telegram'
                },
                {
                    headers: {
                        'x-telegram-api-key': API_KEY
                    }
                }
            );

            await bot.sendMessage(
                chatId,
                `✅ *Ocorrência registrada!*\n\n*Local:* ${chamado.sala}\n*Item:* ${equipamento}\n\nA equipe de manutenção foi notificada.`,
                { parse_mode: 'Markdown' }
            );

            delete usuarioEstado[chatId];
        } catch (erro) {
            console.error('Erro ao registrar ocorrência:', erro.message);
            bot.sendMessage(
                chatId,
                '❌ Não foi possível registrar a ocorrência. Confira se o servidor está rodando e se as chaves estão configuradas.'
            );
        }
    }
});
