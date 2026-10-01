import { hashPassword } from '../../src/auth/password.ts';

export async function seed(db) {
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!email && !password) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD are required in production',
      );
    }
    return;
  }
  if (!email || !password) {
    throw new Error(
      'SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must both be configured',
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('SUPER_ADMIN_EMAIL must be a valid email address');
  }
  if (password.length < 12 || password.length > 128) {
    throw new Error(
      'SUPER_ADMIN_PASSWORD must be between 12 and 128 characters',
    );
  }

  const displayName = process.env.SUPER_ADMIN_NAME?.trim() || 'Super Admin';
  if (displayName.length > 100) {
    throw new Error('SUPER_ADMIN_NAME must be at most 100 characters');
  }

  await db.transaction(async (trx) => {
    let user = await trx('users').where({ email }).first('id');
    if (!user) {
      const passwordHash = await hashPassword(password);
      const [created] = await trx('users')
        .insert({
          email,
          display_name: displayName,
          password_hash: passwordHash,
        })
        .onConflict('email')
        .ignore()
        .returning('id');
      user = created ?? (await trx('users').where({ email }).first('id'));
    }
    if (!user)
      throw new Error('Unable to create or find the configured super admin');

    await trx('user_roles')
      .insert({ user_id: user.id, role_code: 'admin' })
      .onConflict(['user_id', 'role_code'])
      .ignore();
  });
}
