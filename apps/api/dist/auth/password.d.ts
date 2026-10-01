export declare const randomToken: () => string;
export declare const digest: (value: string) => string;
export declare function hashPassword(password: string): Promise<string>;
export declare function verifyPassword(password: string, stored: string | null): Promise<boolean>;
