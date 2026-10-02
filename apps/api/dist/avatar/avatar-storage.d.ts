export declare const AVATAR_KEY: RegExp;
export declare abstract class AvatarStorage {
    abstract put(key: string, data: Buffer): Promise<void>;
    abstract read(key: string): Promise<Buffer>;
    abstract delete(key: string): Promise<void>;
}
export declare class LocalAvatarStorage extends AvatarStorage {
    private readonly root;
    private path;
    put(key: string, data: Buffer): Promise<void>;
    read(key: string): Promise<NonSharedBuffer>;
    delete(key: string): Promise<void>;
}
