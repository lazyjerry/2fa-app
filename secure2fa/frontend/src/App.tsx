import {FormEvent, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import jsQR from 'jsqr';
import {
    Check,
    ChevronDown,
    ChevronUp,
    Copy,
    Eye,
    EyeOff,
    Lock,
    LogOut,
    Pencil,
    Pin,
    PinOff,
    Plus,
    QrCode,
    Search,
    Settings as SettingsIcon,
    Shield,
    Trash2,
    X
} from 'lucide-react';
import Select from 'react-select';
import CreatableSelect from 'react-select/creatable';
import {StylesConfig} from 'react-select';
import './App.css';
import frontendPackage from '../package.json';
import {Locale, loadLocale, saveLocale, tr} from './i18n';
import {
    AddAccount,
    AddAccountFromURI,
    ChangePassword,
    ClearClipboard,
    CopyCode,
    CreateVault,
    DeleteAccount,
    DisableBiometricUnlock,
    EnableBiometricUnlock,
    ExportVaultToFile,
    GetCodes,
    GetSetupState,
    GetSettings,
    ImportAccountsFromFile,
    ImportVaultFromFile,
    LockVault,
    MoveAccount,
    SaveSettings,
    SetAccountPinned,
    UnlockVault,
    UnlockWithBiometrics,
    UpdateAccount,
    ValidateSecret
} from '../wailsjs/go/main/App';
import {main} from '../wailsjs/go/models';

type Tab = 'codes' | 'add' | 'settings';
type SecurityMode = 'change' | 'export' | 'biometric' | null;
type AddMode = 'image' | 'uri' | 'manual';

// Touch ID 需正式簽章發布版本（簽章 + keychain entitlements）才能存取受生物驗證
// 保護的 Keychain；開發版暫時唯讀。發布版本時改為 true 即可恢復實際解鎖流程。
const biometricReleaseReady = false;

const emptyForm = {
    issuer: '',
    name: '',
    secret: '',
    category: '',
    notes: '',
    algorithm: 'SHA1',
    digits: 6,
    period: 30
};

type SelectOption = {
    label: string;
    value: string;
};

const selectStyles: StylesConfig<SelectOption, false> = {
    control: (base, state) => ({
        ...base,
        minHeight: 36,
        backgroundColor: 'transparent',
        borderColor: state.isFocused ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.25)',
        boxShadow: state.isFocused ? '0 0 0 0.25rem rgba(255, 255, 255, 0.25)' : 'none',
        borderRadius: 4,
        fontSize: '0.875rem',
        '&:hover': {
            borderColor: state.isFocused ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.25)'
        }
    }),
    valueContainer: (base) => ({
        ...base,
        padding: '0.125rem 0.75rem'
    }),
    menu: (base) => ({
        ...base,
        backgroundColor: '#1d2835',
        border: '1px solid rgba(255, 255, 255, 0.25)',
        borderRadius: 4,
        overflow: 'hidden',
        zIndex: 60
    }),
    option: (base, state) => ({
        ...base,
        backgroundColor: state.isSelected ? '#249d79' : state.isFocused ? 'rgba(36, 157, 121, 0.18)' : '#111b26',
        color: state.isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.78)',
        cursor: 'pointer'
    }),
    singleValue: (base) => ({
        ...base,
        color: 'rgba(255, 255, 255, 0.9)'
    }),
    input: (base) => ({
        ...base,
        color: 'rgba(255, 255, 255, 0.9)'
    }),
    placeholder: (base) => ({
        ...base,
        color: 'rgba(255, 255, 255, 0.42)'
    }),
    indicatorSeparator: (base) => ({
        ...base,
        backgroundColor: 'rgba(255, 255, 255, 0.25)'
    }),
    dropdownIndicator: (base) => ({
        ...base,
        color: 'rgba(255, 255, 255, 0.55)',
        '&:hover': {
            color: '#ffffff'
        }
    }),
    clearIndicator: (base) => ({
        ...base,
        color: 'rgba(255, 255, 255, 0.55)',
        '&:hover': {
            color: '#ffffff'
        }
    })
};

function App() {
    const [locale, setLocale] = useState<Locale>(() => loadLocale());
    const [setup, setSetup] = useState<main.SetupState | null>(null);
    const [unlocked, setUnlocked] = useState(false);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [codes, setCodes] = useState<main.CodeView[]>([]);
    const [settings, setSettings] = useState<main.Settings | null>(null);
    const [tab, setTab] = useState<Tab>('codes');
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('all');
    const [revealed, setRevealed] = useState<Record<string, boolean>>({});
    const [form, setForm] = useState({...emptyForm});
    const [editNote, setEditNote] = useState('');
    const [editCategory, setEditCategory] = useState('');
    const [editingAccount, setEditingAccount] = useState<main.CodeView | null>(null);
    const [uriInput, setUriInput] = useState('');
    const [addMode, setAddMode] = useState<AddMode>('image');
    const [editingID, setEditingID] = useState<string | null>(null);
    const [privacyBlur, setPrivacyBlur] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmMessage, setConfirmMessage] = useState('');
    const [securityMode, setSecurityMode] = useState<SecurityMode>(null);
    const [secCurrentPw, setSecCurrentPw] = useState('');
    const [secNewPw, setSecNewPw] = useState('');
    const [secConfirmPw, setSecConfirmPw] = useState('');
    const [secretCheck, setSecretCheck] = useState<main.SecretCheck | null>(null);
    const idleTimer = useRef<number | null>(null);
    const clipboardTimer = useRef<number | null>(null);
    const confirmResolver = useRef<((value: boolean) => void) | null>(null);
    const t = useCallback((key: string, params?: Record<string, string | number>) => tr(locale, key, params), [locale]);

    function requestConfirm(message: string) {
        setConfirmMessage(message);
        setConfirmOpen(true);
        return new Promise<boolean>((resolve) => {
            confirmResolver.current = resolve;
        });
    }

    function resolveConfirm(value: boolean) {
        confirmResolver.current?.(value);
        confirmResolver.current = null;
        setConfirmOpen(false);
        setConfirmMessage('');
    }

    const refreshSetup = useCallback(async () => {
        const state = await GetSetupState();
        setSetup(state);
        setUnlocked(state.unlocked);
    }, []);

    const refreshVault = useCallback(async () => {
        const [nextCodes, nextSettings] = await Promise.all([GetCodes(), GetSettings()]);
        setCodes(nextCodes);
        setSettings(nextSettings);
    }, []);

    useEffect(() => {
        refreshSetup().catch((err) => setError(String(err)));
    }, [refreshSetup]);

    useEffect(() => {
        saveLocale(locale);
    }, [locale]);

    useEffect(() => {
        if (!unlocked) return;
        refreshVault().catch((err) => setError(String(err)));
        const interval = window.setInterval(() => {
            GetCodes().then(setCodes).catch(() => undefined);
        }, 1000);
        return () => window.clearInterval(interval);
    }, [refreshVault, unlocked]);

    useEffect(() => {
        if (!unlocked || !settings) return;
        const reset = () => {
            if (idleTimer.current) window.clearTimeout(idleTimer.current);
            idleTimer.current = window.setTimeout(() => {
                handleLock();
            }, settings.autoLockSeconds * 1000);
        };
        reset();
        window.addEventListener('mousemove', reset);
        window.addEventListener('keydown', reset);
        window.addEventListener('focus', reset);
        return () => {
            if (idleTimer.current) window.clearTimeout(idleTimer.current);
            window.removeEventListener('mousemove', reset);
            window.removeEventListener('keydown', reset);
            window.removeEventListener('focus', reset);
        };
    }, [settings, unlocked]);

    useEffect(() => {
        const onVisibility = () => setPrivacyBlur(document.hidden);
        const onBlur = () => setPrivacyBlur(true);
        const onFocus = () => setPrivacyBlur(false);
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('blur', onBlur);
        window.addEventListener('focus', onFocus);
        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('blur', onBlur);
            window.removeEventListener('focus', onFocus);
        };
    }, []);

    async function submitAuth(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError('');
        setNotice('');
        try {
            if (!setup?.hasVault) {
                if (password !== confirmPassword) throw new Error(t('passwordMismatchError'));
                await CreateVault(password);
            } else {
                await UnlockVault(password);
            }
            setPassword('');
            setConfirmPassword('');
            setUnlocked(true);
            await refreshSetup();
            await refreshVault();
        } catch (err) {
            setError(String(err));
        }
    }

    function notifyBiometricUnavailable() {
        setNotice('');
        setError(t('touchIdUnavailableError'));
    }

    async function unlockWithTouchID() {
        setError('');
        setNotice('');
        try {
            await UnlockWithBiometrics();
            setPassword('');
            setConfirmPassword('');
            setUnlocked(true);
            await refreshSetup();
            await refreshVault();
        } catch (err) {
            setError(String(err));
        }
    }

    async function handleLock() {
        await LockVault();
        setUnlocked(false);
        setCodes([]);
        setRevealed({});
        setPassword('');
    }

    async function onSecretChange(value: string) {
        setForm((prev) => ({...prev, secret: value}));
        if (!value.trim()) {
            setSecretCheck(null);
            return;
        }
        try {
            setSecretCheck(await ValidateSecret(value));
        } catch {
            setSecretCheck(null);
        }
    }

    async function submitAccount(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError('');
        setNotice('');
        try {
            const notes = form.notes.trim();
            if (!notes) {
                setError(t('nameRequiredError'));
                return;
            }

            const isUriMode = addMode === 'uri' || addMode === 'image';
            if (isUriMode) {
                const uri = uriInput.trim();
                if (!uri) {
                    setError(t('uriRequiredError'));
                    return;
                }
                if (!uri.startsWith('otpauth://')) {
                    setError(t('uriFormatError'));
                    return;
                }
            }

            if (!(await requestConfirm(t('confirmAdd')))) return;
            if (isUriMode) {
                await AddAccountFromURI({uri: uriInput.trim(), category: form.category, notes});
                setUriInput('');
            } else {
                await AddAccount({...form, notes});
            }
            setForm({...emptyForm});
            setSecretCheck(null);
            await refreshVault();
            setTab('codes');
            setCategory('all');
            setQuery(notes);
            setNotice(t('saveSuccess'));
        } catch (err) {
            setError(String(err));
        }
    }

    async function submitEditAccount(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!editingID || !editingAccount) return;
        setError('');
        setNotice('');
        try {
            const notes = editNote.trim();
            if (!notes) {
                setError(t('nameRequiredError'));
                return;
            }
            if (!(await requestConfirm(t('confirmUpdate')))) return;
            await UpdateAccount(editingID, {
                issuer: '',
                name: '',
                secret: '',
                category: editCategory.trim(),
                notes,
                algorithm: editingAccount.algorithm,
                digits: editingAccount.digits,
                period: editingAccount.period
            });
            setEditingID(null);
            setEditingAccount(null);
            setEditNote('');
            setEditCategory('');
            await refreshVault();
            setNotice(t('updateSuccess'));
        } catch (err) {
            setError(String(err));
        }
    }

    async function importFromFile(file: File) {
        setError('');
        setNotice('');
        try {
            const uri = await extractOtpauthFromImageFile(file);
            setUriInput(uri);
            setAddMode('image');
            setNotice(t('qrReadFromImage'));
        } catch (err) {
            setError(String(err));
        }
    }

    async function importImageFromClipboard() {
        setError('');
        setNotice('');
        try {
            if (navigator.clipboard?.read) {
                const items = await navigator.clipboard.read();
                for (const item of items) {
                    const imageType = item.types.find((type) => type.startsWith('image/'));
                    if (!imageType) continue;
                    const blob = await item.getType(imageType);
                    const uri = await extractOtpauthFromImageBlob(blob);
                    setUriInput(uri);
                    setAddMode('image');
                    setNotice(t('qrReadFromClipboard'));
                    return;
                }
            }
            throw new Error(t('clipboardNoImageError'));
        } catch (err) {
            setError(String(err));
        }
    }

    async function copyCode(id: string) {
        setError('');
        setNotice('');
        try {
            await CopyCode(id);
            setNotice(t('copied'));
            if (settings?.clipboardClearSeconds) {
                // 只保留最新一次複製的計時器，避免多次複製堆疊出多個提前清空。
                // 後端 ClearClipboard 仍會再次確認剪貼簿內容才清空。
                if (clipboardTimer.current) window.clearTimeout(clipboardTimer.current);
                clipboardTimer.current = window.setTimeout(() => {
                    ClearClipboard().catch(() => undefined);
                    clipboardTimer.current = null;
                }, settings.clipboardClearSeconds * 1000);
            }
        } catch (err) {
            setError(String(err));
        }
    }

    async function removeAccount(code: main.CodeView) {
        setError('');
        if (!(await requestConfirm(t('confirmDelete', {issuer: code.issuer, name: code.name})))) return;
        await DeleteAccount(code.id);
        await refreshVault();
        setNotice(t('deleted'));
    }

    async function togglePin(code: main.CodeView) {
        setError('');
        try {
            await SetAccountPinned(code.id, !code.pinned);
            await refreshVault();
        } catch (err) {
            setError(String(err));
        }
    }

    async function moveAccount(id: string, direction: 'up' | 'down') {
        setError('');
        try {
            await MoveAccount(id, direction);
            await refreshVault();
        } catch (err) {
            setError(String(err));
        }
    }

    function beginEdit(code: main.CodeView) {
        setEditingID(code.id);
        setEditingAccount(code);
        setEditNote(code.notes);
        setEditCategory(code.category);
    }

    function closeEditModal() {
        setEditingID(null);
        setEditingAccount(null);
        setEditNote('');
        setEditCategory('');
    }

    async function saveSettings(next: main.Settings) {
        const restartRequired = settings
            ? settings.screenshotProtection !== next.screenshotProtection
            : false;
        const saved = await SaveSettings(next);
        setSettings(saved);
        setNotice(restartRequired ? t('settingsUpdatedRestart') : t('settingsUpdated'));
    }

    function openSecurity(mode: Exclude<SecurityMode, null>) {
        setError('');
        setNotice('');
        setSecCurrentPw('');
        setSecNewPw('');
        setSecConfirmPw('');
        setSecurityMode(mode);
    }

    function closeSecurity() {
        setSecurityMode(null);
        setSecCurrentPw('');
        setSecNewPw('');
        setSecConfirmPw('');
    }

    async function submitChangePassword(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError('');
        if (secNewPw !== secConfirmPw) {
            setError(t('passwordMismatchError'));
            return;
        }
        try {
            await ChangePassword(secCurrentPw, secNewPw);
            closeSecurity();
            setNotice(t('passwordChanged'));
        } catch (err) {
            setError(String(err));
        }
    }

    async function submitExport(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError('');
        try {
            const savedPath = await ExportVaultToFile(secCurrentPw);
            closeSecurity();
            if (savedPath) {
                setNotice(t('exportSaved', {path: savedPath}));
            } else {
                setNotice(t('exportCanceled'));
            }
        } catch (err) {
            setError(String(err));
        }
    }

    async function runImport() {
        setError('');
        setNotice('');
        try {
            const result = await ImportVaultFromFile();
            if (result.total === 0) {
                setNotice(t('importCanceled'));
                return;
            }
            await refreshVault();
            setNotice(t('importDone', {added: result.added, skipped: result.skipped}));
        } catch (err) {
            setError(String(err));
        }
    }

    async function runBatchImport() {
        setError('');
        setNotice('');
        try {
            const result = await ImportAccountsFromFile();
            if (result.total === 0) {
                setNotice(t('batchImportCanceled'));
                return;
            }
            await refreshVault();
            setNotice(t('batchImportDone', {added: result.added, skipped: result.skipped}));
        } catch (err) {
            setError(String(err));
        }
    }

    async function submitEnableBiometric(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError('');
        try {
            await EnableBiometricUnlock(secCurrentPw);
            closeSecurity();
            await refreshSetup();
            setNotice(t('touchIdEnabled'));
        } catch (err) {
            setError(String(err));
        }
    }

    async function disableBiometric() {
        setError('');
        setNotice('');
        try {
            await DisableBiometricUnlock();
            await refreshSetup();
            setNotice(t('touchIdDisabled'));
        } catch (err) {
            setError(String(err));
        }
    }

    const categories = useMemo(() => {
        const values = codes.map((code) => code.category).filter(Boolean);
        return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
    }, [codes]);

    const categoryOptions = useMemo<SelectOption[]>(() => {
        return categories.map((item) => ({label: item, value: item}));
    }, [categories]);

    const listCategoryOptions = useMemo<SelectOption[]>(() => {
        return [{label: t('allCategories'), value: 'all'}, ...categoryOptions];
    }, [categoryOptions, t]);

    const filteredCodes = useMemo(() => {
        const text = query.trim().toLowerCase();
        const matched = codes.filter((code) => {
            const matchCategory = category === 'all' || code.category === category;
            const matchText = !text || [code.issuer, code.name, code.category, code.notes]
                .join(' ')
                .toLowerCase()
                .includes(text);
            return matchCategory && matchText;
        });
        // 釘選優先；sort 穩定，各群組維持後端陣列順序。
        return matched.sort((a, b) => Number(b.pinned) - Number(a.pinned));
    }, [category, codes, query]);

    // 過濾或搜尋狀態下相鄰交換語意不清，僅在完整清單時開放排序。
    const canReorder = category === 'all' && !query.trim();

    const screenshotSupported = setup?.platform === 'darwin' || setup?.platform === 'windows';

    if (!setup || !unlocked) {
        return (
            <main className="auth-shell">
                <section className="auth-panel">
                    <div className="brand-row">
                        <Shield size={30}/>
                        <div>
                            <h1>Secure 2FA</h1>
                            <p>{t('appSubtitle')}</p>
                        </div>
                    </div>
                    <form onSubmit={submitAuth} className="auth-form">
                        <label>
                            <span>{t('password')}</span>
                            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)}
                                   autoComplete="current-password" minLength={8} required autoFocus/>
                        </label>
                        {!setup?.hasVault && (
                            <label>
                                <span>{t('confirmPassword')}</span>
                                <input type="password" value={confirmPassword}
                                       onChange={(event) => setConfirmPassword(event.target.value)}
                                       autoComplete="new-password" minLength={8} required/>
                            </label>
                        )}
                        <button className="primary-action" type="submit">
                            <Lock size={17}/>
                            {setup?.hasVault ? t('unlock') : t('createVault')}
                        </button>
                        {setup?.hasVault && biometricReleaseReady && setup.biometricAvailable && setup.biometricEnrolled && (
                            <button type="button"
                                    className="plain-action biometric-unlock"
                                    onClick={unlockWithTouchID}>
                                {t('touchIdUnlock')}
                            </button>
                        )}
                    </form>
                    <div className="security-list">
                        <span>{t('osUserIsolation')}：{setup?.osUserScoped ? t('enabled') : t('disabled')}</span>
                        <span>{t('screenshotProtection')}：{setup?.screenshotProtection ? t('platformSupported') : t('platformUnsupported')}</span>
                    </div>
                    {error && <p className="error-line">{cleanError(error)}</p>}
                </section>
            </main>
        );
    }

    return (
        <main className={`app-shell ${privacyBlur ? 'privacy-blur' : ''}`}>
            <aside className="sidebar">
                <div className="brand-row compact">
                    <Shield size={25}/>
                    <div>
                        <strong>Secure 2FA</strong>
                        <span className="brand-version">{frontendPackage.version}</span>
                    </div>
                </div>
                <nav className="nav-stack">
                    <button className={tab === 'codes' ? 'active' : ''} onClick={() => setTab('codes')}>
                        <QrCode size={18}/> {t('tabCodes')}
                    </button>
                    <button className={tab === 'add' ? 'active' : ''} onClick={() => setTab('add')}>
                        <Plus size={18}/> {t('tabAdd')}
                    </button>
                    <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>
                        <SettingsIcon size={18}/> {t('tabSettings')}
                    </button>
                </nav>
                <button className="plain-action lock-action" onClick={handleLock}>
                    <LogOut size={17}/> {t('lock')}
                </button>
            </aside>

            <section className="content">
                {tab === 'codes' && (
                    <>
                        <header className="toolbar">
                            <div className="search-box">
                                <Search size={18}/>
                                <input value={query} onChange={(event) => setQuery(event.target.value)}
                                       placeholder={t('searchPlaceholder')}/>
                            </div>
                            <Select
                                options={listCategoryOptions}
                                value={listCategoryOptions.find((item) => item.value === category) ?? listCategoryOptions[0]}
                                onChange={(option) => setCategory(option?.value ?? 'all')}
                                styles={selectStyles}
                                className="select-control"
                                classNamePrefix="select"
                                isSearchable={false}
                            />
                        </header>

                        <section className="codes-view">
                            <section className="code-grid">
                                {filteredCodes.map((code) => {
                                    const isVisible = revealed[code.id] || !settings?.maskCodes;
                                    return (
                                        <article className={code.pinned ? 'code-row pinned' : 'code-row'} key={code.id}>
                                            <div className="row-identity">
                                                <div className="row-title">
                                                    {code.pinned && <Pin size={14} className="pin-mark"/>}
                                                    <strong>{code.notes || t('notFilled')}</strong>
                                                    <span>{code.issuer}</span>
                                                </div>
                                                <div className="row-note">
                                                    <span className="row-note-label">{t('accountName')}</span>
                                                    <span className="row-note-value">{code.name || t('notFilled')}</span>
                                                    <div className="row-meta">
                                                        <span>{code.category || t('uncategorized')}</span>
                                                    </div>
                                                </div>
                                                
                                            </div>

                                            <div className="row-otp-wrap">
                                                <span className={isVisible ? 'otp-code row-otp-code' : 'otp-code row-otp-code masked'}>
                                                    {isVisible ? groupCode(code.code) : '••• •••'}
                                                </span>
                                                <span className={`timer ${code.timeRemaining <= 5 ? 'timer-danger' : code.timeRemaining <= 10 ? 'timer-warn' : ''}`}>
                                                    {code.timeRemaining}s
                                                </span>
                                            </div>

                                            <div className="row-actions">
                                                <div className="otp-actions">
                                                    <button className="icon-action"
                                                            onClick={() => copyCode(code.id)}
                                                            title={t('copiedTitle')}>
                                                        <Copy size={18}/>
                                                    </button>
                                                    <button className="icon-action"
                                                            onClick={() => setRevealed({...revealed, [code.id]: !revealed[code.id]})}
                                                            title={isVisible ? t('hideCodeTitle') : t('showCodeTitle')}>
                                                        {isVisible ? <EyeOff size={18}/> : <Eye size={18}/>}
                                                    </button>
                                                </div>

                                                <button className="icon-action pin-action"
                                                        onClick={() => togglePin(code)}
                                                        title={code.pinned ? t('unpinTitle') : t('pinTitle')}>
                                                    {code.pinned ? <PinOff size={18}/> : <Pin size={18}/>}
                                                </button>
                                                {canReorder && (
                                                    <>
                                                        <button className="icon-action reorder-action" onClick={() => moveAccount(code.id, 'up')} title={t('moveUpTitle')}>
                                                            <ChevronUp size={18}/>
                                                        </button>
                                                        <button className="icon-action reorder-action" onClick={() => moveAccount(code.id, 'down')} title={t('moveDownTitle')}>
                                                            <ChevronDown size={18}/>
                                                        </button>
                                                    </>
                                                )}
                                                <button className="icon-action" onClick={() => beginEdit(code)} title={t('editTitle')}>
                                                    <Pencil size={18}/>
                                                </button>
                                                <button className="icon-action danger-icon" onClick={() => removeAccount(code)} title={t('deleteTitle')}>
                                                    <Trash2 size={18}/>
                                                </button>
                                            </div>
                                        </article>
                                    );
                                })}
                                {filteredCodes.length === 0 && <div className="empty-state">{t('emptyCodes')}</div>}
                            </section>
                        </section>
                    </>
                )}

                {tab === 'add' && (
                    <section className="add-view">
                            <form className="account-form add-form" onSubmit={submitAccount}>
                                <div className="segmented">
                                    <button type="button" className={addMode === 'image' ? 'active' : ''}
                                        onClick={() => setAddMode('image')}>{t('modeImage')}
                                    </button>
                                    <button type="button" className={addMode === 'uri' ? 'active' : ''}
                                        onClick={() => setAddMode('uri')}>{t('modeUri')}
                                    </button>
                                    <button type="button" className={addMode === 'manual' ? 'active' : ''}
                                        onClick={() => setAddMode('manual')}>{t('modeManual')}
                                    </button>
                                </div>
                                <div className="form-grid">
                                    <label className="wide">
                                    <span>{t('requiredName')} <span className="required-mark">*</span></span>
                                        <input value={form.notes}
                                               className={!form.notes.trim() ? 'field-missing' : ''}
                                               required
                                                 placeholder={t('requiredName')}
                                               onChange={(event) => setForm({...form, notes: event.target.value})}/>
                                    </label>
                                    <label>
                                        <span>{t('category')}</span>
                                        <CreatableSelect
                                            options={categoryOptions}
                                            value={form.category ? {label: form.category, value: form.category} : null}
                                            onChange={(option) => setForm({...form, category: option?.value ?? ''})}
                                            onCreateOption={(value) => setForm({...form, category: value.trim()})}
                                            placeholder="Work / Personal"
                                            styles={selectStyles}
                                            className="select-control"
                                            classNamePrefix="select"
                                            isClearable
                                        />
                                    </label>
                                    {addMode === 'image' ? (
                                        <>
                                            <label className="wide">
                                                <span>{t('qrResult')}</span>
                                                <textarea
                                                    value={uriInput}
                                                    readOnly
                                                    onPaste={async (event) => {
                                                        const imageItem = Array.from(event.clipboardData.items)
                                                            .find((item) => item.type.startsWith('image/'));
                                                        event.preventDefault();
                                                        if (!imageItem) {
                                                            setError(t('imageModePasteOnlyImage'));
                                                            return;
                                                        }
                                                        const file = imageItem.getAsFile();
                                                        if (!file) return;
                                                        await importFromFile(file);
                                                    }}
                                                    placeholder={t('qrPlaceholder')}
                                                />
                                            </label>
                                            <input
                                                className="file-browser-input wide"
                                                type="file"
                                                accept="image/*"
                                                onChange={async (event) => {
                                                    const file = event.target.files?.[0];
                                                    if (!file) return;
                                                    await importFromFile(file);
                                                    event.target.value = '';
                                                }}
                                            />
                                            <div className="form-actions wide">
                                                <button
                                                    type="button"
                                                    className="plain-action"
                                                    onClick={importImageFromClipboard}
                                                >
                                                    {t('importFromClipboard')}
                                                </button>
                                            </div>
                                        </>
                                    ) : addMode === 'uri' ? (
                                        <label className="wide">
                                            <span>{t('otpUri')}</span>
                                            <textarea
                                                value={uriInput}
                                                onChange={(event) => setUriInput(event.target.value)}
                                                placeholder={t('uriPlaceholder')}
                                            />
                                        </label>
                                    ) : (
                                        <>
                                            <label>
                                                <span>{t('serviceName')}</span>
                                                <input value={form.issuer}
                                                       onChange={(event) => setForm({...form, issuer: event.target.value})}
                                                       required/>
                                            </label>
                                            <label>
                                                <span>{t('accountLabel')}</span>
                                                <input value={form.name}
                                                       onChange={(event) => setForm({...form, name: event.target.value})}
                                                       required/>
                                            </label>
                                            <label className="wide">
                                                <span>Secret</span>
                                                <input value={form.secret}
                                                       className={secretCheck && !secretCheck.empty && !secretCheck.valid ? 'field-missing' : ''}
                                                       onChange={(event) => onSecretChange(event.target.value)}
                                                       required/>
                                                {secretCheck && !secretCheck.empty && (
                                                    <small className={secretCheck.valid ? (secretCheck.duplicate ? 'secret-hint warn' : 'secret-hint ok') : 'secret-hint err'}>
                                                        {!secretCheck.valid
                                                            ? '密鑰格式不正確，需為 Base32。'
                                                            : secretCheck.duplicate
                                                                ? `已有相同密鑰的帳號：${secretCheck.duplicateLabel}`
                                                                : '密鑰格式正確。'}
                                                    </small>
                                                )}
                                            </label>
                                            <label>
                                                <span>演算法</span>
                                                <Select
                                                    options={[
                                                        {label: 'SHA1', value: 'SHA1'},
                                                        {label: 'SHA256', value: 'SHA256'},
                                                        {label: 'SHA512', value: 'SHA512'}
                                                    ]}
                                                    value={{label: form.algorithm, value: form.algorithm}}
                                                    onChange={(option) => setForm({...form, algorithm: option?.value ?? 'SHA1'})}
                                                    styles={selectStyles}
                                                    className="select-control"
                                                    classNamePrefix="select"
                                                    isSearchable={false}
                                                />
                                            </label>
                                            <label>
                                                <span>位數</span>
                                                <Select
                                                    options={[
                                                        {label: '6', value: '6'},
                                                        {label: '8', value: '8'}
                                                    ]}
                                                    value={{label: String(form.digits), value: String(form.digits)}}
                                                    onChange={(option) => setForm({...form, digits: Number(option?.value ?? '6')})}
                                                    styles={selectStyles}
                                                    className="select-control"
                                                    classNamePrefix="select"
                                                    isSearchable={false}
                                                />
                                            </label>
                                        </>
                                    )}
                                </div>
                                <div className="form-actions">
                                    <button className="primary-action" type="submit">
                                        <Plus size={17}/>
                                        {t('addButton')}
                                    </button>
                                </div>
                            </form>
                    </section>
                )}

                {tab === 'settings' && settings && (
                    <section className="settings-view">
                        <h1>{t('settingsTitle')}</h1>
                        <div className="setting-row">
                            <div>
                                <strong>{t('language')}</strong>
                                <span>{t('languageHint')}</span>
                            </div>
                            <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
                                <option value="zh-TW">{t('langZhTW')}</option>
                                <option value="en">{t('langEn')}</option>
                            </select>
                        </div>
                        <div className="setting-row">
                            <div>
                                <strong>預設遮蔽驗證碼</strong>
                                <span>卡片上需手動顯示，降低旁人或錄影取得內容的機率。</span>
                            </div>
                            <input type="checkbox" checked={settings.maskCodes}
                                   onChange={(event) => saveSettings({...settings, maskCodes: event.target.checked})}/>
                        </div>
                        <div className="setting-row">
                            <div>
                                <strong>自動鎖定</strong>
                                <span>閒置後鎖定 vault。</span>
                            </div>
                            <div className="setting-input-with-unit">
                                <input type="number" min={30} max={3600} value={settings.autoLockSeconds}
                                       onChange={(event) => saveSettings({...settings, autoLockSeconds: Number(event.target.value)})}/>
                                <span>秒</span>
                            </div>
                        </div>
                        <div className="setting-row">
                            <div>
                                <strong>清空剪貼簿</strong>
                                <span>複製驗證碼後幾秒清空，設為 0 可停用。</span>
                            </div>
                            <div className="setting-input-with-unit">
                                <input type="number" min={0} max={300} value={settings.clipboardClearSeconds}
                                       onChange={(event) => saveSettings({...settings, clipboardClearSeconds: Number(event.target.value)})}/>
                                <span>秒</span>
                            </div>
                        </div>
                        <div className="setting-row">
                            <div>
                                <strong>平台截圖防護</strong>
                                <span>{screenshotSupported ? `目前啟動狀態：${setup.screenshotProtection ? '已啟用' : '已停用'}。切換後需重啟 APP 生效。` : '此平台不支援。'}</span>
                            </div>
                            <input type="checkbox" checked={settings.screenshotProtection}
                                   onChange={(event) => saveSettings({...settings, screenshotProtection: event.target.checked})}
                                   disabled={!screenshotSupported}/>
                        </div>
                        <div className="setting-row">
                            <div>
                                <strong>Touch ID 解鎖</strong>
                                <span>{biometricReleaseReady ? setup.biometricDescription : '需正式簽章發布版本（簽章 + keychain entitlements）才能使用，開發版暫停用。'}</span>
                            </div>
                            {!biometricReleaseReady ? (
                                <button className="plain-action readonly-action" title="需正式發布版本才能使用"
                                        onClick={notifyBiometricUnavailable}>啟用</button>
                            ) : !setup.biometricAvailable ? (
                                <span className="pill">未支援</span>
                            ) : setup.biometricEnrolled ? (
                                <button className="plain-action" onClick={disableBiometric}>停用</button>
                            ) : (
                                <button className="plain-action" onClick={() => openSecurity('biometric')}>啟用</button>
                            )}
                        </div>
                        <div className="setting-row">
                            <div>
                                <strong>資料目錄</strong>
                                <span>{setup.userDataPath}</span>
                            </div>
                            <span className="pill">OS user scoped</span>
                        </div>
                        <div className="setting-row">
                            <div>
                                <strong>主密碼</strong>
                                <span>變更主密碼會以新密碼重新加密整個 vault。</span>
                            </div>
                            <button className="plain-action" onClick={() => openSecurity('change')}>變更</button>
                        </div>
                        <div className="setting-row">
                            <div>
                                <strong>{t('backupAndRestore')}</strong>
                                <span>{t('backupAndRestoreHint')}</span>
                            </div>
                            <div className="setting-actions">
                                <button className="plain-action" onClick={() => openSecurity('export')}>{t('export')}</button>
                                <button className="plain-action" onClick={runImport}>{t('import')}</button>
                            </div>
                        </div>
                        <div className="setting-row">
                            <div>
                                <strong>{t('batchImportTitle')}</strong>
                                <span>{t('batchImportHint')}</span>
                            </div>
                            <button className="plain-action" onClick={runBatchImport}>{t('batchImport')}</button>
                        </div>
                    </section>
                )}
                {securityMode === 'change' && (
                    <div className="modal-backdrop">
                        <section className="confirm-modal">
                            <h2>變更主密碼</h2>
                            <form className="account-form" onSubmit={submitChangePassword}>
                                <label>
                                    <span>目前主密碼</span>
                                    <input type="password" value={secCurrentPw} autoFocus
                                           onChange={(event) => setSecCurrentPw(event.target.value)} required/>
                                </label>
                                <label>
                                    <span>新主密碼（至少 8 個字元）</span>
                                    <input type="password" value={secNewPw}
                                           onChange={(event) => setSecNewPw(event.target.value)} required/>
                                </label>
                                <label>
                                    <span>再次輸入新主密碼</span>
                                    <input type="password" value={secConfirmPw}
                                           onChange={(event) => setSecConfirmPw(event.target.value)} required/>
                                </label>
                                <div className="form-actions">
                                    <button type="button" className="plain-action" onClick={closeSecurity}>取消</button>
                                    <button type="submit" className="primary-action">變更</button>
                                </div>
                            </form>
                        </section>
                    </div>
                )}
                {securityMode === 'export' && (
                    <div className="modal-backdrop">
                        <section className="confirm-modal">
                            <h2>匯出備份</h2>
                            <p>請再次輸入主密碼以確認身分。匯出檔為<strong>未加密的明文 JSON</strong>，內含所有帳號的 TOTP secret，請妥善保管並用完即刪。</p>
                            <form className="account-form" onSubmit={submitExport}>
                                <label>
                                    <span>主密碼</span>
                                    <input type="password" value={secCurrentPw} autoFocus
                                           onChange={(event) => setSecCurrentPw(event.target.value)} required/>
                                </label>
                                <div className="form-actions">
                                    <button type="button" className="plain-action" onClick={closeSecurity}>取消</button>
                                    <button type="submit" className="primary-action">匯出</button>
                                </div>
                            </form>
                        </section>
                    </div>
                )}
                {securityMode === 'biometric' && (
                    <div className="modal-backdrop">
                        <section className="confirm-modal">
                            <h2>啟用 Touch ID 解鎖</h2>
                            <p>輸入主密碼以授權；主密碼將存入受 Touch ID 保護的 macOS Keychain。</p>
                            <form className="account-form" onSubmit={submitEnableBiometric}>
                                <label>
                                    <span>主密碼</span>
                                    <input type="password" value={secCurrentPw} autoFocus
                                           onChange={(event) => setSecCurrentPw(event.target.value)} required/>
                                </label>
                                <div className="form-actions">
                                    <button type="button" className="plain-action" onClick={closeSecurity}>取消</button>
                                    <button type="submit" className="primary-action">啟用</button>
                                </div>
                            </form>
                        </section>
                    </div>
                )}
                {editingID && (
                    <div className="modal-backdrop">
                        <section className="edit-modal">
                            <div className="card-head">
                                <div>
                                    <h2>編輯驗證碼</h2>
                                    <p>{editingAccount ? `${editingAccount.issuer} / ${editingAccount.name}` : ''}</p>
                                </div>
                                <button className="icon-action" onClick={closeEditModal} title="關閉">
                                    <X size={19}/>
                                </button>
                            </div>
                            <form className="account-form" onSubmit={submitEditAccount}>
                                <div className="form-grid edit-note-grid">
                                    <label>
                                        <span>分類</span>
                                        <CreatableSelect
                                            options={categoryOptions}
                                            value={editCategory ? {label: editCategory, value: editCategory} : null}
                                            onChange={(option) => setEditCategory(option?.value ?? '')}
                                            onCreateOption={(value) => setEditCategory(value.trim())}
                                            placeholder="Work / Personal"
                                            styles={selectStyles}
                                            className="select-control"
                                            classNamePrefix="select"
                                            isClearable
                                        />
                                    </label>
                                    <label className="wide">
                                        <span>名稱 <span className="required-mark">*</span></span>
                                        <input
                                            value={editNote}
                                            className={!editNote.trim() ? 'field-missing' : ''}
                                            onChange={(event) => setEditNote(event.target.value)}
                                            required
                                        />
                                    </label>
                                </div>
                                <div className="form-actions">
                                    <button type="button" className="plain-action" onClick={closeEditModal}>
                                        <X size={16}/> {t('cancel')}
                                    </button>
                                    <button className="primary-action" type="submit">
                                        <Check size={17}/> {t('update')}
                                    </button>
                                </div>
                            </form>
                        </section>
                    </div>
                )}
                {confirmOpen && (
                    <div className="modal-backdrop">
                        <section className="confirm-modal">
                            <h2>{t('confirmAction')}</h2>
                            <p>{confirmMessage}</p>
                            <div className="form-actions">
                                <button type="button" className="plain-action" onClick={() => resolveConfirm(false)}>
                                    {t('cancel')}
                                </button>
                                <button type="button" className="primary-action" onClick={() => resolveConfirm(true)}>
                                    {t('confirm')}
                                </button>
                            </div>
                        </section>
                    </div>
                )}
                {(error || notice) && (
                    <div className={error ? 'toast error-toast' : 'toast'}>
                        {error ? cleanError(error) : notice}
                    </div>
                )}
            </section>
        </main>
    );
}

export async function extractOtpauthFromImageFile(file: File) {
    return extractOtpauthFromImageBlob(file);
}

export async function extractOtpauthFromImageBlob(blob: Blob) {
    const bitmap = await createImageBitmap(blob);
    try {
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d', {willReadFrequently: true});
        if (!context) {
            throw new Error('無法建立影像解析器');
        }
        context.drawImage(bitmap, 0, 0);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (!code?.data?.startsWith('otpauth://')) {
            throw new Error('圖片中找不到有效的 otpauth QRCode');
        }
        return code.data;
    } finally {
        bitmap.close();
    }
}

export function groupCode(code: string) {
    return code.replace(/(.{3})/g, '$1 ').trim();
}

export function cleanError(value: string) {
    return value.replace(/^Error:\s*/, '').replace(/^main\.App\./, '');
}

export default App;
