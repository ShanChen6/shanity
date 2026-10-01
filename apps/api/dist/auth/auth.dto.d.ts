export declare class LoginDto {
    email: string;
    password: string;
}
export declare class RegisterDto extends LoginDto {
    displayName: string;
}
export declare class ProfileDto {
    displayName: string;
}
export declare class ListUsersQueryDto {
    page: number;
    limit: number;
}
