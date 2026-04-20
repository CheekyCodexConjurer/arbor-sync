// ====================================================================
// ARQUIVO: main.js (Versão 9.1 - Correção do Shutdown Falso)
// ====================================================================

const { app, BrowserWindow, ipcMain, shell, Tray, Menu, dialog, safeStorage } = require('electron');
const { Worker } = require('worker_threads');
const path = require('path');
const fs = require('fs');
const child_process = require('child_process');
const axios = require('axios');
const log = require('electron-log');

// --- CONFIGURAÇÕES GLOBAIS ---
const BASE_API_URL = 'https://launcher.powerprofile.com.br/launcher';
const AUTH_API_URL = `${BASE_API_URL}/autenticar.php`;
const LIBERAR_SESSAO_API_URL = `${BASE_API_URL}/liberar_sessao.php`;

const PROFILE_UPDATE_API_URL = 'https://launcher.powerprofile.com.br/admin-api.php';
const VERSION_URL_BASE = `${PROFILE_UPDATE_API_URL}?action=check_launcher_version`;
const UPDATE_ZIP_URL = `${PROFILE_UPDATE_API_URL}?action=download_profile_zip`;
// --- FIM DAS CONFIGURAÇÕES ---


// --- DETECÇÃO DE PLATAFORMA ---
const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
const IS_LINUX = process.platform === 'linux';
// ---------------------------------


// --- DEFINIÇÃO DE CAMINHOS ---
const USER_DATA_PATH = app.getPath('userData');
const IS_PACKAGED = app.isPackaged;

const PROFILE_PATH = path.join(USER_DATA_PATH, 'FirefoxProfile');

let OS_SUFFIX = '';
if (IS_MAC) OS_SUFFIX = '_mac';
// (Linux usará o mesmo perfil do Windows, sem sufixo)

const LOCAL_VERSION_FILE = path.join(USER_DATA_PATH, `local_version${OS_SUFFIX}.txt`);
const CREDENCIAIS_FILE = path.join(USER_DATA_PATH, 'credenciais.json');

let FIREFOX_EXECUTABLE_PATH = null;
// ---------------------------------


log.transports.file.resolvePathFn = () => path.join(USER_DATA_PATH, 'logs/main.log');
Object.assign(console, log.functions);


let mainWindow, tray = null, sessionInterval = null, isQuitting = false, isLoggedIn = false, activeUser = null;

// ====================================================================
// FUNÇÕES DE LÓGICA (com modificações)
// ====================================================================

function findFirefoxExe() {
    if (FIREFOX_EXECUTABLE_PATH && fs.existsSync(FIREFOX_EXECUTABLE_PATH)) {
        return FIREFOX_EXECUTABLE_PATH;
    }

    let pathsTo_Check = [];

    if (IS_WIN) {
        pathsTo_Check = [
            path.join(process.env.ProgramFiles || '', 'Mozilla Firefox', 'firefox.exe'),
            path.join(process.env['ProgramFiles(x86)'] || '', 'Mozilla Firefox', 'firefox.exe'),
            path.join(process.env.LocalAppData || '', 'Programs', 'Mozilla Firefox', 'firefox.exe')
        ];
    } else if (IS_MAC) {
        pathsTo_Check = [
            '/Applications/Firefox.app/Contents/MacOS/firefox'
        ];
    } else if (IS_LINUX) {
        pathsTo_Check = [
            '/usr/bin/firefox',
            '/snap/bin/firefox',
            'firefox' 
        ];
    }

    for (const p of pathsTo_Check) {
        if (IS_LINUX && p === 'firefox') {
            try {
                const result = child_process.spawnSync('which', ['firefox']).stdout;
                if (result) {
                    const foundPath = result.toString().trim();
                    if (fs.existsSync(foundPath)) {
                        log.info(`[Firefox Check] Firefox encontrado via 'which': ${foundPath}`);
                        FIREFOX_EXECUTABLE_PATH = foundPath;
                        return foundPath;
                    }
                }
            } catch (e) {
                log.warn("[Firefox Check] 'which firefox' falhou, continuando...");
            }
        }
        
        if (fs.existsSync(p)) {
            log.info(`[Firefox Check] Firefox encontrado em: ${p}`);
            FIREFOX_EXECUTABLE_PATH = p;
            return p;
        }
    }

    log.error(`[Firefox Check] Firefox não encontrado em nenhum caminho padrão.`);
    return null;
}

async function liberarSessao(usuario) {
    if (!usuario) return;
    try {
        log.info(`Liberando sessão para o usuário: ${usuario}`);
        await axios.post(LIBERAR_SESSAO_API_URL, { usuario });
        log.info(`Sessão para ${usuario} liberada com sucesso.`);
    } catch (error) {
        log.error(`Erro ao tentar liberar a sessão para ${usuario}:`, error.message);
    }
}

async function launchApp(usuario) {
    activeUser = usuario; 

    if (!FIREFOX_EXECUTABLE_PATH) {
        log.error("Erro crítico: launchApp foi chamado sem um FIREFOX_EXECUTABLE_PATH definido.");
        dialog.showErrorBox('Erro Crítico', 'O caminho para o Firefox não foi definido. Reiniciando...');
        app.relaunch();
        app.quit();
        return;
    }
    
    let appPathToRun = FIREFOX_EXECUTABLE_PATH;
    let appArgs = ['-profile', PROFILE_PATH, '-no-remote'];

    await killFirefoxProcesses();

    log.info(`Abrindo Firefox... (Plataforma: ${process.platform})`);
    log.info(`Caminho: ${appPathToRun}`);
    log.info(`Args: ${appArgs.join(' ')}`);
    
    // ### INÍCIO DA CORREÇÃO (v9.1) ###
    // Lançamos o processo e o "soltamos" (unref).
    // NÃO ouvimos mais o evento 'close'. O launcher não deve
    // se fechar só porque este processo inicial terminou.
    // O handler 'before-quit' (ao fechar pelo tray) é quem
    // vai cuidar de matar o Firefox.
    
    const child = child_process.spawn(appPathToRun, appArgs, { 
        detached: true, 
        stdio: 'ignore' 
    });

    child.unref();
    // ### FIM DA CORREÇÃO (v9.1) ###
}

async function killFirefoxProcesses() {
    const { default: psList } = await import('ps-list');
    const procs = await psList();
    for (const p of procs) {
        if (p.name.toLowerCase().includes('firefox')) {
            try {
                process.kill(p.pid);
                log.info(`Processo Firefox (PID: ${p.pid}) finalizado.`);
            } catch (e) {}
        }
    }
}

function isNewerVersion(remote, local) {
    const rp = remote.split('.').map(Number), lp = local.split('.').map(Number);
    for (let i = 0; i < Math.max(rp.length, lp.length); i++) {
        const r = rp[i] || 0, l = lp[i] || 0;
        if (r > l) return true;
        if (r < l) return false;
    }
    return false;
}

function salvarCredenciais(usuario, senha, template_name) {
    try {
        if (!fs.existsSync(USER_DATA_PATH)) fs.mkdirSync(USER_DATA_PATH, { recursive: true });
        const bufferSenha = safeStorage.encryptString(senha);
        const credenciais = {
            usuario: usuario,
            senhaCriptografada: bufferSenha.toString('base64'),
            template_name: template_name
        };
        fs.writeFileSync(CREDENCIAIS_FILE, JSON.stringify(credenciais), 'utf-8');
        log.info(`Credenciais salvas e criptografadas (Molde: ${template_name}).`);
    } catch (e) {
        log.error("Erro ao salvar credenciais:", e);
    }
}

function carregarCredenciais() {
    try {
        if (fs.existsSync(CREDENCIAIS_FILE)) {
            const credenciais = JSON.parse(fs.readFileSync(CREDENCIAIS_FILE, 'utf-8'));
            const bufferSenha = Buffer.from(credenciais.senhaCriptografada, 'base64');
            const senha = safeStorage.decryptString(bufferSenha);
            return { 
                usuario: credenciais.usuario, 
                senha: senha,
                template: credenciais.template_name
            };
        }
    } catch (e) {
        log.error("Erro ao carregar/descriptografar credenciais:", e);
        if (fs.existsSync(CREDENCIAIS_FILE)) {
            fs.unlinkSync(CREDENCIAIS_FILE);
        }
    }
    return { usuario: null, senha: null, template: null };
}

async function checkInternetConnection() {
    try {
        await axios.get('https://www.google.com', { timeout: 5000 });
        return true;
    } catch (e) {
        return false;
    }
}

async function autenticar(usuario, senha, forcar = false, check = false) {
    if (!await checkInternetConnection()) return { success: false, message: 'internet_error' };
    try {
        const response = await axios.post(AUTH_API_URL, { usuario, senha, forcar, check });
        return response.data; 
    } catch (e) {
        log.error("Erro de autenticação:", e.message);
        return { success: false, message: 'internet_error' };
    }
}


async function checkForUpdates() {
    const { template } = carregarCredenciais();
    
    const local = fs.existsSync(LOCAL_VERSION_FILE) ? fs.readFileSync(LOCAL_VERSION_FILE, 'utf-8').trim() : "0.0.0";
    
    const molde_para_checar = (template || 'gpt1') + OS_SUFFIX;
    const VERSION_URL = `${VERSION_URL_BASE}&template=${molde_para_checar}`;
    
    log.info(`[UPDATE_CHECK] Versão local do PERFIL: ${local} (Molde: ${molde_para_checar})`);

    try {
        const res = await axios.get(VERSION_URL, { 
            timeout: 5000 
        });

        if (!res.data || !res.data.success || !res.data.version) {
            log.error(`[UPDATE_CHECK] API não retornou uma versão válida. Mensagem: ${res.data?.message || 'Resposta inválida'}`);
            return { needsUpdate: false }; 
        }

        const remote = res.data.version.trim();
        log.info(`[UPDATE_CHECK] Versão remota do PERFIL: ${remote}`);
        
        if (isNewerVersion(remote, local)) {
            log.info(`[UPDATE_CHECK] Novo perfil encontrado!`);
            return { needsUpdate: true, remoteVersion: remote };
        }
    } catch (e) {
        log.error(`[UPDATE_CHECK] Erro ao buscar versão (${VERSION_URL}): ${e.message}`);
        return { needsUpdate: false };
    }
    log.info(`[UPDATE_CHECK] Perfil local atualizado.`);
    return { needsUpdate: false };
}


async function downloadUpdate(remoteVersion) {
    createMainWindow('download.html');
    mainWindow?.webContents.on('did-finish-load', () => {
        mainWindow?.webContents.send('version-info', { version: remoteVersion });
    });

    const { usuario, senha, template } = carregarCredenciais();
    if (!usuario || !senha) {
        log.error('[DOWNLOAD] Credenciais não encontradas, abortando download.');
        dialog.showErrorBox('Erro de Atualização', 'Suas credenciais não foram encontradas. O aplicativo será iniciado com a versão atual.');
        handleSuccessfulLogin(usuario, true); 
        return;
    }

    const molde_para_baixar = (template || 'gpt1') + OS_SUFFIX;
    log.info(`[DOWNLOAD] Solicitando download do molde: ${molde_para_baixar}`);

    // =========================================================
    // ✨ NOVO: LIMPAR PERFIL ANTIGO ANTES DE BAIXAR O NOVO
    // =========================================================
    if (fs.existsSync(PROFILE_PATH)) {
        try {
            log.info(`[CLEANUP] Apagando perfil antigo em: ${PROFILE_PATH}`);
            fs.rmSync(PROFILE_PATH, { recursive: true, force: true });
            log.info(`[CLEANUP] Perfil antigo apagado com sucesso.`);
        } catch (e) {
            log.error(`[CLEANUP] Erro ao apagar o perfil antigo (${PROFILE_PATH}):`, e);
        }
    }
    // =========================================================

    try {
        const res = await axios({
            url: UPDATE_ZIP_URL,
            method: 'POST', 
            data: {
                usuario: usuario, 
                senha: senha,
                template: molde_para_baixar 
            },
            responseType: 'stream'
        });

        const total = parseInt(res.headers['content-length'], 10);
        let downloaded = 0;
        const chunks = [];
        
        res.data.on('data', c => {
            downloaded += c.length;
            chunks.push(c);
            if (total && mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('download-progress', { percentage: Math.floor((downloaded / total) * 100) });
            }
        });
        
        res.data.on('end', () => {
            mainWindow?.webContents.send('extraction-started');
            const buffer = Buffer.concat(chunks);
            
            const worker = new Worker(path.join(__dirname, 'unzip-worker.js'), {
                workerData: {
                    zipBuffer: buffer,
                    extractPath: PROFILE_PATH
                }
            });
            
            worker.on('message', (result) => {
                if (result.success) {
                    log.info(`Extração do novo perfil em ${PROFILE_PATH} concluída.`);
                    fs.writeFileSync(LOCAL_VERSION_FILE, remoteVersion, 'utf-8');
                    
                    setTimeout(() => {
                        handleSuccessfulLogin(carregarCredenciais().usuario, true);
                    }, 2000);
                } else {
                    log.error('Erro na extração via Worker:', result.error);
                    dialog.showErrorBox('Erro de Atualização', `Falha ao extrair o perfil: ${result.error}`);
                    handleSuccessfulLogin(carregarCredenciais().usuario, true);
                }
            });
            worker.on('error', (error) => {
                log.error('Erro fatal no Worker de extração:', error);
                dialog.showErrorBox('Erro Crítico de Atualização', `Ocorreu um erro inesperado: ${error.message}`);
                handleSuccessfulLogin(carregarCredenciais().usuario, true);
            });
        });
    } catch (e) {
        log.error("Erro no download:", e.message);
        if(e.response && e.response.status === 403) {
             dialog.showErrorBox('Erro de Download', `Não foi possível baixar a atualização: Credenciais inválidas. O aplicativo será iniciado com a versão atual.`);
        } else {
             dialog.showErrorBox('Erro de Download', `Não foi possível baixar a atualização: ${e.message}. O aplicativo será iniciado com a versão atual.`);
        }
        handleSuccessfulLogin(carregarCredenciais().usuario, true);
    }
}


function createTrayIcon() {
    if (tray) return;
    const iconPath = path.join(__dirname, 'icon.png'); 
    if (!fs.existsSync(iconPath)) { log.error('Ícone (icon.png) não encontrado!'); return; }
    tray = new Tray(iconPath);
    const contextMenu = Menu.buildFromTemplate([{
        label: `Status: Conectado`,
        enabled: false
    }, {
        type: 'separator'
    }, {
        label: 'Sair',
        click: () => {
            app.quit();
        }
    }]);
    tray.setToolTip('PowerProfile Launcher');
    tray.setContextMenu(contextMenu);
}

function startSessionMonitoring() {
    if (sessionInterval) clearInterval(sessionInterval);
    log.info("Iniciando monitoramento de sessão a cada 5 minutos.");
    sessionInterval = setInterval(async () => {
        log.info("Verificando status da sessão...");
        const { usuario, senha } = carregarCredenciais();
        if (!usuario || !senha) {
            app.relaunch();
            app.quit();
            return;
        }
        const authResponse = await autenticar(usuario, senha, false, true); // check: true
        if (!authResponse.success) {
            log.warn("Falha na verificação de sessão:", authResponse.message);
            clearInterval(sessionInterval);
            await killFirefoxProcesses();
            await liberarSessao(usuario);
            app.relaunch();
            app.quit();
        } else {
            log.info("Status da sessão: OK.");
        }
    }, 300000); 
}

function createMainWindow(file, width = 500, height = 600) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadFile(path.join(__dirname, file));
        if (!mainWindow.isVisible()) mainWindow.show();
        let windowHeight = (file === 'install-firefox.html') ? 640 : height;
        mainWindow.setSize(width, windowHeight);
        mainWindow.center();
    } else {
        let windowHeight = (file === 'install-firefox.html') ? 640 : height;
        
        mainWindow = new BrowserWindow({
            width,
            height: windowHeight,
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                nodeIntegrationInWorker: true
            },
            autoHideMenuBar: true,
            resizable: false,
            show: false,
            icon: path.join(__dirname, 'icon.png')
        });
        mainWindow.loadFile(path.join(__dirname, file));
        mainWindow.on('ready-to-show', () => mainWindow.show());
        mainWindow.on('closed', () => {
            mainWindow = null;
        });
    }
}

async function handleSuccessfulLogin(usuario, skipUpdateCheck = false) {

    // --- LÓGICA DE VERIFICAÇÃO UNIVERSAL ---
    if (!findFirefoxExe()) {
        log.error("Firefox não encontrado em nenhum local padrão.");
        // Mostra a tela de instalação se não encontrar
        createMainWindow('install-firefox.html'); 
        return; // Para a execução
    }
    // --- FIM DA LÓGICA DE VERIFICAÇÃO ---

    isLoggedIn = true;
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.close();
    }
    
    const startAppFlow = async () => {
        await launchApp(usuario);
        createTrayIcon();
        startSessionMonitoring();
    };

    if (skipUpdateCheck) {
        startAppFlow();
        return;
    }
    
    if (!fs.existsSync(PROFILE_PATH)) {
        fs.mkdirSync(PROFILE_PATH, { recursive: true });
    }
    
    const { needsUpdate, remoteVersion } = await checkForUpdates();
    if (needsUpdate) {
        downloadUpdate(remoteVersion);
    } else {
        startAppFlow(); 
    }
}


function setupIpcHandlers() {
    ipcMain.on('login-attempt', async (event, data) => {
        const authResponse = await autenticar(data.usuario, data.senha, false, false); // check: false
        
        const template_name = authResponse.data ? authResponse.data.template_name : 'gpt1';

        if (authResponse.message === 'internet_error') {
            createMainWindow('internet.html');
            return;
        }
        
        if (authResponse.message === 'Usuário já está com uma sessão ativa em outro dispositivo.') {
            log.info("Sessão ativa detectada. Salvando credenciais para 'force-login'.");
            salvarCredenciais(data.usuario, data.senha, template_name);
            createMainWindow('logado.html');
            return;
        }
        
        if (authResponse.message === 'Assinatura vencida.') {
            salvarCredenciais(data.usuario, data.senha, template_name);
            createMainWindow('vencimento.html');
            mainWindow?.webContents.on('did-finish-load', () => {
                mainWindow?.webContents.send('vencimento-data', { data: authResponse.vencimento });
            });
            return;
        }
        
        event.sender.send('login-response', authResponse);
        
        if (authResponse.success) {
            salvarCredenciais(data.usuario, data.senha, template_name);
            setTimeout(() => {
                handleSuccessfulLogin(data.usuario);
            }, 1500); 
        }
    });

    ipcMain.on('force-login-attempt', async () => {
        const { usuario, senha } = carregarCredenciais();
        if (usuario && senha) {
            const authResponse = await autenticar(usuario, senha, true, false); // forcar: true
            if (authResponse.success) {
                await handleSuccessfulLogin(usuario);
            } else {
                dialog.showErrorBox('Falha na Autenticação', `Não foi possível logar: ${authResponse.message}. O aplicativo será reiniciado.`);
                app.relaunch(); app.quit();
            }
        } else {
            dialog.showErrorBox('Erro Crítico', 'Credenciais não encontradas. O aplicativo será reiniciado.');
            app.relaunch(); app.quit();
        }
    });

    // Evento do botão "Tentar Novamente"
    ipcMain.on('try-again-mac-install', async () => { 
        const { usuario } = carregarCredenciais();
        await handleSuccessfulLogin(usuario, true); // Tenta de novo, pulando o update check
    });
    
    // Evento do botão "Procurar Manualmente"
    ipcMain.on('select-firefox-manually', async () => {
        log.info("Abrindo diálogo para seleção manual do Firefox...");
        
        let filters = [];
        if (IS_WIN) {
            filters = [{ name: 'Executável', extensions: ['exe'] }];
        } else if (IS_MAC) {
            filters = [{ name: 'Aplicativo', extensions: ['app'] }];
        } else {
            filters = [{ name: 'Executável', extensions: [''] }];
        }

        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
            title: 'Selecione o executável do Firefox',
            properties: ['openFile'],
            filters: filters
        });

        if (canceled || !filePaths || filePaths.length === 0) {
            log.info("Seleção manual cancelada.");
            createMainWindow('install-firefox.html');
            return;
        }

        let selectedPath = filePaths[0];
        log.info(`Usuário selecionou o caminho: ${selectedPath}`);

        if (IS_MAC && selectedPath.endsWith('.app')) {
            selectedPath = path.join(selectedPath, 'Contents/MacOS/firefox');
        }
        
        if (fs.existsSync(selectedPath)) {
            log.info(`Caminho manual validado: ${selectedPath}`);
            FIREFOX_EXECUTABLE_PATH = selectedPath; // Define o caminho global
            
            const { usuario } = carregarCredenciais();
            await handleSuccessfulLogin(usuario, true); // Tenta logar de novo
        } else {
            log.error(`Caminho manual inválido ou não encontrado: ${selectedPath}`);
            dialog.showErrorBox('Caminho Inválido', 'O arquivo selecionado não parece ser o Firefox. Tente novamente.');
            createMainWindow('install-firefox.html');
        }
    });

    ipcMain.on('recarregar-app', () => {
        app.relaunch();
        app.quit();
    });

    ipcMain.on('abrir-link-externo', (event, payload) => {
        if (payload && payload.url) {
            shell.openExternal(payload.url);
        }
    });
}

// ====================================================================
// INICIALIZAÇÃO DO APP
// ====================================================================

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

app.whenReady().then(async () => {
    setupIpcHandlers();
    
    const { usuario, senha, template } = carregarCredenciais();
    
    if (usuario && senha) {
        const authResponse = await autenticar(usuario, senha, false, false); // check: false
        
        if (authResponse.message === 'Assinatura vencida.') {
            createMainWindow('vencimento.html');
            mainWindow?.webContents.on('did-finish-load', () => {
                mainWindow?.webContents.send('vencimento-data', { data: authResponse.vencimento });
            });
            return;
        }
        if (authResponse.success) {
            const template_do_banco = authResponse.data ? authResponse.data.template_name : 'gpt1';
            if (template !== template_do_banco) {
                log.warn(`Detectada mudança de molde para ${usuario}. Atualizando de ${template} para ${template_do_banco}.`);
                salvarCredenciais(usuario, senha, template_do_banco);
            }
            
            log.info("Login automático bem-sucedido!");
            await handleSuccessfulLogin(usuario); 
            return;
        }
        if (authResponse.message === 'Usuário já está com uma sessão ativa em outro dispositivo.') {
            createMainWindow('logado.html');
            return;
        }
        log.warn("Login automático falhou:", authResponse.message);
    }
    
    createMainWindow('login.html', 500, 600);
});


app.on('window-all-closed', () => {
    if (!isLoggedIn) {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        if (isLoggedIn) {
            app.relaunch();
            app.quit();
        } else {
            createMainWindow('login.html', 500, 600);
        }
    }
});

app.on('before-quit', async (event) => {
    if (!isQuitting) {
        event.preventDefault();
        isQuitting = true;
        log.info("Iniciando processo de encerramento seguro...");
        await killFirefoxProcesses();
        await liberarSessao(activeUser);
        log.info("Encerramento seguro concluído. Fechando o app.");
        app.quit();
    }
});

process.on('SIGINT', () => {
    log.warn('Sinal SIGINT (Ctrl+C) recebido. Iniciando encerramento seguro...');
    app.quit();
});

process.on('SIGTERM', () => {
    log.warn('Sinal SIGTERM (Término) recebido. Iniciando encerramento seguro...');
    app.quit();
});