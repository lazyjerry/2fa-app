export namespace main {
	
	export class AccountInput {
	    issuer: string;
	    name: string;
	    secret: string;
	    category: string;
	    notes: string;
	    algorithm: string;
	    digits: number;
	    period: number;
	
	    static createFrom(source: any = {}) {
	        return new AccountInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.issuer = source["issuer"];
	        this.name = source["name"];
	        this.secret = source["secret"];
	        this.category = source["category"];
	        this.notes = source["notes"];
	        this.algorithm = source["algorithm"];
	        this.digits = source["digits"];
	        this.period = source["period"];
	    }
	}
	export class AccountView {
	    id: string;
	    issuer: string;
	    name: string;
	    category: string;
	    notes: string;
	    algorithm: string;
	    digits: number;
	    period: number;
	    // Go type: time
	    createdAt: any;
	    // Go type: time
	    updatedAt: any;
	
	    static createFrom(source: any = {}) {
	        return new AccountView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.issuer = source["issuer"];
	        this.name = source["name"];
	        this.category = source["category"];
	        this.notes = source["notes"];
	        this.algorithm = source["algorithm"];
	        this.digits = source["digits"];
	        this.period = source["period"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	        this.updatedAt = this.convertValues(source["updatedAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class CodeView {
	    id: string;
	    issuer: string;
	    name: string;
	    category: string;
	    notes: string;
	    algorithm: string;
	    digits: number;
	    period: number;
	    // Go type: time
	    createdAt: any;
	    // Go type: time
	    updatedAt: any;
	    code: string;
	    timeRemaining: number;
	
	    static createFrom(source: any = {}) {
	        return new CodeView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.issuer = source["issuer"];
	        this.name = source["name"];
	        this.category = source["category"];
	        this.notes = source["notes"];
	        this.algorithm = source["algorithm"];
	        this.digits = source["digits"];
	        this.period = source["period"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	        this.updatedAt = this.convertValues(source["updatedAt"], null);
	        this.code = source["code"];
	        this.timeRemaining = source["timeRemaining"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ImportResult {
	    added: number;
	    skipped: number;
	    total: number;
	
	    static createFrom(source: any = {}) {
	        return new ImportResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.added = source["added"];
	        this.skipped = source["skipped"];
	        this.total = source["total"];
	    }
	}
	export class SecretCheck {
	    empty: boolean;
	    valid: boolean;
	    duplicate: boolean;
	    duplicateLabel: string;
	
	    static createFrom(source: any = {}) {
	        return new SecretCheck(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.empty = source["empty"];
	        this.valid = source["valid"];
	        this.duplicate = source["duplicate"];
	        this.duplicateLabel = source["duplicateLabel"];
	    }
	}
	export class Settings {
	    maskCodes: boolean;
	    autoLockSeconds: number;
	    clipboardClearSeconds: number;
	    screenshotProtection: boolean;
	    theme: string;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.maskCodes = source["maskCodes"];
	        this.autoLockSeconds = source["autoLockSeconds"];
	        this.clipboardClearSeconds = source["clipboardClearSeconds"];
	        this.screenshotProtection = source["screenshotProtection"];
	        this.theme = source["theme"];
	    }
	}
	export class SessionState {
	    unlocked: boolean;
	    accountCount: number;
	    settings: Settings;
	
	    static createFrom(source: any = {}) {
	        return new SessionState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.unlocked = source["unlocked"];
	        this.accountCount = source["accountCount"];
	        this.settings = this.convertValues(source["settings"], Settings);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class SetupState {
	    hasVault: boolean;
	    unlocked: boolean;
	    userDataPath: string;
	    osUserScoped: boolean;
	    platform: string;
	    biometricAvailable: boolean;
	    biometricEnrolled: boolean;
	    biometricDescription: string;
	    screenshotProtection: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SetupState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hasVault = source["hasVault"];
	        this.unlocked = source["unlocked"];
	        this.userDataPath = source["userDataPath"];
	        this.osUserScoped = source["osUserScoped"];
	        this.platform = source["platform"];
	        this.biometricAvailable = source["biometricAvailable"];
	        this.biometricEnrolled = source["biometricEnrolled"];
	        this.biometricDescription = source["biometricDescription"];
	        this.screenshotProtection = source["screenshotProtection"];
	    }
	}
	export class URIAccountInput {
	    uri: string;
	    category: string;
	    notes: string;
	
	    static createFrom(source: any = {}) {
	        return new URIAccountInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.uri = source["uri"];
	        this.category = source["category"];
	        this.notes = source["notes"];
	    }
	}

}

