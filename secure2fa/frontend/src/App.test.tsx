import '@testing-library/jest-dom/vitest';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import jsQR from 'jsqr';
import App, {extractOtpauthFromImageBlob} from './App';

const api = vi.hoisted(() => ({
    AddAccount: vi.fn(),
    AddAccountFromURI: vi.fn(),
    ChangePassword: vi.fn(),
    ClearClipboard: vi.fn(),
    CopyCode: vi.fn(),
    CreateVault: vi.fn(),
    DeleteAccount: vi.fn(),
    DisableBiometricUnlock: vi.fn(),
    EnableBiometricUnlock: vi.fn(),
    ExportVaultToFile: vi.fn(),
    GetCodes: vi.fn(),
    GetSetupState: vi.fn(),
    GetSettings: vi.fn(),
    ImportVaultFromFile: vi.fn(),
    LockVault: vi.fn(),
    SaveSettings: vi.fn(),
    UnlockVault: vi.fn(),
    UnlockWithBiometrics: vi.fn(),
    UpdateAccount: vi.fn(),
    ValidateSecret: vi.fn()
}));

vi.mock('../wailsjs/go/main/App', () => api);
vi.mock('jsqr', () => ({default: vi.fn()}));

type MockCode = {
    id: string;
    issuer: string;
    name: string;
    category: string;
    notes: string;
    algorithm: string;
    digits: number;
    period: number;
    code: string;
    timeRemaining: number;
    pinned?: boolean;
};

const defaultSettings = {
    maskCodes: true,
    autoLockSeconds: 300,
    clipboardClearSeconds: 20,
    screenshotProtection: true,
    theme: 'system'
};

let setupState: Record<string, unknown>;
let settings: typeof defaultSettings;
let codes: MockCode[];

function resetBackend(unlocked = true) {
    settings = {...defaultSettings};
    codes = [
        codeView('one', 'GitHub', 'T1'),
        codeView('two', 'Email', 'T2')
    ];
    setupState = {
        hasVault: true,
        unlocked,
        osUserScoped: true,
        screenshotProtection: true,
        platform: 'darwin',
        userDataPath: '/tmp/Secure2FA',
        biometricAvailable: false,
        biometricEnrolled: false,
        biometricEnabled: false,
        biometricDescription: 'Touch ID unavailable'
    };

    api.GetSetupState.mockImplementation(async () => ({...setupState}));
    api.GetCodes.mockImplementation(async () => codes.map((code) => ({...code})));
    api.GetSettings.mockImplementation(async () => ({...settings}));
    api.UnlockVault.mockImplementation(async () => {
        setupState.unlocked = true;
        return {unlocked: true, accountCount: codes.length, settings};
    });
    api.CreateVault.mockImplementation(async () => {
        setupState.hasVault = true;
        setupState.unlocked = true;
        return {unlocked: true, accountCount: 0, settings};
    });
    api.LockVault.mockImplementation(async () => {
        setupState.unlocked = false;
    });
    api.CopyCode.mockResolvedValue(undefined);
    api.ClearClipboard.mockResolvedValue(undefined);
    api.SaveSettings.mockImplementation(async (next) => {
        settings = {...next};
        return {...settings};
    });
    api.AddAccountFromURI.mockImplementation(async (input) => {
        const next = codeView('new', 'Imported', input.notes || 'Imported account');
        codes = [next, ...codes];
        return next;
    });
    api.AddAccount.mockImplementation(async (input) => {
        const next = codeView('new', input.issuer, input.notes || input.name);
        codes = [next, ...codes];
        return next;
    });
    api.ValidateSecret.mockResolvedValue({empty: false, valid: true, duplicate: false, duplicateLabel: ''});
    api.DeleteAccount.mockResolvedValue(undefined);
    api.UpdateAccount.mockResolvedValue(undefined);
    api.ChangePassword.mockResolvedValue(undefined);
    api.ExportVaultToFile.mockResolvedValue('');
    api.ImportVaultFromFile.mockResolvedValue({total: 0, added: 0, skipped: 0});
    api.EnableBiometricUnlock.mockResolvedValue(undefined);
    api.DisableBiometricUnlock.mockResolvedValue(undefined);
    api.UnlockWithBiometrics.mockResolvedValue(undefined);
}

function codeView(id: string, issuer: string, notes: string): MockCode {
    return {
        id,
        issuer,
        name: `${issuer.toLowerCase()}@example.com`,
        category: '',
        notes,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        code: '123456',
        timeRemaining: 15,
        pinned: false
    };
}

async function renderUnlockedApp() {
    render(<App/>);
    await screen.findByText('驗證碼');
}

beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('secure2fa.locale', 'zh-TW');
    resetBackend();
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('App flows', () => {
    it('logs in with the master password', async () => {
        resetBackend(false);
        const user = userEvent.setup();
        render(<App/>);

        await user.type(await screen.findByLabelText('主密碼'), 'correct horse battery staple');
        await user.click(screen.getByRole('button', {name: '解鎖'}));

        await waitFor(() => expect(api.UnlockVault).toHaveBeenCalledWith('correct horse battery staple'));
        expect(await screen.findByText('驗證碼')).toBeInTheDocument();
    });

    it('imports an otpauth URI from the add form', async () => {
        const user = userEvent.setup();
        await renderUnlockedApp();

        await user.click(screen.getByRole('button', {name: '新增'}));
        await user.click(screen.getByRole('button', {name: 'URI'}));
        await user.type(screen.getByPlaceholderText('名稱'), 'GitHub login');
        await user.type(
            screen.getByPlaceholderText('貼上 otpauth://totp/...'),
            'otpauth://totp/GitHub:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub'
        );
        const submitButtons = screen.getAllByRole('button', {name: '新增'});
        await user.click(submitButtons[submitButtons.length - 1]);
        await user.click(await screen.findByRole('button', {name: '確認'}));

        await waitFor(() => expect(api.AddAccountFromURI).toHaveBeenCalledWith({
            uri: 'otpauth://totp/GitHub:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub',
            category: '',
            notes: 'GitHub login'
        }));
        expect(await screen.findByText('已儲存')).toBeInTheDocument();
    });

    it('filters accounts by search text', async () => {
        const user = userEvent.setup();
        await renderUnlockedApp();

        await user.type(screen.getByPlaceholderText('搜尋 issuer、帳號、分類、名稱'), 'T1');

        expect(screen.getByText('T1')).toBeInTheDocument();
        expect(screen.queryByText('T2')).not.toBeInTheDocument();
    });

    it('copies an account code', async () => {
        const user = userEvent.setup();
        await renderUnlockedApp();

        await user.click(screen.getAllByTitle('複製驗證碼')[0]);

        await waitFor(() => expect(api.CopyCode).toHaveBeenCalledWith('one'));
        expect(await screen.findByText('驗證碼已複製')).toBeInTheDocument();
    });

    it('saves settings changes', async () => {
        const user = userEvent.setup();
        await renderUnlockedApp();

        await user.click(screen.getByRole('button', {name: '設定'}));
        fireEvent.change(await screen.findByDisplayValue('300'), {target: {value: '60'}});

        await waitFor(() => expect(api.SaveSettings).toHaveBeenCalledWith({
            ...defaultSettings,
            autoLockSeconds: 60
        }));
    });

    it('switches UI language to English', async () => {
        const user = userEvent.setup();
        await renderUnlockedApp();

        await user.click(screen.getByRole('button', {name: '設定'}));
        await user.selectOptions(screen.getByDisplayValue('繁體中文'), 'en');

        expect(await screen.findByRole('button', {name: 'Codes'})).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Settings'})).toBeInTheDocument();
    });
});

describe('QR image parsing', () => {
    it('returns otpauth data from a decoded QR image', async () => {
        const close = mockImageDecoder();
        vi.mocked(jsQR).mockReturnValue({
            binaryData: [],
            chunks: [],
            data: 'otpauth://totp/GitHub:user@example.com?secret=JBSWY3DPEHPK3PXP',
            location: {},
            version: 1
        } as never);

        await expect(extractOtpauthFromImageBlob(new Blob(['image']))).resolves.toBe(
            'otpauth://totp/GitHub:user@example.com?secret=JBSWY3DPEHPK3PXP'
        );
        expect(close).toHaveBeenCalled();
    });

    it('rejects images without an otpauth QR code', async () => {
        mockImageDecoder();
        vi.mocked(jsQR).mockReturnValue({
            binaryData: [],
            chunks: [],
            data: 'https://example.com',
            location: {},
            version: 1
        } as never);

        await expect(extractOtpauthFromImageBlob(new Blob(['image']))).rejects.toThrow(
            '圖片中找不到有效的 otpauth QRCode'
        );
    });
});

function mockImageDecoder() {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
        width: 1,
        height: 1,
        close
    })));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        drawImage: vi.fn(),
        getImageData: vi.fn(() => ({
            data: new Uint8ClampedArray(4),
            width: 1,
            height: 1
        }))
    } as unknown as CanvasRenderingContext2D);
    return close;
}
