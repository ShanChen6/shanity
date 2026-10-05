export declare class MediaUrlSigner {
    private readonly secret;
    constructor(secret?: string);
    sign(filePath: string, expires: number): string;
    verify(filePath: string, expires: number, signature: string): void;
}
