export class UserAvatar1790899200001 {
    async up(queryRunner) {
        await queryRunner.query('ALTER TABLE users ADD COLUMN avatar_key text');
    }
    async down(_queryRunner) {
        throw new Error('Destructive rollback disabled. Use a reviewed forward migration.');
    }
}
//# sourceMappingURL=202610020001_user_avatar.js.map