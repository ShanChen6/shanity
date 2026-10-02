import { Foundation1790467200001 } from './202609270001_foundation.js';
import { Community1790467200002 } from './202609270002_community.js';
import { AccessFoundation1790467200003 } from './202609270003_access_foundation.js';
import { Auth1790467200004 } from './202609270004_auth.js';
import { UserUpdateAt1790812800001 } from './202610010001_user_update_at.js';
import { UserAvatar1790899200001 } from './202610020001_user_avatar.js';
import { CourseSchema1790899200002 } from './202610020002_course_schema.js';
export const migrationHistory = [
    {
        legacy: '202609270001_foundation.mjs',
        name: 'Foundation1790467200001',
        timestamp: 1790467200001,
        migration: Foundation1790467200001,
    },
    {
        legacy: '202609270002_community.mjs',
        name: 'Community1790467200002',
        timestamp: 1790467200002,
        migration: Community1790467200002,
    },
    {
        legacy: '202609270003_access_foundation.mjs',
        name: 'AccessFoundation1790467200003',
        timestamp: 1790467200003,
        migration: AccessFoundation1790467200003,
    },
    {
        legacy: '202609270004_auth.mjs',
        name: 'Auth1790467200004',
        timestamp: 1790467200004,
        migration: Auth1790467200004,
    },
    {
        legacy: '202610010001_user_update_at.mjs',
        name: 'UserUpdateAt1790812800001',
        timestamp: 1790812800001,
        migration: UserUpdateAt1790812800001,
    },
    {
        legacy: '202610020001_user_avatar.mjs',
        name: 'UserAvatar1790899200001',
        timestamp: 1790899200001,
        migration: UserAvatar1790899200001,
    },
    {
        legacy: '202610020002_course_schema.mjs',
        name: 'CourseSchema1790899200002',
        timestamp: 1790899200002,
        migration: CourseSchema1790899200002,
    },
];
export const migrations = migrationHistory.map((entry) => entry.migration);
//# sourceMappingURL=index.js.map