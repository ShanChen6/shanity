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
    search?: string;
    role?: string;
    status?: string;
    page: number;
    limit: number;
}
export declare class ChangeUserRoleDto {
    role: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';
}
export declare class ChangeUserStatusDto {
    status: 'ACTIVE' | 'DISABLED';
}
export declare class CreateUserDto extends RegisterDto {
    role: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';
}
export declare class UpdateUserDto extends ProfileDto {
    email: string;
}
