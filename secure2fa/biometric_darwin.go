//go:build darwin

package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Foundation -framework Security -framework LocalAuthentication
#import <Foundation/Foundation.h>
#import <Security/Security.h>
#import <LocalAuthentication/LocalAuthentication.h>
#include <stdlib.h>
#include <string.h>

static int secure2faBiometricAvailable(void) {
    @autoreleasepool {
        LAContext *ctx = [[LAContext alloc] init];
        NSError *err = nil;
        BOOL ok = [ctx canEvaluatePolicy:LAPolicyDeviceOwnerAuthenticationWithBiometrics error:&err];
        return ok ? 1 : 0;
    }
}

static OSStatus secure2faBiometricStore(const char *service, const char *account, const char *secret) {
    @autoreleasepool {
        NSString *svc = [NSString stringWithUTF8String:service];
        NSString *acct = [NSString stringWithUTF8String:account];
        NSData *data = [NSData dataWithBytes:secret length:strlen(secret)];

        NSDictionary *del = @{
            (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
            (__bridge id)kSecAttrService: svc,
            (__bridge id)kSecAttrAccount: acct,
        };
        SecItemDelete((__bridge CFDictionaryRef)del);

        CFErrorRef cfErr = NULL;
        SecAccessControlRef access = SecAccessControlCreateWithFlags(
            kCFAllocatorDefault,
            kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
            kSecAccessControlBiometryCurrentSet,
            &cfErr);
        if (access == NULL) {
            if (cfErr) CFRelease(cfErr);
            return errSecParam;
        }
        NSDictionary *add = @{
            (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
            (__bridge id)kSecAttrService: svc,
            (__bridge id)kSecAttrAccount: acct,
            (__bridge id)kSecValueData: data,
            (__bridge id)kSecAttrAccessControl: (__bridge id)access,
        };
        OSStatus status = SecItemAdd((__bridge CFDictionaryRef)add, NULL);
        CFRelease(access);
        return status;
    }
}

// secure2faBiometricLoad triggers the Touch ID prompt synchronously. On success
// the caller owns *out and must free() it.
// kSecUseOperationPrompt is deprecated but remains the simplest synchronous way
// to attach a prompt to a gated SecItem read; the replacement requires an
// LAContext round-trip we do not need here.
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
static OSStatus secure2faBiometricLoad(const char *service, const char *account, const char *reason, char **out, int *outLen) {
    @autoreleasepool {
        NSString *svc = [NSString stringWithUTF8String:service];
        NSString *acct = [NSString stringWithUTF8String:account];
        NSString *prompt = [NSString stringWithUTF8String:reason];
        NSDictionary *query = @{
            (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
            (__bridge id)kSecAttrService: svc,
            (__bridge id)kSecAttrAccount: acct,
            (__bridge id)kSecReturnData: @YES,
            (__bridge id)kSecMatchLimit: (__bridge id)kSecMatchLimitOne,
            (__bridge id)kSecUseOperationPrompt: prompt,
        };
        CFTypeRef result = NULL;
        OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
        if (status != errSecSuccess) {
            return status;
        }
        CFDataRef data = (CFDataRef)result;
        CFIndex len = CFDataGetLength(data);
        char *buf = malloc((size_t)len);
        memcpy(buf, CFDataGetBytePtr(data), (size_t)len);
        CFRelease(data);
        *out = buf;
        *outLen = (int)len;
        return errSecSuccess;
    }
}
#pragma clang diagnostic pop

static int secure2faBiometricExists(const char *service, const char *account) {
    @autoreleasepool {
        NSString *svc = [NSString stringWithUTF8String:service];
        NSString *acct = [NSString stringWithUTF8String:account];
        NSDictionary *query = @{
            (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
            (__bridge id)kSecAttrService: svc,
            (__bridge id)kSecAttrAccount: acct,
            (__bridge id)kSecUseAuthenticationUI: (__bridge id)kSecUseAuthenticationUISkip,
            (__bridge id)kSecMatchLimit: (__bridge id)kSecMatchLimitOne,
        };
        CFTypeRef result = NULL;
        OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
        if (result) CFRelease(result);
        if (status == errSecSuccess || status == errSecInteractionNotAllowed) {
            return 1;
        }
        return 0;
    }
}

static OSStatus secure2faBiometricDelete(const char *service, const char *account) {
    @autoreleasepool {
        NSString *svc = [NSString stringWithUTF8String:service];
        NSString *acct = [NSString stringWithUTF8String:account];
        NSDictionary *del = @{
            (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
            (__bridge id)kSecAttrService: svc,
            (__bridge id)kSecAttrAccount: acct,
        };
        OSStatus status = SecItemDelete((__bridge CFDictionaryRef)del);
        if (status == errSecItemNotFound) {
            return errSecSuccess;
        }
        return status;
    }
}
*/
import "C"

import (
	"errors"
	"unsafe"
)

const (
	biometricService = "Secure2FA"
	biometricAccount = "vault-master-password"
)

func biometricAvailable() bool {
	return C.secure2faBiometricAvailable() == 1
}

func biometricStatus() string {
	if biometricAvailable() {
		return "可用 Touch ID 解鎖（需先以主密碼啟用）。"
	}
	return "此 Mac 未偵測到可用的 Touch ID。"
}

func biometricEnrolled() bool {
	cs, ca := C.CString(biometricService), C.CString(biometricAccount)
	defer C.free(unsafe.Pointer(cs))
	defer C.free(unsafe.Pointer(ca))
	return C.secure2faBiometricExists(cs, ca) == 1
}

func biometricStoreSecret(secret string) error {
	cs, ca := C.CString(biometricService), C.CString(biometricAccount)
	csec := C.CString(secret)
	defer C.free(unsafe.Pointer(cs))
	defer C.free(unsafe.Pointer(ca))
	defer C.free(unsafe.Pointer(csec))
	if C.secure2faBiometricStore(cs, ca, csec) != 0 {
		return errors.New("failed to store credential in keychain")
	}
	return nil
}

func biometricLoadSecret(reason string) (string, error) {
	cs, ca := C.CString(biometricService), C.CString(biometricAccount)
	cr := C.CString(reason)
	defer C.free(unsafe.Pointer(cs))
	defer C.free(unsafe.Pointer(ca))
	defer C.free(unsafe.Pointer(cr))

	var out *C.char
	var outLen C.int
	if C.secure2faBiometricLoad(cs, ca, cr, &out, &outLen) != 0 {
		return "", errors.New("biometric unlock cancelled or failed")
	}
	defer C.free(unsafe.Pointer(out))
	return C.GoStringN(out, outLen), nil
}

func biometricDeleteSecret() error {
	cs, ca := C.CString(biometricService), C.CString(biometricAccount)
	defer C.free(unsafe.Pointer(cs))
	defer C.free(unsafe.Pointer(ca))
	if C.secure2faBiometricDelete(cs, ca) != 0 {
		return errors.New("failed to remove credential from keychain")
	}
	return nil
}
