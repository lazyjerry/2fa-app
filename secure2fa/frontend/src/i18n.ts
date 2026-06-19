export type Locale = 'zh-TW' | 'en';

type Dict = Record<string, string>;

const localeStorageKey = 'secure2fa.locale';

const dict: Record<Locale, Dict> = {
    'zh-TW': {
        appName: 'Secure 2FA',
        appSubtitle: '離線驗證碼保險庫',
        password: '主密碼',
        confirmPassword: '確認主密碼',
        unlock: '解鎖',
        createVault: '建立保險庫',
        touchIdUnlock: '使用 Touch ID 解鎖',
        osUserIsolation: 'OS 使用者隔離',
        enabled: '啟用',
        disabled: '未啟用',
        screenshotProtection: '截圖防護',
        platformSupported: '平台支援',
        platformUnsupported: '平台不支援',
        tabCodes: '驗證碼',
        tabAdd: '新增',
        tabSettings: '設定',
        lock: '鎖定',
        searchPlaceholder: '搜尋 issuer、帳號、分類、名稱',
        allCategories: '全部分類',
        uncategorized: '未分類',
        notFilled: '未填寫',
        emptyCodes: '沒有符合條件的驗證碼',
        addButton: '新增',
        modeImage: '圖片',
        modeUri: 'URI',
        modeManual: '手動',
        requiredName: '名稱',
        category: '分類',
        importFromClipboard: '從剪貼簿貼上',
        saveSuccess: '已儲存',
        updateSuccess: '已更新',
        deleted: '已刪除',
        copied: '驗證碼已複製',
        settingsTitle: '設定',
        language: '語言',
        languageHint: '介面語言偏好，未翻譯文案會回退到繁體中文。',
        langZhTW: '繁體中文',
        langEn: 'English',
        settingsUpdated: '設定已更新',
        settingsUpdatedRestart: '設定已更新，請重新啟動 APP 套用截圖防護變更。',
        backupAndRestore: '備份與還原',
        backupAndRestoreHint: '匯出為明文 JSON 備份檔，或從備份檔匯入帳號（重複帳號會自動略過）。',
        export: '匯出',
        import: '匯入',
        importCanceled: '已取消匯入',
        importDone: '匯入完成：新增 {added}、略過重複 {skipped}',
        batchImportTitle: '批次匯入驗證碼',
        batchImportHint: '支援多行 otpauth URI、以及常見 JSON 匯出結構（重複帳號會自動略過）。',
        batchImport: '批次匯入',
        batchImportCanceled: '已取消批次匯入',
        batchImportDone: '批次匯入完成：新增 {added}、略過重複 {skipped}',
        confirmAction: '確認操作',
        cancel: '取消',
        confirm: '確認',
        update: '更新',
        close: '關閉',
        accountName: '帳號',
        serviceName: '服務名稱',
        accountLabel: '帳號名稱',
        issuer: '名稱',
        otpUri: 'otpauth URI',
        qrResult: 'QRCode 解析結果（otpauth URI）',
        qrPlaceholder: '先上傳圖片或直接貼上 QRCode 圖片',
        uriPlaceholder: '貼上 otpauth://totp/...',
        nameRequiredError: '名稱為必填'
    },
    en: {
        appName: 'Secure 2FA',
        appSubtitle: 'Offline Authenticator Vault',
        password: 'Master Password',
        confirmPassword: 'Confirm Master Password',
        unlock: 'Unlock',
        createVault: 'Create Vault',
        touchIdUnlock: 'Unlock with Touch ID',
        osUserIsolation: 'OS User Isolation',
        enabled: 'Enabled',
        disabled: 'Disabled',
        screenshotProtection: 'Screenshot Protection',
        platformSupported: 'Supported',
        platformUnsupported: 'Unsupported',
        tabCodes: 'Codes',
        tabAdd: 'Add',
        tabSettings: 'Settings',
        lock: 'Lock',
        searchPlaceholder: 'Search issuer, account, category, or label',
        allCategories: 'All Categories',
        uncategorized: 'Uncategorized',
        notFilled: 'Not set',
        emptyCodes: 'No matching accounts',
        addButton: 'Add',
        modeImage: 'Image',
        modeUri: 'URI',
        modeManual: 'Manual',
        requiredName: 'Label',
        category: 'Category',
        importFromClipboard: 'Paste from Clipboard',
        saveSuccess: 'Saved',
        updateSuccess: 'Updated',
        deleted: 'Deleted',
        copied: 'Code copied',
        settingsTitle: 'Settings',
        language: 'Language',
        languageHint: 'UI language preference. Missing keys fall back to Traditional Chinese.',
        langZhTW: 'Traditional Chinese',
        langEn: 'English',
        settingsUpdated: 'Settings updated',
        settingsUpdatedRestart: 'Settings updated. Restart the app to apply screenshot protection changes.',
        backupAndRestore: 'Backup and Restore',
        backupAndRestoreHint: 'Export plaintext JSON backup or import accounts from backup files. Duplicate entries are skipped.',
        export: 'Export',
        import: 'Import',
        importCanceled: 'Import canceled',
        importDone: 'Import complete: added {added}, skipped {skipped}',
        batchImportTitle: 'Batch Import Accounts',
        batchImportHint: 'Supports multi-line otpauth URIs and common JSON export structures. Duplicate entries are skipped.',
        batchImport: 'Batch Import',
        batchImportCanceled: 'Batch import canceled',
        batchImportDone: 'Batch import complete: added {added}, skipped {skipped}',
        confirmAction: 'Confirm Action',
        cancel: 'Cancel',
        confirm: 'Confirm',
        update: 'Update',
        close: 'Close',
        accountName: 'Account',
        serviceName: 'Service',
        accountLabel: 'Account Name',
        issuer: 'Name',
        otpUri: 'otpauth URI',
        qrResult: 'QR Parse Result (otpauth URI)',
        qrPlaceholder: 'Upload an image or paste a QR image',
        uriPlaceholder: 'Paste otpauth://totp/...',
        nameRequiredError: 'Name is required'
    }
};

export function loadLocale(): Locale {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(localeStorageKey) : null;
    if (saved === 'zh-TW' || saved === 'en') {
        return saved;
    }
    if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh')) {
        return 'zh-TW';
    }
    return 'en';
}

export function saveLocale(locale: Locale) {
    if (typeof window === 'undefined') {
        return;
    }
    window.localStorage.setItem(localeStorageKey, locale);
}

export function tr(locale: Locale, key: string, params: Record<string, string | number> = {}) {
    const template = dict[locale][key] ?? dict['zh-TW'][key] ?? key;
    return template.replace(/\{(\w+)\}/g, (_match, token) => String(params[token] ?? `{${token}}`));
}
