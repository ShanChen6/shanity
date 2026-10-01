import '../database/config.js';
export declare class AuthConfig {
    readonly secret: Uint8Array;
    readonly accessSeconds: number;
    readonly refreshSeconds: number;
    readonly origin: string;
    readonly production: boolean;
    readonly googleId: string;
    readonly googleSecret: string;
    readonly googleCallback: string;
    constructor();
    private duration;
    private url;
    cookieName(kind: 'access' | 'refresh' | 'oauth'): string;
    cookieOptions(seconds: number): {
        httpOnly: boolean;
        secure: boolean;
        sameSite: "lax";
        path: string;
        maxAge: number;
    };
}
