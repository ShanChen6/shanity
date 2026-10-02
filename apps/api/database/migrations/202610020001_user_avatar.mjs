export async function up(db) {
  await db.schema.alterTable('users', table => {
    table.text('avatar_key').nullable();
  });
}
export async function down() {
  throw new Error('Destructive rollback disabled. Use a reviewed forward migration.');
}
