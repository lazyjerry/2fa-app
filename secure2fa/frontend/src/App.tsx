import {FormEvent, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import jsQR from 'jsqr';
import {
    Camera,
    Check,
    Copy,
    Eye,
    EyeOff,
    Lock,
    LogOut,
    Pencil,
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
import {
    AddAccount,
    AddAccountFromURI,
    ClearClipboard,
    CopyCode,
    CreateVault,
    DeleteAccount,
    GetCodes,
    GetSetupState,
    GetSettings,
    LockVault,
    SaveSettings,
    UnlockVault,
    UpdateAccount
} from '../wailsjs/go/main/App';
import {main} from '../wailsjs/go/models';

type Tab = 'codes' | 'add' | 'settings';
type AddMode = 'image' | 'uri' | 'camera' | 'manual';

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
        minHeight: 40,
        backgroundColor: 'rgba(9, 17, 27, 0.82)',
        borderColor: state.isFocused ? '#249d79' : 'rgba(255, 255, 255, 0.18)',
        boxShadow: state.isFocused ? '0 0 0 1px rgba(36, 157, 121, 0.55), inset 0 0 24px rgba(36, 157, 121, 0.08)' : 'inset 0 0 18px rgba(255, 255, 255, 0.03)',
        borderRadius: 0,
        '&:hover': {
            borderColor: state.isFocused ? '#249d79' : 'rgba(255, 255, 255, 0.32)'
        }
    }),
    menu: (base) => ({
        ...base,
        backgroundColor: '#111b26',
        border: '1px solid rgba(255, 255, 255, 0.25)',
        borderRadius: 0,
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
        backgroundColor: 'rgba(255, 255, 255, 0.18)'
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
    const [cameraOpen, setCameraOpen] = useState(false);
    const [privacyBlur, setPrivacyBlur] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmMessage, setConfirmMessage] = useState('');
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const idleTimer = useRef<number | null>(null);
    const confirmResolver = useRef<((value: boolean) => void) | null>(null);

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
                if (password !== confirmPassword) throw new Error('兩次密碼不一致');
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

    async function handleLock() {
        await LockVault();
        setUnlocked(false);
        setCodes([]);
        setRevealed({});
        setPassword('');
    }

    async function submitAccount(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError('');
        setNotice('');
        try {
            const notes = form.notes.trim();
            if (!notes) {
                setError('名稱為必填');
                return;
            }

            const isUriMode = addMode === 'uri' || addMode === 'image' || addMode === 'camera';
            if (isUriMode) {
                const uri = uriInput.trim();
                if (!uri) {
                    setError('請先提供 otpauth URI 或先完成 QRCode 掃描');
                    return;
                }
                if (!uri.startsWith('otpauth://')) {
                    setError('URI 格式錯誤，必須以 otpauth:// 開頭');
                    return;
                }
            }

            if (!(await requestConfirm('確認要新增這筆驗證碼嗎？'))) return;
            if (isUriMode) {
                await AddAccountFromURI({uri: uriInput.trim(), category: form.category, notes});
                setUriInput('');
            } else {
                await AddAccount({...form, notes});
            }
            setForm({...emptyForm});
            await refreshVault();
            setTab('codes');
            setCategory('all');
            setQuery(notes);
            setNotice('已儲存');
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
                setError('名稱為必填');
                return;
            }
            if (!(await requestConfirm('確認要更新這筆驗證碼分類與名稱嗎？'))) return;
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
            setNotice('已更新');
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
            setNotice('已從圖片讀取 QRCode');
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
                    setNotice('已從剪貼簿圖片讀取 QRCode');
                    return;
                }
            }
            throw new Error('剪貼簿中沒有可用的 QRCode 圖片');
        } catch (err) {
            setError(String(err));
        }
    }

    async function copyCode(id: string) {
        setError('');
        setNotice('');
        try {
            await CopyCode(id);
            setNotice('驗證碼已複製');
            if (settings?.clipboardClearSeconds) {
                window.setTimeout(() => {
                    ClearClipboard().catch(() => undefined);
                }, settings.clipboardClearSeconds * 1000);
            }
        } catch (err) {
            setError(String(err));
        }
    }

    async function removeAccount(code: main.CodeView) {
        setError('');
        if (!(await requestConfirm(`確認要刪除 ${code.issuer} / ${code.name} 嗎？`))) return;
        await DeleteAccount(code.id);
        await refreshVault();
        setNotice('已刪除');
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
        setNotice(restartRequired ? '設定已更新，請重新啟動 APP 套用截圖防護變更。' : '設定已更新');
    }

    const categories = useMemo(() => {
        const values = codes.map((code) => code.category).filter(Boolean);
        return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
    }, [codes]);

    const categoryOptions = useMemo<SelectOption[]>(() => {
        return categories.map((item) => ({label: item, value: item}));
    }, [categories]);

    const listCategoryOptions = useMemo<SelectOption[]>(() => {
        return [{label: '全部分類', value: 'all'}, ...categoryOptions];
    }, [categoryOptions]);

    const filteredCodes = useMemo(() => {
        const text = query.trim().toLowerCase();
        return codes.filter((code) => {
            const matchCategory = category === 'all' || code.category === category;
            const matchText = !text || [code.issuer, code.name, code.category, code.notes]
                .join(' ')
                .toLowerCase()
                .includes(text);
            return matchCategory && matchText;
        });
    }, [category, codes, query]);

    const screenshotSupported = setup?.platform === 'darwin' || setup?.platform === 'windows';

    if (!setup || !unlocked) {
        return (
            <main className="auth-shell">
                <section className="auth-panel">
                    <div className="brand-row">
                        <Shield size={30}/>
                        <div>
                            <h1>Secure 2FA</h1>
                            <p>離線驗證碼保險庫</p>
                        </div>
                    </div>
                    <form onSubmit={submitAuth} className="auth-form">
                        <label>
                            <span>主密碼</span>
                            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)}
                                   autoComplete="current-password" minLength={8} required autoFocus/>
                        </label>
                        {!setup?.hasVault && (
                            <label>
                                <span>確認主密碼</span>
                                <input type="password" value={confirmPassword}
                                       onChange={(event) => setConfirmPassword(event.target.value)}
                                       autoComplete="new-password" minLength={8} required/>
                            </label>
                        )}
                        <button className="primary-action" type="submit">
                            <Lock size={17}/>
                            {setup?.hasVault ? '解鎖' : '建立保險庫'}
                        </button>
                    </form>
                    <div className="security-list">
                        <span>OS 使用者隔離：{setup?.osUserScoped ? '啟用' : '未啟用'}</span>
                        <span>截圖防護：{setup?.screenshotProtection ? '平台支援' : '平台不支援'}</span>
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
                        <span>{setup.platform}</span>
                    </div>
                </div>
                <nav className="nav-stack">
                    <button className={tab === 'codes' ? 'active' : ''} onClick={() => setTab('codes')}>
                        <QrCode size={18}/> 驗證碼
                    </button>
                    <button className={tab === 'add' ? 'active' : ''} onClick={() => setTab('add')}>
                        <Plus size={18}/> 新增
                    </button>
                    <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>
                        <SettingsIcon size={18}/> 設定
                    </button>
                </nav>
                <button className="plain-action lock-action" onClick={handleLock}>
                    <LogOut size={17}/> 鎖定
                </button>
            </aside>

            <section className="content">
                {tab === 'codes' && (
                    <>
                        <header className="toolbar">
                            <div className="search-box">
                                <Search size={18}/>
                                <input value={query} onChange={(event) => setQuery(event.target.value)}
                                       placeholder="搜尋 issuer、帳號、分類、名稱"/>
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
                                        <article className="code-row" key={code.id}>
                                            <div className="row-identity">
                                                <div className="row-title">
                                                    <strong>{code.issuer}</strong>
                                                    <span>{code.name}</span>
                                                </div>
                                                <div className="row-meta">
                                                    <span>{code.category || '未分類'}</span>
                                                    <span>{code.algorithm} / {code.digits}</span>
                                                </div>
                                                <div className="row-note">
                                                    <span className="row-note-label">名稱</span>
                                                    <span className="row-note-value">{code.notes || '未填寫'}</span>
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
                                                            title="複製驗證碼">
                                                        <Copy size={18}/>
                                                    </button>
                                                    <button className="icon-action"
                                                            onClick={() => setRevealed({...revealed, [code.id]: !revealed[code.id]})}
                                                            title={isVisible ? '隱藏驗證碼' : '顯示驗證碼'}>
                                                        {isVisible ? <EyeOff size={18}/> : <Eye size={18}/>}
                                                    </button>
                                                </div>

                                                <button className="icon-action" onClick={() => beginEdit(code)} title="編輯">
                                                    <Pencil size={18}/>
                                                </button>
                                                <button className="icon-action danger-icon" onClick={() => removeAccount(code)} title="刪除">
                                                    <Trash2 size={18}/>
                                                </button>
                                            </div>
                                        </article>
                                    );
                                })}
                                {filteredCodes.length === 0 && <div className="empty-state">沒有符合條件的驗證碼</div>}
                            </section>
                        </section>
                    </>
                )}

                {tab === 'add' && (
                    <section className="add-view">
                            <form className="account-form add-form" onSubmit={submitAccount}>
                                <div className="segmented">
                                    <button type="button" className={addMode === 'image' ? 'active' : ''}
                                            onClick={() => setAddMode('image')}>圖片
                                    </button>
                                    <button type="button" className={addMode === 'uri' ? 'active' : ''}
                                            onClick={() => setAddMode('uri')}>URI
                                    </button>
                                    <button type="button" className={addMode === 'camera' ? 'active' : ''}
                                            onClick={() => {
                                                setAddMode('camera');
                                                setCameraOpen(true);
                                            }}>
                                        鏡頭
                                    </button>
                                    <button type="button" className={addMode === 'manual' ? 'active' : ''}
                                            onClick={() => setAddMode('manual')}>手動
                                    </button>
                                </div>
                                <div className="form-grid">
                                    <label className="wide">
                                        <span>名稱 <span className="required-mark">*</span></span>
                                        <input value={form.notes}
                                               className={!form.notes.trim() ? 'field-missing' : ''}
                                               required
                                               placeholder="請先輸入名稱"
                                               onChange={(event) => setForm({...form, notes: event.target.value})}/>
                                    </label>
                                    <label>
                                        <span>分類</span>
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
                                                <span>QRCode 解析結果（otpauth URI）</span>
                                                <textarea
                                                    value={uriInput}
                                                    readOnly
                                                    onPaste={async (event) => {
                                                        const imageItem = Array.from(event.clipboardData.items)
                                                            .find((item) => item.type.startsWith('image/'));
                                                        event.preventDefault();
                                                        if (!imageItem) {
                                                            setError('圖片模式只支援貼上圖片，文字請改用 URI 模式');
                                                            return;
                                                        }
                                                        const file = imageItem.getAsFile();
                                                        if (!file) return;
                                                        await importFromFile(file);
                                                    }}
                                                    placeholder="先上傳圖片或直接貼上 QRCode 圖片"
                                                />
                                            </label>
                                            <div className="form-actions wide">
                                                <input
                                                    ref={fileInputRef}
                                                    type="file"
                                                    accept="image/*"
                                                    hidden
                                                    onChange={async (event) => {
                                                        const file = event.target.files?.[0];
                                                        if (!file) return;
                                                        await importFromFile(file);
                                                        event.target.value = '';
                                                    }}
                                                />
                                                <button
                                                    type="button"
                                                    className="plain-action"
                                                    onClick={() => fileInputRef.current?.click()}
                                                >
                                                    上傳 QRCode 圖片
                                                </button>
                                                <button
                                                    type="button"
                                                    className="plain-action"
                                                    onClick={importImageFromClipboard}
                                                >
                                                    從剪貼簿貼上
                                                </button>
                                            </div>
                                        </>
                                    ) : addMode === 'camera' ? (
                                        <>
                                            <label className="wide">
                                                <span>鏡頭掃描結果（otpauth URI）</span>
                                                <textarea
                                                    value={uriInput}
                                                    readOnly
                                                    placeholder="按下方按鈕開啟鏡頭掃描"
                                                />
                                            </label>
                                            <div className="form-actions wide">
                                                <button
                                                    type="button"
                                                    className="plain-action"
                                                    onClick={() => setCameraOpen(true)}
                                                >
                                                    <Camera size={16}/> 開啟鏡頭掃描
                                                </button>
                                            </div>
                                        </>
                                    ) : addMode === 'uri' ? (
                                        <label className="wide">
                                            <span>otpauth URI</span>
                                            <textarea
                                                value={uriInput}
                                                onChange={(event) => setUriInput(event.target.value)}
                                                placeholder="貼上 otpauth://totp/..."
                                            />
                                        </label>
                                    ) : (
                                        <>
                                            <label>
                                                <span>服務名稱</span>
                                                <input value={form.issuer}
                                                       onChange={(event) => setForm({...form, issuer: event.target.value})}
                                                       required/>
                                            </label>
                                            <label>
                                                <span>帳號名稱</span>
                                                <input value={form.name}
                                                       onChange={(event) => setForm({...form, name: event.target.value})}
                                                       required/>
                                            </label>
                                            <label className="wide">
                                                <span>Secret</span>
                                                <input value={form.secret}
                                                       onChange={(event) => setForm({...form, secret: event.target.value})}
                                                       required/>
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
                                        新增
                                    </button>
                                </div>
                            </form>
                    </section>
                )}

                {tab === 'settings' && settings && (
                    <section className="settings-view">
                        <h1>設定</h1>
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
                                <strong>生物驗證</strong>
                                <span>{setup.biometricDescription}</span>
                            </div>
                            <span className="pill">{setup.biometricAvailable ? '可用' : '未接入'}</span>
                        </div>
                        <div className="setting-row">
                            <div>
                                <strong>資料目錄</strong>
                                <span>{setup.userDataPath}</span>
                            </div>
                            <span className="pill">OS user scoped</span>
                        </div>
                    </section>
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
                                        <X size={16}/> 取消
                                    </button>
                                    <button className="primary-action" type="submit">
                                        <Check size={17}/> 更新
                                    </button>
                                </div>
                            </form>
                        </section>
                    </div>
                )}
                {confirmOpen && (
                    <div className="modal-backdrop">
                        <section className="confirm-modal">
                            <h2>確認操作</h2>
                            <p>{confirmMessage}</p>
                            <div className="form-actions">
                                <button type="button" className="plain-action" onClick={() => resolveConfirm(false)}>
                                    取消
                                </button>
                                <button type="button" className="primary-action" onClick={() => resolveConfirm(true)}>
                                    確認
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
            {cameraOpen && <ScannerModal onClose={() => setCameraOpen(false)} onDetected={(uri) => {
                setUriInput(uri);
                setTab('add');
                setAddMode('camera');
                setNotice('已掃描 QRCode');
                setCameraOpen(false);
            }}/>}
        </main>
    );
}

async function extractOtpauthFromImageFile(file: File) {
    return extractOtpauthFromImageBlob(file);
}

async function extractOtpauthFromImageBlob(blob: Blob) {
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

function ScannerModal({onClose, onDetected}: { onClose: () => void; onDetected: (uri: string) => void }) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const frameRef = useRef<number | null>(null);
    const [status, setStatus] = useState('等待相機權限');

    useEffect(() => {
        let active = true;

        async function start() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: 'environment'}, audio: false});
                streamRef.current = stream;
                if (!videoRef.current) return;
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
                setStatus('掃描 otpauth QR code');
                scan();
            } catch (err) {
                setStatus(`相機無法使用：${cleanError(String(err))}`);
            }
        }

        function scan() {
            if (!active || !videoRef.current || !canvasRef.current) return;
            const video = videoRef.current;
            const canvas = canvasRef.current;
            const context = canvas.getContext('2d', {willReadFrequently: true});
            if (context && video.videoWidth && video.videoHeight) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height);
                if (code?.data?.startsWith('otpauth://')) {
                    onDetected(code.data);
                    return;
                }
            }
            frameRef.current = requestAnimationFrame(scan);
        }

        start();
        return () => {
            active = false;
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
            streamRef.current?.getTracks().forEach((track) => track.stop());
        };
    }, [onDetected]);

    return (
        <div className="modal-backdrop">
            <section className="scanner-modal">
                <div className="card-head">
                    <div>
                        <h2>掃描 QR code</h2>
                        <p>{status}</p>
                    </div>
                    <button className="icon-action" onClick={onClose} title="關閉">
                        <X size={19}/>
                    </button>
                </div>
                <video ref={videoRef} muted playsInline/>
                <canvas ref={canvasRef} hidden/>
            </section>
        </div>
    );
}

function groupCode(code: string) {
    return code.replace(/(.{3})/g, '$1 ').trim();
}

function cleanError(value: string) {
    return value.replace(/^Error:\s*/, '').replace(/^main\.App\./, '');
}

export default App;
